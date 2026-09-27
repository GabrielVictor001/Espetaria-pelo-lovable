import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, notFound } from '../lib/http';
import { requireAdmin, requireAuth } from '../lib/auth';
import {
  addItem,
  cancelItem,
  deleteItem,
  getOrderView,
  restoreItem,
  updateItem,
  updateOrder,
} from '../services/orders';
import { suggestForContext } from '../services/ai';

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

ordersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const order = await getOrderView(Number(req.params.id));
    const suggestions = (await suggestForContext({ order_id: order.id, limit: 4 })).suggestions;
    res.json({ order, suggestions });
  }),
);

ordersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        discount: z.coerce.number().min(0).max(100000).optional(),
        service_fee: z.coerce.number().min(0).max(100000).optional(),
        people_count: z.coerce.number().int().min(1).max(99).optional(),
        notes: z.string().max(255).optional(),
      })
      .parse(req.body ?? {});
    res.json({ order: await updateOrder(Number(req.params.id), body, req.user!) });
  }),
);

/** LANÇAR ITEM — aceita order_id (comanda aberta) ou table_id (abre a mesa se preciso). */
ordersRouter.post(
  '/items',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        order_id: z.coerce.number().int().positive().optional(),
        table_id: z.coerce.number().int().positive().optional(),
        product_id: z.coerce.number().int().positive(),
        quantity: z.coerce.number().int().min(1).max(999).default(1),
        command_name: z.string().max(50).optional(),
        notes: z.string().max(255).optional(),
      })
      .parse(req.body ?? {});

    const result = await addItem(body, req.user!);
    const order = await getOrderView(result.order_id);
    const suggestions = (await suggestForContext({ order_id: order.id, limit: 4 })).suggestions;
    res.status(201).json({ ...result, order, suggestions });
  }),
);

/* ------------------------------------------------------------- ITENS ------ */
export const itemsRouter = Router();
itemsRouter.use(requireAuth);

/** O botão "X": cancela o item sem apagar o histórico. */
itemsRouter.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const body = z.object({ reason: z.string().max(120).optional() }).parse(req.body ?? {});
    const orderId = await cancelItem(Number(req.params.id), req.user!, body.reason);
    res.json({ order: await getOrderView(orderId) });
  }),
);

/** Desfazer cancelamento (toque errado no X). */
itemsRouter.post(
  '/:id/restore',
  asyncHandler(async (req, res) => {
    const orderId = await restoreItem(Number(req.params.id), req.user!);
    res.json({ order: await getOrderView(orderId) });
  }),
);

/** Alterar quantidade / observação. */
itemsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        quantity: z.coerce.number().int().min(1).max(999).optional(),
        notes: z.string().max(255).nullable().optional(),
      })
      .parse(req.body ?? {});
    const orderId = await updateItem(Number(req.params.id), body, req.user!);
    res.json({ order: await getOrderView(orderId) });
  }),
);

/** Excluir definitivamente (apenas admin — usado pelo botão de limpeza). */
itemsRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const orderId = await deleteItem(Number(req.params.id), req.user!);
    res.json({ order: await getOrderView(orderId) });
  }),
);

/* -------------------------------------------------- COMANDAS ABERTAS ----- */
ordersRouter.get(
  '/open/list',
  asyncHandler(async (_req, res) => {
    const { listOpenOrders } = await import('../services/orders');
    res.json({ orders: await listOpenOrders() });
  }),
);

/** Recibo da última conta fechada (usado na tela de fechamento). */
ordersRouter.get(
  '/:id/receipt',
  asyncHandler(async (req, res) => {
    const order = await getOrderView(Number(req.params.id));
    if (order.status === 'open') throw notFound('Esta comanda ainda está aberta.');
    res.json({ order });
  }),
);
