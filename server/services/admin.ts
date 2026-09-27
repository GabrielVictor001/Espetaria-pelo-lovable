/**
 * Painel administrativo + botão de LIMPEZA (organizar a base sem perder histórico útil).
 */
import { query, scalar, transaction, type Db } from '../db';
import { badRequest, notFound } from '../lib/http';
import { logActivity } from '../lib/activity';
import type { AuthUser } from '../lib/auth';

export type CleanupAction =
  | 'sync_status'
  | 'close_empty_tables'
  | 'purge_closed_orders'
  | 'purge_canceled_items'
  | 'clear_ai_history'
  | 'clear_activity_log'
  | 'reset_operational'
  | 'factory_reset';

export interface CleanupResult {
  action: CleanupAction;
  label: string;
  affected: number;
  message: string;
}

export async function cleanupPreview() {
  const [staleTables, emptyOpen, closedOrders, canceledItems, aiLogs, logs] = await Promise.all([
    scalar<number>(`SELECT COUNT(*)::int FROM tables t WHERE t.status <> 'free'
                     AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.table_id = t.id AND o.status = 'open')`),
    scalar<number>(`SELECT COUNT(*)::int FROM orders o WHERE o.status = 'open'
                     AND NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.status = 'active')`),
    scalar<number>(`SELECT COUNT(*)::int FROM orders WHERE status IN ('closed','canceled')`),
    scalar<number>(`SELECT COUNT(*)::int FROM order_items WHERE status = 'canceled'`),
    scalar<number>('SELECT COUNT(*)::int FROM ai_chat_log'),
    scalar<number>('SELECT COUNT(*)::int FROM activity_log'),
  ]);
  return {
    stale_table_status: Number(staleTables ?? 0),
    empty_open_orders: Number(emptyOpen ?? 0),
    closed_orders: Number(closedOrders ?? 0),
    canceled_items: Number(canceledItems ?? 0),
    ai_history: Number(aiLogs ?? 0),
    activity_logs: Number(logs ?? 0),
  };
}

const LABELS: Record<CleanupAction, string> = {
  sync_status: 'Sincronizar status das mesas',
  close_empty_tables: 'Fechar mesas sem consumo',
  purge_closed_orders: 'Apagar contas antigas já fechadas',
  purge_canceled_items: 'Remover itens cancelados',
  clear_ai_history: 'Limpar histórico da IA',
  clear_activity_log: 'Limpar registro de atividades',
  reset_operational: 'Zerar movimento (mantém cardápio e usuários)',
  factory_reset: 'Restauração de fábrica',
};

async function syncStatus(db: Db) {
  const res = await db.query(`
    UPDATE tables t SET status = CASE
      WHEN EXISTS (SELECT 1 FROM orders o WHERE o.table_id = t.id AND o.status = 'open') THEN 'occupied'
      ELSE 'free' END,
      updated_at = CURRENT_TIMESTAMP
    WHERE t.status IS DISTINCT FROM (CASE
      WHEN EXISTS (SELECT 1 FROM orders o WHERE o.table_id = t.id AND o.status = 'open') THEN 'occupied'
      ELSE 'free' END)
  `);
  return res.rowCount;
}

async function closeEmptyTables(db: Db, user: AuthUser) {
  const empties = await db.query<{ id: number }>(`
    SELECT o.id FROM orders o
     WHERE o.status = 'open'
       AND NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.status = 'active')
  `);
  for (const row of empties.rows) {
    await db.query(
      `UPDATE orders SET status = 'canceled', closed_at = CURRENT_TIMESTAMP, closed_by = $2 WHERE id = $1`,
      [row.id, user.id],
    );
  }
  if (empties.rows.length) {
    await db.query(`
      UPDATE tables SET status = 'free', updated_at = CURRENT_TIMESTAMP
       WHERE id IN (SELECT table_id FROM orders WHERE id = ANY($1::int[]))
    `, [empties.rows.map((r) => r.id)]);
  }
  return empties.rows.length;
}

