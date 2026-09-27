/**
 * Regras de negócio do salão: abrir mesa, lançar item, cancelar item (X),
 * trocar comanda, fechar conta, transferir mesa.
 */
import { getDb, num, one, query, scalar, transaction, type Db } from '../db';
import { badRequest, conflict, notFound } from '../lib/http';
import { logActivity } from '../lib/activity';
import type { AuthUser } from '../lib/auth';

export const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export interface ItemRow {
  id: number;
  product_id: number;
  product_name: string;
  category: string | null;
  command_name: string;
  quantity: number;
  unit_price: string;
  notes: string | null;
  status: string;
  created_at: string;
  added_by_name: string | null;
  canceled_at: string | null;
  canceled_by_name: string | null;
  cancel_reason: string | null;
}

export interface OrderItemView {
  id: number;
  product_id: number;
  name: string;
  category: string | null;
  command_name: string;
  quantity: number;
  unit_price: number;
  total: number;
  notes: string | null;
  status: 'active' | 'canceled';
  created_at: string;
  added_by_name: string | null;
  canceled_at: string | null;
  canceled_by_name: string | null;
  cancel_reason: string | null;
}

export interface CommandView {
  name: string;
  items: OrderItemView[];
  subtotal: number;
  total: number;
  active_count: number;
  canceled_count: number;
}

export interface OrderView {
  id: number;
  table_id: number;
  table_number: number;
  status: string;
  created_at: string;
  opened_by_name: string | null;
  people_count: number;
  discount: number;
  service_fee: number;
  notes: string | null;
  subtotal: number;
  total: number;
  canceled_total: number;
  items: OrderItemView[];
  commands: CommandView[];
  active_count: number;
  total_count: number;
}

const ITEM_SELECT = `
  SELECT i.id, i.product_id, p.name AS product_name, p.category, i.command_name, i.quantity,
         i.unit_price, i.notes, i.status, i.created_at, i.canceled_at, i.cancel_reason,
         ub.name AS added_by_name, cb.name AS canceled_by_name
    FROM order_items i
    JOIN products p ON p.id = i.product_id
    LEFT JOIN users ub ON ub.id = i.added_by
    LEFT JOIN users cb ON cb.id = i.canceled_by
`;

function mapItem(row: ItemRow): OrderItemView {
  const qty = Number(row.quantity);
  const price = num(row.unit_price);
  return {
    id: row.id,
    product_id: row.product_id,
    name: row.product_name,
    category: row.category,
    command_name: row.command_name || 'Geral',
    quantity: qty,
    unit_price: price,
    total: round2(qty * price),
    notes: row.notes,
    status: row.status === 'canceled' ? 'canceled' : 'active',
    created_at: row.created_at,
    added_by_name: row.added_by_name,
    canceled_at: row.canceled_at,
    canceled_by_name: row.canceled_by_name,
    cancel_reason: row.cancel_reason,
  };
}

/** Recalcula o total da conta a partir dos itens ativos. Sempre chamado após mudanças. */
export async function recalcOrder(db: Db, orderId: number) {
  const subtotal = num(
    await scalar<string>(
      `SELECT COALESCE(SUM(quantity * unit_price), 0) FROM order_items WHERE order_id = $1 AND status = 'active'`,
      [orderId],
    ),
  );
  const rounded = round2(subtotal);
  await db.query('UPDATE orders SET total_amount = $2 WHERE id = $1', [orderId, rounded]);
  return rounded;
}

