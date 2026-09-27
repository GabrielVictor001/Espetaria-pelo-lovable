import 'dotenv/config';
import { fileURLToPath } from 'node:url';

function bool(v: string | undefined, fallback = false) {
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on', 'sim'].includes(v.toLowerCase());
}

export const config = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || 'espetaria-pdv-dev-secret-troque-em-producao',
  jwtExpires: '7d',
  databaseUrl: process.env.DATABASE_URL?.trim() || '',
  pgSsl: bool(process.env.PGSSL, /sslmode=require/.test(process.env.DATABASE_URL || '')),
  dataDir: process.env.PGLITE_DIR || fileURLToPath(new URL('../data/pgdata', import.meta.url)),
  seedDemoData: bool(process.env.SEED_DEMO_DATA, true),
  ai: {
    provider: (process.env.AI_PROVIDER || 'local').toLowerCase(),
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || '',
    baseUrl: process.env.AI_BASE_URL || '',
  },
};

export type AppConfig = typeof config;
