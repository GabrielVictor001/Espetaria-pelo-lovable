import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, badRequest, notFound } from '../lib/http';
import { requireAdmin, requireAuth } from '../lib/auth';
import { logActivity } from '../lib/activity';
import {
  createProduct,
  deleteProduct,
  listCategories,
  listProducts,
  searchProducts,
  updateProduct,
} from '../services/products';

const router = Router();
router.use(requireAuth);

/** Busca inteligente (mesmo motor da IA): tolera erro de digitação e apelidos. */
router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const limit = Math.min(30, Math.max(1, Number(req.query.limit ?? 8)));
    if (!q) return res.json({ results: [] });
    const results = await searchProducts(q, limit);
    res.json({ results, understood: results[0]?.name ?? null });
  }),
);

router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    res.json({ categories: await listCategories() });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = req.query.q ? String(req.query.q) : undefined;
    const category = req.query.category ? String(req.query.category) : undefined;
    const includeInactive = String(req.query.all ?? '') === 'true' && req.user?.role === 'admin';
    res.json({ products: await listProducts({ q, category, includeInactive }) });
  }),
);

const productSchema = z.object({
  name: z.string().min(2, 'Informe o nome do produto.').max(100),
  price: z.coerce.number().min(0, 'Preço inválido.').max(1000000),
  category: z.string().max(50).optional(),
  description: z.string().max(255).optional(),
  keywords: z.string().max(255).optional(),
  favorite: z.boolean().optional(),
});

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = productSchema.parse(req.body);
    const product = await createProduct(body);
    await logActivity(req.user, 'criar_produto', 'product', product.id, `${product.name} • R$ ${product.price}`);
    res.status(201).json({ product });
  }),
);

router.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = productSchema.partial().extend({ active: z.boolean().optional() }).parse(req.body ?? {});
    const product = await updateProduct(Number(req.params.id), body);
    if (!product) throw notFound('Produto não encontrado.');
    await logActivity(req.user, 'editar_produto', 'product', product.id, `${product.name} atualizado`);
    res.json({ product });
  }),
);

router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!id) throw badRequest('Produto inválido.');
    const result = await deleteProduct(id);
    await logActivity(
      req.user,
      result.deleted ? 'excluir_produto' : 'desativar_produto',
      'product',
      id,
      result.deleted ? 'Produto excluído' : 'Produto desativado (já possui vendas)',
    );
    res.json({ ok: true, ...result });
  }),
);

export default router;