/* ------------------------------------------------------------ LISTAGEM ---- */
export async function listTables() {
  const rows = await query<any>(`
    SELECT t.id, t.number, t.status, t.seats, t.zone, t.updated_at,
           o.id AS order_id, o.created_at AS opened_at, o.people_count, o.total_amount, o.service_fee, o.discount,
           u.name AS waiter_name,
           (SELECT COUNT(*)::int FROM order_items i WHERE i.order_id = o.id AND i.status = 'active') AS items_count,
           (SELECT COALESCE(SUM(i.quantity), 0)::int FROM order_items i WHERE i.order_id = o.id AND i.status = 'active') AS items_quantity,
           (SELECT STRING_AGG(p.name || ' x' || i.quantity, ', ' ORDER BY i.created_at)
              FROM order_items i JOIN products p ON p.id = i.product_id
             WHERE i.order_id = o.id AND i.status = 'active') AS items_preview
      FROM tables t
      LEFT JOIN orders o ON o.table_id = t.id AND o.status = 'open'
      LEFT JOIN users u ON u.id = o.opened_by
     ORDER BY t.number
  `);

  return rows.map((r) => {
    const subtotal = num(r.total_amount);
    const fee = num(r.service_fee);
    const discount = num(r.discount);
    return {
      id: r.id,
      number: r.number,
      status: r.status === 'occupied' || r.status === 'closing' ? r.status : 'free',
      seats: r.seats,
      zone: r.zone,
      updated_at: r.updated_at,
      occupied: !!r.order_id,
      order: r.order_id
        ? {
            id: r.order_id,
            opened_at: r.opened_at,
            people_count: r.people_count,
            waiter_name: r.waiter_name,
            items_count: r.items_count,
            items_quantity: r.items_quantity,
            items_preview: r.items_preview,
            subtotal,
            service_fee: fee,
            discount,
            total: round2(subtotal + fee - discount),
            minutes_open: Math.max(0, Math.round((Date.now() - new Date(r.opened_at).getTime()) / 60000)),
          }
        : null,
    };
  });
}

export interface TableDetail {
  table: { id: number; number: number; status: string; seats: number; zone: string };
  order: OrderView | null;
  next_order_number: number;
}

export async function getTableDetail(tableId: number): Promise<TableDetail> {
  const table = await one<any>('SELECT id, number, status, seats, zone FROM tables WHERE id = $1', [tableId]);
  if (!table) throw notFound('Mesa não encontrada.');

  const orderRow = await one<any>(
    `SELECT id, table_id, status, created_at, opened_by, people_count, discount, service_fee, notes, total_amount
       FROM orders WHERE table_id = $1 AND status = 'open' LIMIT 1`,
    [tableId],
  );

  const order = orderRow ? await buildOrderView(orderRow) : null;
  const nextNumber = Number((await scalar<number>('SELECT COALESCE(MAX(id), 0) + 1 FROM orders')) ?? 1);

  return {
    table: { ...table, status: order ? (table.status === 'free' ? 'occupied' : table.status) : 'free' },
    order,
    next_order_number: nextNumber,
  };
}

export async function buildOrderView(orderRow: any): Promise<OrderView> {
  const items = (
    await query<ItemRow>(`${ITEM_SELECT} WHERE i.order_id = $1 ORDER BY i.status, i.created_at, i.id`, [orderRow.id])
  ).map(mapItem);

  const tableRow = await one<any>('SELECT number FROM tables WHERE id = $1', [orderRow.table_id]);
  const opener = orderRow.opened_by
    ? await one<any>('SELECT name FROM users WHERE id = $1', [orderRow.opened_by])
    : null;

  const active = items.filter((i) => i.status === 'active');
  const subtotal = round2(active.reduce((s, i) => s + i.total, 0));
  const canceledTotal = round2(items.filter((i) => i.status === 'canceled').reduce((s, i) => s + i.total, 0));
  const discount = num(orderRow.discount);
  const serviceFee = num(orderRow.service_fee);

  const commandsMap = new Map<string, OrderItemView[]>();
  for (const item of items) {
    const key = item.command_name || 'Geral';
    if (!commandsMap.has(key)) commandsMap.set(key, []);
    commandsMap.get(key)!.push(item);
  }
  const commands: CommandView[] = [...commandsMap.entries()].map(([name, list]) => {
    const listActive = list.filter((i) => i.status === 'active');
    const sub = round2(listActive.reduce((s, i) => s + i.total, 0));
    return {
      name,
      items: list,
      subtotal: sub,
      total: sub,
      active_count: listActive.length,
      canceled_count: list.length - listActive.length,
    };
  });

  return {
    id: orderRow.id,
    table_id: orderRow.table_id,
    table_number: tableRow?.number ?? 0,
    status: orderRow.status,
    created_at: orderRow.created_at,
    opened_by_name: opener?.name ?? null,
    people_count: orderRow.people_count ?? 1,
    discount,
    service_fee: serviceFee,
    notes: orderRow.notes ?? null,
    subtotal,
    total: round2(subtotal + serviceFee - discount),
    canceled_total: canceledTotal,
    items,
    commands,
    active_count: active.length,
    total_count: items.length,
  };
}

