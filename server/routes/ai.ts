import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { asyncHandler } from '../lib/http';
import { requireAdmin, requireAuth } from '../lib/auth';
import { logActivity } from '../lib/activity';
import {
  aiChat,
  aiSearch,
  aiSummary,
  getAiSettings,
  publicAiSettings,
  saveAiSettings,
  suggestForContext,
  testAiConnection,
} from '../services/ai';
import { getOverview } from '../services/insights';

const router = Router();
router.use(requireAuth);

/** Conversa com o assistente (com contexto real do salão). */
router.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const body = z
      .object({ message: z.string().min(1, 'Escreva sua pergunta.').max(600), table_id: z.coerce.number().int().positive().optional() })
      .parse(req.body ?? {});

    const reply = await aiChat(body.message, { table_id: body.table_id, user_name: req.user!.name });

    await query(`INSERT INTO ai_chat_log (user_id, role, content, provider) VALUES ($1, 'user', $2, $3)`, [
      req.user!.id,
      body.message,
      reply.provider,
    ]);
    await query(`INSERT INTO ai_chat_log (user_id, role, content, provider) VALUES ($1, 'assistant', $2, $3)`, [
      req.user!.id,
      reply.answer,
      reply.provider,
    ]);

    res.json(reply);
  }),
);

/** Busca inteligente do cardápio. */
router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const limit = Math.min(20, Math.max(1, Number(req.query.limit ?? 8)));
    if (!q) return res.json({ results: [], provider: 'motor local' });
    res.json(await aiSearch(q, limit));
  }),
);

/** Sugestões de venda para a mesa/comanda. */
router.get(
  '/suggest',
  asyncHandler(async (req, res) => {
    res.json(
      await suggestForContext({
        order_id: req.query.order_id ? Number(req.query.order_id) : undefined,
        table_id: req.query.table_id ? Number(req.query.table_id) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 5,
        hint: ['bebida', 'comida', 'doce'].includes(String(req.query.hint)) ? (String(req.query.hint) as any) : undefined,
      }),
    );
  }),
);

/** Resumo gerencial do dia. */
router.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    res.json(await aiSummary());
  }),
);

router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
    const rows = await query<any>(
      `SELECT id, role, content, provider, created_at FROM ai_chat_log ORDER BY id DESC LIMIT $1`,
      [limit],
    );
    res.json({ history: rows.reverse() });
  }),
);

router.delete(
  '/history',
  asyncHandler(async (req, res) => {
    const rows = await query('DELETE FROM ai_chat_log');
    await logActivity(req.user, 'limpar_ia', 'ai_chat_log', null, 'Histórico da IA limpo');
    res.json({ ok: true, removed: rows.length });
  }),
);

/* ------------------------------------------------------- CONFIG (ADMIN) --- */
router.get(
  '/settings',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json({ settings: publicAiSettings(await getAiSettings()) });
  }),
);

router.put(
  '/settings',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        enabled: z.boolean().optional(),
        provider: z.enum(['local', 'openai', 'gemini', 'compatible']).optional(),
        model: z.string().max(80).optional(),
        base_url: z.string().max(200).optional(),
        persona: z.string().max(400).optional(),
        api_key: z.string().max(300).optional(),
      })
      .parse(req.body ?? {});

    const settings = await saveAiSettings({
      enabled: body.enabled,
      provider: body.provider,
      model: body.model,
      baseUrl: body.base_url,
      persona: body.persona,
      api_key: body.api_key,
    });
    await logActivity(req.user, 'configurar_ia', 'settings', null, `Provedor: ${settings.provider} • modelo: ${settings.model}`);
    res.json({ settings });
  }),
);

router.post(
  '/test',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        provider: z.enum(['local', 'openai', 'gemini', 'compatible']).optional(),
        model: z.string().max(80).optional(),
        base_url: z.string().max(200).optional(),
        api_key: z.string().max(300).optional(),
      })
      .parse(req.body ?? {});
    const current = await getAiSettings();
    const result = await testAiConnection({
      ...current,
      provider: body.provider ?? current.provider,
      model: body.model ?? current.model,
      baseUrl: body.base_url ?? current.baseUrl,
      apiKey: body.api_key || current.apiKey,
    });
    res.json(result);
  }),
);

router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const settings = await getAiSettings();
    res.json({
      provider: settings.provider === 'local' ? 'motor local' : settings.provider,
      mode: settings.provider === 'local' || !settings.apiKey ? 'local' : 'remoto',
      enabled: settings.enabled,
    });
  }),
);

export default router;
