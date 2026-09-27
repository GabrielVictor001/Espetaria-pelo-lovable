import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db';
import { asyncHandler, badRequest, forbidden, notFound, unauthorized } from '../lib/http';
import { checkPassword, hashPassword, requireAdmin, requireAuth, signToken, type AuthUser } from '../lib/auth';
import { logActivity } from '../lib/activity';

const router = Router();

const publicUser = (u: any): AuthUser => ({
  id: u.id,
  name: u.name,
  username: u.username ?? null,
  role: u.role === 'admin' ? 'admin' : 'waiter',
});

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = z.object({ username: z.string().min(1, 'Informe o usuário.'), password: z.string().min(1, 'Informe a senha.') }).parse(req.body);
    const username = body.username.trim().toLowerCase();

    const user = await one<any>(
      `SELECT id, name, username, role, password_hash, active FROM users WHERE lower(username) = $1 OR lower(name) = $1 LIMIT 1`,
      [username],
    );
    if (!user) throw unauthorized('Usuário não encontrado.');
    if (!user.active) throw forbidden('Usuário desativado. Procure o administrador.');

    const ok = await checkPassword(body.password, user.password_hash);
    if (!ok) throw unauthorized('Senha incorreta.');

    const authUser = publicUser(user);
    const token = signToken(authUser);
    await query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    await logActivity(authUser, 'login', 'user', user.id, `${user.name} entrou no sistema`);

    res.cookie?.('pdv_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });
    res.json({ token, user: authUser });
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    res.clearCookie?.('pdv_token');
    res.json({ ok: true });
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await one<any>('SELECT id, name, username, role, active FROM users WHERE id = $1', [req.user!.id]);
    if (!user || !user.active) throw unauthorized();
    res.json({ user: publicUser(user) });
  }),
);

router.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ current_password: z.string().min(1), new_password: z.string().min(4, 'A nova senha precisa de ao menos 4 caracteres.') })
      .parse(req.body);
    const user = await one<any>('SELECT id, password_hash FROM users WHERE id = $1', [req.user!.id]);
    if (!user) throw notFound('Usuário não encontrado.');
    if (!(await checkPassword(body.current_password, user.password_hash))) throw unauthorized('Senha atual incorreta.');
    await query('UPDATE users SET password_hash = $2 WHERE id = $1', [user.id, await hashPassword(body.new_password)]);
    await logActivity(req.user, 'alterar_senha', 'user', user.id, 'Senha alterada pelo próprio usuário');
    res.json({ ok: true });
  }),
);

/* --------------------------------------------------- GESTÃO DE USUÁRIOS --- */
const userSchema = z.object({
  name: z.string().min(2, 'Informe o nome.').max(100),
  username: z.string().min(2, 'Informe o usuário de acesso.').max(50),
  role: z.enum(['admin', 'waiter']).default('waiter'),
  password: z.string().min(4, 'A senha precisa de ao menos 4 caracteres.').optional(),
});

router.get(
  '/users',
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const users = await query<any>(
      `SELECT u.id, u.name, u.username, u.role, u.active, u.created_at, u.last_login_at,
              (SELECT COUNT(*)::int FROM orders o WHERE o.opened_by = u.id) AS orders_opened,
              (SELECT COUNT(*)::int FROM orders o WHERE o.closed_by = u.id) AS orders_closed,
              (SELECT COALESCE(SUM(o.total_amount)::numeric(10,2), 0) FROM orders o WHERE o.closed_by = u.id AND o.status = 'closed') AS revenue
         FROM users u ORDER BY u.role, u.name`,
    );
    res.json({ users: users.map((u) => ({ ...u, revenue: Number(u.revenue) })) });
  }),
);

router.post(
  '/users',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = userSchema.parse(req.body);
    if (!body.password) throw badRequest('Defina a senha do novo usuário.');
    const exists = await one<any>('SELECT id FROM users WHERE lower(username) = $1', [body.username.toLowerCase()]);
    if (exists) throw badRequest('Este usuário de acesso já existe.');
    const created = await one<any>(
      `INSERT INTO users (name, username, role, password_hash, active) VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id, name, username, role, active`,
      [body.name.trim(), body.username.trim().toLowerCase(), body.role, await hashPassword(body.password)],
    );
    await logActivity(req.user, 'criar_usuario', 'user', created!.id, `${created!.name} (${created!.role})`);
    res.status(201).json({ user: created });
  }),
);

router.patch(
  '/users/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = z
      .object({
        name: z.string().min(2).max(100).optional(),
        username: z.string().min(2).max(50).optional(),
        role: z.enum(['admin', 'waiter']).optional(),
        active: z.boolean().optional(),
        password: z.string().min(4).optional(),
      })
      .parse(req.body);

    const target = await one<any>('SELECT id, name, role, active FROM users WHERE id = $1', [id]);
    if (!target) throw notFound('Usuário não encontrado.');

    if (target.role === 'admin' && (body.role === 'waiter' || body.active === false)) {
      const admins = await one<any>("SELECT COUNT(*)::int AS c FROM users WHERE role = 'admin' AND active = TRUE");
      if ((admins?.c ?? 0) <= 1) throw badRequest('É preciso manter pelo menos um administrador ativo.');
    }
    if (body.username) {
      const dup = await one<any>('SELECT id FROM users WHERE lower(username) = $1 AND id <> $2', [body.username.toLowerCase(), id]);
      if (dup) throw badRequest('Este usuário de acesso já existe.');
    }

    const updated = await one<any>(
      `UPDATE users SET
          name = COALESCE($2, name),
          username = COALESCE($3, username),
          role = COALESCE($4, role),
          active = COALESCE($5, active),
          password_hash = COALESCE($6, password_hash)
        WHERE id = $1
        RETURNING id, name, username, role, active`,
      [
        id,
        body.name?.trim() ?? null,
        body.username?.trim().toLowerCase() ?? null,
        body.role ?? null,
        body.active ?? null,
        body.password ? await hashPassword(body.password) : null,
      ],
    );
    await logActivity(req.user, 'editar_usuario', 'user', id, `Usuário ${updated!.name} atualizado`);
    res.json({ user: updated });
  }),
);

router.delete(
  '/users/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user!.id) throw badRequest('Você não pode excluir o próprio usuário.');
    const target = await one<any>('SELECT id, name, role, active FROM users WHERE id = $1', [id]);
    if (!target) throw notFound('Usuário não encontrado.');
    if (target.role === 'admin') {
      const admins = await one<any>("SELECT COUNT(*)::int AS c FROM users WHERE role = 'admin' AND active = TRUE");
      if ((admins?.c ?? 0) <= 1) throw badRequest('É preciso manter pelo menos um administrador ativo.');
    }
    const used = await one<any>('SELECT COUNT(*)::int AS c FROM orders WHERE opened_by = $1 OR closed_by = $1', [id]);
    if ((used?.c ?? 0) > 0) {
      await query('UPDATE users SET active = FALSE WHERE id = $1', [id]);
      await logActivity(req.user, 'desativar_usuario', 'user', id, `${target.name} desativado (possui histórico de vendas)`);
      return res.json({ ok: true, deactivated: true });
    }
    await query('DELETE FROM users WHERE id = $1', [id]);
    await logActivity(req.user, 'excluir_usuario', 'user', id, `${target.name} excluído`);
    res.json({ ok: true, deleted: true });
  }),
);

export default router;
