import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/http';
import { requireAdmin, requireAuth } from '../lib/auth';
import { adminOverview, cleanupPreview, exportBackup, listActivity, runCleanup, userStats } from '../services/admin';
import { getOverview } from '../services/insights';
import { query } from '../db';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const [admin, overview] = await Promise.all([adminOverview(), getOverview()]);
    res.json({ ...admin, overview });
  }),
);

router.get(
  '/insights',
  asyncHandler(async (_req, res) => {
    res.json(await getOverview());
  }),
);

router.get(
  '/activity',
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit ?? 100);
    const offset = Number(req.query.offset ?? 0);
    res.json({ activity: await listActivity(limit, offset) });
  }),
);

router.get(
  '/cleanup/preview',
  asyncHandler(async (_req, res) => {
    res.json({ preview: await cleanupPreview() });
  }),
);

/** O botão de LIMPEZA. */
router.post(
  '/cleanup',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        action: z.enum([
          'sync_status',
          'close_empty_tables',
          'purge_closed_orders',
          'purge_canceled_items',
          'clear_ai_history',
          'clear_activity_log',
          'reset_operational',
          'factory_reset',
        ]),
        days: z.coerce.number().int().min(0).max(3650).optional(),
        keep_logs: z.coerce.number().int().min(0).max(100000).optional(),
        confirm: z.boolean().optional(),
      })
      .parse(req.body ?? {});

    const result = await runCleanup(body.action, body, req.user!);
    res.json({ result, preview: await cleanupPreview() });
  }),
);

router.get(
  '/backup',
  asyncHandler(async (_req, res) => {
    const backup = await exportBackup();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="backup-espetaria-${new Date().toISOString().slice(0, 10)}.json"`);
    res.send(JSON.stringify(backup, null, 2));
  }),
);

router.get(
  '/users/:id/stats',
  asyncHandler(async (req, res) => {
    res.json({ stats: await userStats(Number(req.params.id)) });
  }),
);

/** Fechamento de caixa do período (usado no relatório). */
router.get(
  '/reports/sales',
  asyncHandler(async (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days ?? 7)));
    const byDay = await query<any>(`
      SELECT TO_CHAR(o.closed_at, 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS orders,
             COALESCE(SUM(o.total_amount), 0) AS subtotal,
             COALESCE(SUM(o.service_fee), 0) AS service_fees,
             COALESCE(SUM(o.discount), 0) AS discounts,
             COALESCE(SUM(o.total_amount + o.service_fee - o.discount), 0) AS total,
             COALESCE(SUM(o.people_count), 0)::int AS people
        FROM orders o
       WHERE o.status = 'closed' AND o.closed_at >= CURRENT_DATE - ($1 || ' days')::interval
       GROUP BY 1 ORDER BY 1 DESC
    `, [days]);

    const byMethod = await query<any>(`
      SELECT p.method, COUNT(*)::int AS payments, COALESCE(SUM(p.amount), 0) AS amount
        FROM payments p JOIN orders o ON o.id = p.order_id
       WHERE o.closed_at >= CURRENT_DATE - ($1 || ' days')::interval
       GROUP BY 1 ORDER BY amount DESC
    `, [days]);

    const byWaiter = await query<any>(`
      SELECT COALESCE(u.name, 'Sem operador') AS waiter, COUNT(*)::int AS orders,
             COALESCE(SUM(o.total_amount + o.service_fee - o.discount), 0) AS total
        FROM orders o LEFT JOIN users u ON u.id = o.closed_by
       WHERE o.status = 'closed' AND o.closed_at >= CURRENT_DATE - ($1 || ' days')::interval
       GROUP BY 1 ORDER BY total DESC
    `, [days]);

    const topProducts = await query<any>(`
      SELECT p.name, p.category, SUM(i.quantity)::int AS qty, SUM(i.quantity * i.unit_price) AS revenue
        FROM order_items i JOIN orders o ON o.id = i.order_id JOIN products p ON p.id = i.product_id
       WHERE o.status = 'closed' AND i.status = 'active' AND o.closed_at >= CURRENT_DATE - ($1 || ' days')::interval
       GROUP BY p.name, p.category ORDER BY qty DESC LIMIT 20
    `, [days]);

    const canceled = await query<any>(`
      SELECT p.name, COUNT(*)::int AS times, SUM(i.quantity)::int AS qty, ub.name AS canceled_by_name
        FROM order_items i JOIN products p ON p.id = i.product_id
        LEFT JOIN users ub ON ub.id = i.canceled_by
       WHERE i.status = 'canceled' AND i.canceled_at >= CURRENT_DATE - ($1 || ' days')::interval
       GROUP BY p.name, ub.name ORDER BY times DESC LIMIT 15
    `, [days]);

    res.json({
      days,
      by_day: byDay.map((r: any) => ({
        day: r.day,
        orders: r.orders,
        subtotal: Number(r.subtotal),
        service_fees: Number(r.service_fees),
        discounts: Number(r.discounts),
        total: Number(r.total),
        people: r.people,
        avg_ticket: r.orders ? Number((Number(r.total) / r.orders).toFixed(2)) : 0,
      })),
      by_method: byMethod.map((r: any) => ({ ...r, amount: Number(r.amount) })),
      by_waiter: byWaiter.map((r: any) => ({ ...r, total: Number(r.total) })),
      top_products: topProducts.map((r: any) => ({ ...r, revenue: Number(r.revenue) })),
      canceled_items: canceled,
    });
  }),
);

export default router;