export async function getOrderView(orderId: number) {
  const row = await one<any>('SELECT * FROM orders WHERE id = $1', [orderId]);
  if (!row) throw notFound('Comanda não encontrada.');
  return buildOrderView(row);
}

/* --------------------------------------------------------- ABRIR MESA ---- */
export async function openTable(tableId: number, user: AuthUser, people = 1) {
  return transaction(async (tx) => {
    const table = await one<any>('SELECT id, number, status FROM tables WHERE id = $1', [tableId]);
    if (!table) throw notFound('Mesa não encontrada.');

    const existing = await one<any>("SELECT id FROM orders WHERE table_id = $1 AND status = 'open'", [tableId]);
    if (existing) throw conflict(`A mesa ${table.number} já está aberta.`);

    const order = await one<any>(
      `INSERT INTO orders (table_id, status, opened_by, people_count)
       VALUES ($1, 'open', $2, $3) RETURNING id`,
      [tableId, user.id, Math.max(1, people)],
    );
    await tx.query("UPDATE tables SET status = 'occupied', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [tableId]);
    await logActivity(user, 'abrir_mesa', 'table', tableId, `Mesa ${table.number} aberta com ${people} pessoa(s)`, tx);
    return order!.id as number;
  });
}

/* -------------------------------------------------------- LANÇAR ITEM ----- */
export async function addItem(
  input: { order_id?: number; table_id?: number; product_id: number; quantity?: number; command_name?: string; notes?: string },
  user: AuthUser,
): Promise<{ item_id: number; order_id: number }> {
  if (!input.order_id && !input.table_id) throw badRequest('Informe a mesa ou a comanda.');
  if (!input.product_id) throw badRequest('Informe o produto.');
  const quantity = Math.max(1, Math.trunc(Number(input.quantity ?? 1)));

  return transaction(async (tx) => {
    let orderId = input.order_id;
    if (!orderId) {
      // lançou direto na mesa -> abre a mesa automaticamente (1 clique + item)
      const table = await one<any>('SELECT id, number FROM tables WHERE id = $1', [input.table_id]);
      if (!table) throw notFound('Mesa não encontrada.');
      const open = await one<any>("SELECT id FROM orders WHERE table_id = $1 AND status = 'open'", [table.id]);
      orderId = open?.id ?? (await openTable(table.id, user, 1));
    }

    const order = await one<any>('SELECT id, status, table_id FROM orders WHERE id = $1', [orderId]);
    if (!order) throw notFound('Comanda não encontrada.');
    if (order.status !== 'open') throw conflict('Esta comanda já foi fechada. Abra uma nova para lançar itens.');

    const product = await one<any>('SELECT id, name, price, active FROM products WHERE id = $1', [input.product_id]);
    if (!product) throw notFound('Produto não encontrado.');
    if (!product.active) throw badRequest(`"${product.name}" está indisponível no cardápio.`);

    const command = (input.command_name || 'Geral').trim().slice(0, 50) || 'Geral';

    const existing = await one<any>(
      `SELECT id, quantity FROM order_items
        WHERE order_id = $1 AND product_id = $2 AND status = 'active'
          AND command_name = $3 AND COALESCE(notes, '') = COALESCE($4, '')
        LIMIT 1`,
      [orderId, product.id, command, input.notes ?? null],
    );

    let itemId: number;
    if (existing) {
      // mesmo produto, mesma comanda, sem observação -> soma a quantidade (menos registros na tela)
      await tx.query('UPDATE order_items SET quantity = quantity + $2 WHERE id = $1', [existing.id, quantity]);
      itemId = existing.id;
    } else {
      const inserted = await one<any>(
        `INSERT INTO order_items (order_id, product_id, command_name, quantity, unit_price, notes, added_by, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active') RETURNING id`,
        [orderId, product.id, command, quantity, product.price, input.notes ?? null, user.id],
      );
      itemId = inserted!.id;
    }

    const finalOrderId = Number(orderId);
    await recalcOrder(tx, finalOrderId);
    await tx.query('UPDATE tables SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [order.table_id]);
    await logActivity(
      user,
      'lancar_item',
      'order_item',
      itemId,
      `${quantity}x ${product.name} (${command}) na comanda #${finalOrderId}`,
      tx,
    );
    return { item_id: itemId, order_id: finalOrderId };
  });
}

/* --------------------------------------------------- QUANTIDADE / NOTA ---- */
export async function updateItem(itemId: number, patch: { quantity?: number; notes?: string | null }, user: AuthUser) {
  return transaction(async (tx) => {
    const item = await one<any>(
      `SELECT i.id, i.order_id, i.quantity, i.status, p.name AS product_name FROM order_items i
         JOIN products p ON p.id = i.product_id WHERE i.id = $1`,
      [itemId],
    );
    if (!item) throw notFound('Item não encontrado.');
    if (item.status !== 'active') throw badRequest('Reative o item antes de alterá-lo.');

    if (patch.quantity !== undefined) {
      const qty = Math.trunc(Number(patch.quantity));
      if (qty < 1) throw badRequest('A quantidade mínima é 1. Use o X para cancelar o item.');
      if (qty > 999) throw badRequest('Quantidade máxima por item: 999.');
      await tx.query('UPDATE order_items SET quantity = $2 WHERE id = $1', [itemId, qty]);
    }
    if (patch.notes !== undefined) {
      await tx.query('UPDATE order_items SET notes = $2 WHERE id = $1', [itemId, patch.notes || null]);
    }
    await recalcOrder(tx, item.order_id);
    await logActivity(user, 'alterar_item', 'order_item', itemId, `${item.product_name} atualizado`, tx);
    return item.order_id as number;
  });
}

/* --------------------------------------------------- CANCELAR (botão X) --- */
export async function cancelItem(itemId: number, user: AuthUser, reason?: string) {
  return transaction(async (tx) => {
    const item = await one<any>(
      `SELECT i.id, i.order_id, i.quantity, i.status, p.name AS product_name FROM order_items i
         JOIN products p ON p.id = i.product_id WHERE i.id = $1`,
      [itemId],
    );
    if (!item) throw notFound('Item não encontrado.');
    if (item.status === 'canceled') throw badRequest('Este item já foi cancelado.');

    await tx.query(
      `UPDATE order_items SET status = 'canceled', canceled_at = CURRENT_TIMESTAMP, canceled_by = $2, cancel_reason = $3
        WHERE id = $1`,
      [itemId, user.id, reason?.slice(0, 120) ?? null],
    );
    await recalcOrder(tx, item.order_id);
    await logActivity(
      user,
      'cancelar_item',
      'order_item',
      itemId,
      `${item.quantity}x ${item.product_name} cancelado${reason ? ` (${reason})` : ''}`,
      tx,
    );
    return item.order_id as number;
  });
}

/** Desfazer cancelamento (segurança contra o toque errado no X). */
export async function restoreItem(itemId: number, user: AuthUser) {
  return transaction(async (tx) => {
    const item = await one<any>('SELECT id, order_id, status FROM order_items WHERE id = $1', [itemId]);
    if (!item) throw notFound('Item não encontrado.');
    if (item.status !== 'canceled') throw badRequest('Este item não está cancelado.');
    await tx.query(
      `UPDATE order_items SET status = 'active', canceled_at = NULL, canceled_by = NULL, cancel_reason = NULL
        WHERE id = $1`,
      [itemId],
    );
    await recalcOrder(tx, item.order_id);
    await logActivity(user, 'reativar_item', 'order_item', itemId, 'Item reativado', tx);
    return item.order_id as number;
  });
}

/** Remove de vez (apenas admin) - usado pela limpeza. */
export async function deleteItem(itemId: number, user: AuthUser) {
  return transaction(async (tx) => {
    const item = await one<any>('SELECT id, order_id FROM order_items WHERE id = $1', [itemId]);
    if (!item) throw notFound('Item não encontrado.');
    await tx.query('DELETE FROM order_items WHERE id = $1', [itemId]);
    await recalcOrder(tx, item.order_id);
    await logActivity(user, 'excluir_item', 'order_item', itemId, 'Item excluído definitivamente', tx);
    return item.order_id as number;
  });
}

/* ------------------------------------------------------ FINALIZAR CONTA -- */
export async function closeOrder(
  orderId: number,
  input: { method?: string; discount?: number; service_fee_percent?: number; service_fee?: number; people_count?: number; notes?: string },
  user: AuthUser,
) {
  return transaction(async (tx) => {
    const order = await one<any>('SELECT id, table_id, status FROM orders WHERE id = $1', [orderId]);
    if (!order) throw notFound('Comanda não encontrada.');
    if (order.status !== 'open') throw conflict('Esta comanda já está fechada.');

    const subtotal = await recalcOrder(tx, orderId);
    const discount = round2(Math.max(0, Number(input.discount ?? 0)));
    let serviceFee: number;
    if (input.service_fee !== undefined) serviceFee = round2(Math.max(0, Number(input.service_fee)));
    else serviceFee = round2(subtotal * (Math.max(0, Number(input.service_fee_percent ?? 0)) / 100));

    const total = round2(Math.max(0, subtotal + serviceFee - discount));
    const method = (input.method || 'cash').toLowerCase();
    if (!['cash', 'pix', 'debit', 'credit', 'other'].includes(method)) throw badRequest('Forma de pagamento inválida.');

    await tx.query(
      `UPDATE orders SET status = 'closed', closed_at = CURRENT_TIMESTAMP, closed_by = $2,
              total_amount = $3, discount = $4, service_fee = $5, people_count = COALESCE($6, people_count),
              notes = COALESCE($7, notes)
        WHERE id = $1`,
      [orderId, user.id, subtotal, discount, serviceFee, input.people_count ?? null, input.notes ?? null],
    );
    await tx.query(
      `INSERT INTO payments (order_id, method, amount, created_by) VALUES ($1, $2, $3, $4)`,
      [orderId, method, total, user.id],
    );
    await tx.query("UPDATE tables SET status = 'free', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [order.table_id]);

    const tableRow = await one<any>('SELECT number FROM tables WHERE id = $1', [order.table_id]);
    await logActivity(
      user,
      'fechar_conta',
      'order',
      orderId,
      `Mesa ${tableRow?.number ?? '-'} fechada | subtotal R$ ${subtotal.toFixed(2)} | taxa R$ ${serviceFee.toFixed(
        2,
      )} | desconto R$ ${discount.toFixed(2)} | total R$ ${total.toFixed(2)} | ${method}`,
      tx,
    );

    return {
      order_id: orderId,
      table_number: tableRow?.number ?? null,
      subtotal,
      service_fee: serviceFee,
      discount,
      total,
      method,
    };
  });
}

/* --------------------------------------------------------- CANCELAR CONTA - */
export async function cancelOrder(orderId: number, user: AuthUser, reason?: string) {
  return transaction(async (tx) => {
    const order = await one<any>('SELECT id, table_id, status FROM orders WHERE id = $1', [orderId]);
    if (!order) throw notFound('Comanda não encontrada.');
    if (order.status !== 'open') throw conflict('Somente comandas abertas podem ser canceladas.');

    await tx.query("UPDATE orders SET status = 'canceled', closed_at = CURRENT_TIMESTAMP, closed_by = $2 WHERE id = $1", [
      orderId,
      user.id,
    ]);
    await tx.query("UPDATE order_items SET status = 'canceled', canceled_at = CURRENT_TIMESTAMP, canceled_by = $2 WHERE order_id = $1 AND status = 'active'", [
      orderId,
      user.id,
    ]);
    await tx.query("UPDATE tables SET status = 'free', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [order.table_id]);
    await logActivity(user, 'cancelar_conta', 'order', orderId, reason || 'Conta cancelada', tx);
    return { order_id: orderId };
  });
}

/* ------------------------------------------------------------ TRANSFERIR -- */
export async function transferTable(fromTableId: number, toNumber: number, user: AuthUser) {
  return transaction(async (tx) => {
    const from = await one<any>('SELECT id, number FROM tables WHERE id = $1', [fromTableId]);
    if (!from) throw notFound('Mesa de origem não encontrada.');
    const to = await one<any>('SELECT id, number FROM tables WHERE number = $1', [toNumber]);
    if (!to) throw notFound(`Mesa ${toNumber} não existe.`);
    if (to.id === from.id) throw badRequest('A mesa de destino é a mesma da origem.');

    const order = await one<any>("SELECT id FROM orders WHERE table_id = $1 AND status = 'open'", [from.id]);
    if (!order) throw conflict(`A mesa ${from.number} não está aberta.`);
    const busy = await one<any>("SELECT id FROM orders WHERE table_id = $1 AND status = 'open'", [to.id]);
    if (busy) throw conflict(`A mesa ${to.number} já está ocupada.`);

    await tx.query('UPDATE orders SET table_id = $2 WHERE id = $1', [order.id, to.id]);
    await tx.query("UPDATE tables SET status = 'free', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [from.id]);
    await tx.query("UPDATE tables SET status = 'occupied', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [to.id]);
    await logActivity(user, 'transferir_mesa', 'table', to.id, `Conta da mesa ${from.number} -> mesa ${to.number}`, tx);
    return { order_id: order.id, to_table: to.number };
  });
}

/* ---------------------------------------------------------- MESA: EDITA --- */
export async function updateTable(tableId: number, patch: { seats?: number; zone?: string }, user: AuthUser) {
  const table = await one<any>('SELECT id, number FROM tables WHERE id = $1', [tableId]);
  if (!table) throw notFound('Mesa não encontrada.');
  await query('UPDATE tables SET seats = COALESCE($2, seats), zone = COALESCE($3, zone), updated_at = CURRENT_TIMESTAMP WHERE id = $1', [
    tableId,
    patch.seats ?? null,
    patch.zone ?? null,
  ]);
  await logActivity(user, 'editar_mesa', 'table', tableId, `Mesa ${table.number} atualizada`);
  return getTableDetail(tableId);
}

export async function updateOrder(orderId: number, patch: { discount?: number; service_fee?: number; people_count?: number; notes?: string }, user: AuthUser) {
  const order = await one<any>('SELECT id, total_amount FROM orders WHERE id = $1', [orderId]);
  if (!order) throw notFound('Comanda não encontrada.');
  await query(
    `UPDATE orders SET discount = COALESCE($2, discount), service_fee = COALESCE($3, service_fee),
            people_count = COALESCE($4, people_count), notes = COALESCE($5, notes)
      WHERE id = $1`,
    [orderId, patch.discount ?? null, patch.service_fee ?? null, patch.people_count ?? null, patch.notes ?? null],
  );
  await logActivity(user, 'editar_conta', 'order', orderId, 'Dados da conta atualizados');
  return getOrderView(orderId);
}

/** Lista de comandas em aberto (usada pela IA e pelo painel). */
export async function listOpenOrders() {
  const rows = await query<any>(`
    SELECT o.id, t.number AS table_number, o.created_at, o.people_count, o.total_amount,
           EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - o.created_at))::int / 60 AS minutes_open,
           (SELECT COUNT(*)::int FROM order_items i WHERE i.order_id = o.id AND i.status = 'active') AS items_count
      FROM orders o JOIN tables t ON t.id = o.table_id
     WHERE o.status = 'open'
     ORDER BY t.number
  `);
  return rows.map((r) => ({ ...r, total_amount: num(r.total_amount), minutes_open: Number(r.minutes_open) || 0 }));
}

/** Itens ativos da conta (para a IA sugerir combinações). */
export async function getOrderProductIds(orderId: number): Promise<number[]> {
  const rows = await query<any>(
    "SELECT DISTINCT product_id FROM order_items WHERE order_id = $1 AND status = 'active'",
    [orderId],
  );
  return rows.map((r) => r.product_id);
}
