import type { Db } from '../db';
import { getDb } from '../db';
import type { AuthUser } from './auth';

/** Registra a ação no log de auditoria (usado pelo painel e pelo botão de limpeza). */
export async function logActivity(
  user: AuthUser | null | undefined,
  action: string,
  entity?: string,
  entityId?: number | null,
  details?: string,
  tx?: Db,
) {
  const db = tx ?? (await getDb());
  await db.query(
    `INSERT INTO activity_log (user_id, user_name, action, entity, entity_id, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [user?.id ?? null, user?.name ?? 'sistema', action, entity ?? null, entityId ?? null, details ?? null],
  );
}
