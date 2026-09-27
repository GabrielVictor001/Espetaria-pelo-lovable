import { Router } from 'express';
import { z } from 'zod';
import { one } from '../db';
import { asyncHandler, notFound } from '../lib/http';
import { requireAuth } from '../lib/auth';
import {
  cancelOrder,
  closeOrder,
  getTableDetail,
  listTables,
  openTable,
  transferTable,
  updateTable,
} from '../services/orders';
import { getOverview } from '../services/insights';
import { suggestForContext } from '../services/ai';

const router = Router();
router.use(requireAuth);

/** Mapa do salão: todas as mesas + resumo de cada conta aberta. */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [tables, overview] = await Promise.all([listTables(), getOverview()]);
    res.json({ tables, overview });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const detail = await getTableDetail(Number(req.params.id));
    const suggestions = detail.order ? (await suggestForContext({ order_id: detail.order.id, limit: 4 })).suggestions : [];
    res.json({ ...detail, suggestions });
  }),
);

/** ABRIR MESA — um clique. */
router.post(
  '/:id/open',
  asyncHandler(async (req, res) => {
    const body = z.object({ people: z.coerce.number().int().min(1).max(99).default(1) }).parse(req.body ?? {});
    const tableId = Number(req.params.id);
    const orderId = await openTable(tableId, req.user!, body.people);
    const detail = await getTableDetail(tableId);
    res.status(201).json({ order_id: orderId, ...detail });
  }),
);

/** FECHAR CONTA. */
router.post(
  '/:id/close',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        method: z.enum(['cash', 'pix', 'debit', 'credit', 'other']).default('cash'),
        discount: z.coerce.number().min(0).max(100000).optional(),
        service_fee_percent: z.coerce.number().min(0).max(100).optional(),
        service_fee: z.coerce.number().min(0).max(100000).optional(),
        people_count: z.coerce.number().int().min(1).max(99).optional(),
        notes: z.string().max(255).optional(),
      })
      .parse(req.body ?? {});

    const detail = await getTableDetail(Number(req.params.id));
    if (!detail.order) throw notFound('Esta mesa não está aberta.');
    const receipt = await closeOrder(detail.order.id, body, req.user!);
    res.json({ receipt, ...(await getTableDetail(Number(req.params.id))) });
  }),
);

/** CANCELAR CONTA (não apaga o histórico). */
router.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const body = z.object({ reason: z.string().max(120).optional() }).parse(req.body ?? {});
    const detail = await getTableDetail(Number(req.params.id));
    if (!detail.order) throw notFound('Esta mesa não está aberta.');
    await cancelOrder(detail.order.id, req.user!, body.reason);
    res.json(await getTableDetail(Number(req.params.id)));
  }),
);

/** TRANSFERIR MESA. */
router.post(
  '/:id/transfer',
  asyncHandler(async (req, res) => {
    const body = z.object({ to_number: z.coerce.number().int().min(1).max(999) }).parse(req.body ?? {});
    const result = await transferTable(Number(req.params.id), body.to_number, req.user!);
    res.json({ ...result, ...(await getTableDetail(Number(req.params.id))) });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const body = z
      .object({ seats: z.coerce.number().int().min(1).max(50).optional(), zone: z.string().max(30).optional() })
      .parse(req.body ?? {});
    res.json(await updateTable(Number(req.params.id), body, req.user!));
  }),
);

/** Conta (para conferência/impressão) — devolve texto pronto para imprimir. */
router.get(
  '/:id/bill',
  asyncHandler(async (req, res) => {
    const detail = await getTableDetail(Number(req.params.id));
    if (!detail.order) throw notFound('Esta mesa não está aberta.');
    const order = detail.order;
    const settings = await one<any>("SELECT value FROM settings WHERE key = 'restaurant_name'");
    const money = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

    const lines: string[] = [];
    lines.push(settings?.value ?? 'ESPETARIA');
    lines.push(`MESA ${detail.table.number}  •  COMANDA #${order.id}`);
    lines.push(`Aberta em ${new Date(order.created_at).toLocaleString('pt-BR')} por ${order.opened_by_name ?? '-'}`);
    lines.push('--------------------------------');
    for (const item of order.items.filter((i) => i.status === 'active')) {
      lines.push(`${String(item.quantity).padStart(2)}x ${item.name}`.padEnd(32) + money(item.total));
    }
    lines.push('--------------------------------');
    lines.push('Subtotal'.padEnd(32) + money(order.subtotal));
    if (order.service_fee) lines.push(`Taxa de serviço (10%)`.padEnd(32) + money(order.service_fee));
    if (order.discount) lines.push('Desconto'.padEnd(32) + `-${money(order.discount)}`);
    lines.push('TOTAL'.padEnd(32) + money(order.total));
    if (order.commands.length > 1) {
      lines.push('');
      lines.push('Por comanda:');
      for (const c of order.commands) lines.push(`  ${c.name}`.padEnd(32) + money(c.subtotal));
    }
    lines.push('--------------------------------');
    lines.push('Obrigado pela preferência!');

    res.json({ bill: lines.join('\n'), order });
  }),
);

export default router;
