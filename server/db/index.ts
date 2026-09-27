/**
 * Camada de banco de dados.
 *
 * Funciona com DOIS bancos PostgreSQL de verdade, sem mudar nenhuma linha de SQL:
 *   1. PostgreSQL embutido (PGlite/WASM) -> padrão, zero instalação, dados em server/data/
 *   2. PostgreSQL externo                  -> defina DATABASE_URL (Neon, Supabase, Docker, VPS...)
 *
 * Concorrência (importante no PGlite, que tem UMA conexão):
 *   • toda consulta passa por uma fila (mutex) — nada é executado no meio de uma transação;
 *   • dentro de uma transação, as funções query()/one()/scalar() enxergam
 *     automaticamente a mesma conexão via AsyncLocalStorage (sem deadlock e sem
 *     risco de escrever fora da transação).
 */
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { fileURLToPath } from 'node:url';
import { config } from '../config';

export type Row = Record<string, any>;

export interface QueryResult<T = Row> {
  rows: T[];
  rowCount: number;
}

export interface Db {
  readonly kind: 'pglite' | 'postgres';
  query<T = Row>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

type Executor = (sql: string, params?: any[]) => Promise<QueryResult>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const txStorage = new AsyncLocalStorage<{ exec: Executor }>();

let instance: Db | null = null;

/* ------------------------------------------------------------ FILA/MUTEX -- */
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

const inTransaction = () => !!txStorage.getStore();

/* ---------------------------------------------------------------- PGlite -- */
async function createPglite(): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  fs.mkdirSync(config.dataDir, { recursive: true });
  const pg = new PGlite(config.dataDir);

  const baseExec: Executor = async (sql, params = []) => {
    const res: any = await pg.query(sql, params);
    return { rows: res.rows ?? [], rowCount: res.affectedRows ?? res.rows?.length ?? 0 };
  };
  const baseExecRaw = async (sql: string) => {
    await pg.exec(sql);
  };

  const makeDb = (exec: Executor, raw: (sql: string) => Promise<void>): Db => ({
    kind: 'pglite',
    query: exec as Db['query'],
    exec: (sql) => enqueueOrDirect(() => raw(sql)),
    transaction: (fn) => runTransaction(exec, raw, makeDb, fn),
    async close() {
      await pg.close();
    },
  });

  const enqueueOrDirect = <T,>(fn: () => Promise<T>) => (inTransaction() ? fn() : enqueue(fn));

  const db = makeDb((sql, params = []) => enqueueOrDirect(() => baseExec(sql, params)), baseExecRaw);

  // expõe o executor "cru" para o gerenciador de transações
  (db as any).__base = { exec: baseExec, raw: baseExecRaw, makeDb };
  return db;
}

/* --------------------------------------------------------------- PostgreSQL */
async function createPg(): Promise<Db> {
  const pgMod: any = await import('pg');
  const Pool = pgMod.default?.Pool ?? pgMod.Pool;
  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.pgSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });

  const execOf = (client: any): Executor => async (sql, params = []) => {
    const res = await client.query(sql, params);
    return { rows: res.rows ?? [], rowCount: res.rowCount ?? 0 };
  };

  const baseExec = execOf(pool);
  const makeDb = (exec: Executor, raw: (sql: string) => Promise<void>): Db => ({
    kind: 'postgres',
    query: exec as Db['query'],
    exec: (sql) => (inTransaction() ? raw(sql) : baseExec(sql).then(() => undefined)),
    transaction: (fn) => runTransaction(exec, raw, makeDb, fn),
    async close() {
      await pool.end();
    },
  });

  const db = makeDb(baseExec, (sql) => baseExec(sql).then(() => undefined));
  (db as any).__base = { exec: baseExec, raw: (sql: string) => baseExec(sql).then(() => undefined), makeDb, pool, execOf };
  return db;
}

/* --------------------------------------------------------- TRANSAÇÕES ----- */
async function runTransaction<T>(
  _exec: Executor,
  _raw: (sql: string) => Promise<void>,
  _makeDb: (exec: Executor, raw: (sql: string) => Promise<void>) => Db,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  const db = instance!;
  const base = (db as any).__base as {
    exec: Executor;
    raw: (sql: string) => Promise<void>;
    makeDb: typeof _makeDb;
    pool?: any;
    execOf?: (client: any) => Executor;
  };
  const isPglite = db.kind === 'pglite';

  const body = async (): Promise<T> => {
    let exec: Executor = base.exec;
    let raw: (sql: string) => Promise<void> = base.raw;
    let release: (() => void) | null = null;

    if (!isPglite && base.pool && base.execOf) {
      // Postgres externo: cliente dedicado do pool (uma conexão por transação)
      const conn = await base.pool.connect();
      exec = base.execOf(conn);
      raw = (sql: string) => conn.query(sql).then(() => undefined);
      release = () => conn.release();
    }

    await exec('BEGIN');
    try {
      const out = await txStorage.run({ exec }, () => fn(base.makeDb(exec, raw)));
      await exec('COMMIT');
      return out;
    } catch (err) {
      await exec('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      release?.();
    }
  };

  if (inTransaction()) return body(); // transação aninhada: usa o mesmo contexto
  return isPglite ? enqueue(body) : body();
}

/* ------------------------------------------------------------------- API --- */
export async function getDb(): Promise<Db> {
  if (!instance) instance = config.databaseUrl ? await createPg() : await createPglite();
  return instance;
}

export async function query<T = Row>(sql: string, params: any[] = []): Promise<T[]> {
  const db = await getDb();
  const res = await db.query<T>(sql, params);
  return res.rows;
}

/** Primeira linha (ou null). */
export async function one<T = Row>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Primeiro valor da primeira linha (ou null). */
export async function scalar<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const row = await one<Row>(sql, params);
  if (!row) return null;
  const values = Object.values(row);
  return (values[0] ?? null) as T;
}

export async function transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(fn);
}

/** Converte NUMERIC/DECIMAL (que o driver devolve como string) em número. */
export function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

/* -------------------------------------------------------------- MIGRAÇÃO ---- */
const schemaPath = path.join(__dirname, 'schema.sql');

/** Cria a estrutura e popula os dados iniciais, se necessário. */
export async function initDatabase(): Promise<{ kind: string; seeded: boolean }> {
  const db = await getDb();
  await db.exec(fs.readFileSync(schemaPath, 'utf8'));

  const { rows } = await db.query<{ c: number }>('SELECT count(*)::int AS c FROM users');
  const isEmpty = (rows[0]?.c ?? 0) === 0;

  let seeded = false;
  if (isEmpty) {
    const { seed } = await import('./seed');
    await db.transaction(async (tx) => {
      await seed(tx, { demo: config.seedDemoData });
    });
    seeded = true;
  } else {
    const { ensureSettings } = await import('./seed');
    await ensureSettings(db);
  }

  return { kind: db.kind, seeded };
}