export async function runCleanup(
  action: CleanupAction,
  params: { days?: number; keep_logs?: number; confirm?: boolean },
  user: AuthUser,
): Promise<CleanupResult> {
  const days = Math.max(0, Math.min(3650, Number(params.days ?? 30)));
  const keepLogs = Math.max(0, Math.min(100000, Number(params.keep_logs ?? 500)));
  const label = LABELS[action] ?? action;

  const result = await transaction(async (tx) => {
    switch (action) {
      case 'sync_status': {
        const affected = await syncStatus(tx);
        return { affected, message: `${affected} mesa(s) com status corrigido.` };
      }
      case 'close_empty_tables': {
        const affected = await closeEmptyTables(tx, user);
        await syncStatus(tx);
        return { affected, message: `${affected} mesa(s) sem consumo foram liberadas.` };
      }
      case 'purge_closed_orders': {
        const res = await tx.query(
          `DELETE FROM orders
            WHERE status IN ('closed','canceled')
              AND COALESCE(closed_at, created_at) < CURRENT_TIMESTAMP - ($1 || ' days')::interval`,
          [days],
        );
        return { affected: res.rowCount, message: `${res.rowCount} conta(s) fechada(s) há mais de ${days} dia(s) foram apagadas.` };
      }
      case 'purge_canceled_items': {
        const res = await tx.query(
          `DELETE FROM order_items
            WHERE status = 'canceled'
              AND COALESCE(canceled_at, created_at) < CURRENT_TIMESTAMP - ($1 || ' days')::interval
              AND order_id IN (SELECT id FROM orders WHERE status <> 'open')`,
          [days],
        );
        return { affected: res.rowCount, message: `${res.rowCount} item(ns) cancelado(s) antigos removidos.` };
      }
      case 'clear_ai_history': {
        const res = await tx.query('DELETE FROM ai_chat_log');
        return { affected: res.rowCount, message: `Histórico da IA limpo (${res.rowCount} mensagens).` };
      }
      case 'clear_activity_log': {
        const res = await tx.query(
          `DELETE FROM activity_log WHERE id NOT IN (SELECT id FROM activity_log ORDER BY id DESC LIMIT $1)`,
          [keepLogs],
        );
        return { affected: res.rowCount, message: `Registro de atividades reduzido às ${keepLogs} últimas ações.` };
      }
      case 'reset_operational': {
        if (!params.confirm) throw badRequest('Confirme a operação para zerar o movimento.');
        const before = Number((await tx.query('SELECT COUNT(*)::int AS c FROM orders')).rows[0]?.c ?? 0);
        await tx.query('DELETE FROM payments');
        await tx.query('DELETE FROM order_items');
        await tx.query('DELETE FROM orders');
        await tx.query('DELETE FROM ai_chat_log');
        await tx.query('DELETE FROM activity_log');
        await tx.query("UPDATE tables SET status = 'free', updated_at = CURRENT_TIMESTAMP");
        return { affected: before, message: `Movimento zerado (${before} contas removidas). Cardápio e usuários preservados.` };
      }
      case 'factory_reset': {
        if (!params.confirm) throw badRequest('Confirme a operação para restaurar de fábrica.');
        const { seed } = await import('../db/seed');
        await tx.query('DELETE FROM payments');
        await tx.query('DELETE FROM order_items');
        await tx.query('DELETE FROM orders');
        await tx.query('DELETE FROM ai_chat_log');
        await tx.query('DELETE FROM activity_log');
        await tx.query('DELETE FROM products');
        await tx.query('DELETE FROM users');
        await tx.query("UPDATE tables SET status = 'free', updated_at = CURRENT_TIMESTAMP");
        await seed(tx as Db, { demo: true });
        return { affected: 1, message: 'Restauração de fábrica concluída: cardápio, usuários e dados de demonstração recriados.' };
      }
      default:
        throw badRequest(`Ação de limpeza desconhecida: ${action}`);
    }
  });

  await logActivity(user, 'limpeza', 'cleanup', null, `${label} → ${result.message}`);
  return { action, label, ...result };
}

/* ------------------------------------------------------------ DASHBOARD --- */
export async function adminOverview() {
  const [users, products, tables, openOrders] = await Promise.all([
    query<any>('SELECT id, name, username, role, active, last_login_at FROM users ORDER BY role, name'),
    query<any>('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE active) ::int AS active FROM products'),
    query<any>(`SELECT status, COUNT(*)::int AS total FROM tables GROUP BY status`),
    query<any>(`
      SELECT o.id, t.number AS table_number, o.created_at, o.total_amount, u.name AS waiter_name,
             (SELECT COUNT(*)::int FROM order_items i WHERE i.order_id = o.id AND i.status = 'active') AS items_count,
             EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - o.created_at))::int / 60 AS minutes_open
        FROM orders o JOIN tables t ON t.id = o.table_id LEFT JOIN users u ON u.id = o.opened_by
       WHERE o.status = 'open' ORDER BY o.created_at`),
  ]);

  return {
    users,
    products: { total: products[0]?.total ?? 0, active: products[0]?.active ?? 0 },
    tables: tables.map((t) => ({ status: t.status, total: t.total })),
    open_orders: openOrders.map((o) => ({ ...o, total_amount: Number(o.total_amount), minutes_open: Number(o.minutes_open) })),
    cleanup_preview: await cleanupPreview(),
  };
}

export async function listActivity(limit = 100, offset = 0) {
  return query<any>(
    `SELECT id, user_name, action, entity, entity_id, details, created_at
       FROM activity_log ORDER BY id DESC LIMIT $1 OFFSET $2`,
    [Math.min(500, limit), Math.max(0, offset)],
  );
}

/* --------------------------------------------------------------- BACKUP --- */
export async function exportBackup() {
  const tables = ['users', 'tables', 'products', 'orders', 'order_items', 'payments', 'settings', 'activity_log'];
  const data: Record<string, any[]> = {};
  for (const t of tables) {
    const rows = await query(`SELECT * FROM ${t}`);
    data[t] = rows.map((r: any) => (t === 'users' ? { ...r, password_hash: '***' } : r));
  }
  return {
    generated_at: new Date().toISOString(),
    application: 'Espetaria PDV',
    version: '1.0.0',
    tables: data,
  };
}

export async function userStats(userId: number) {
  const rows = await query<any>(`
    SELECT
      (SELECT COUNT(*)::int FROM orders WHERE opened_by = $1) AS orders_opened,
      (SELECT COUNT(*)::int FROM orders WHERE closed_by = $1) AS orders_closed,
      (SELECT COUNT(*)::int FROM order_items WHERE added_by = $1) AS items_added,
      (SELECT COUNT(*)::int FROM order_items WHERE canceled_by = $1) AS items_canceled,
      (SELECT COALESCE(SUM(total_amount)::numeric(10,2), 0) FROM orders WHERE closed_by = $1 AND status = 'closed') AS revenue
  `, [userId]);
  const row = rows[0];
  if (!row) throw notFound('Usuário não encontrado.');
  return { ...row, revenue: Number(row.revenue) };
}
