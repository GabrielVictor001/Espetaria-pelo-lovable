/**
 * Recria o banco do zero (estrutura + dados iniciais).
 * Uso: npm run db:reset -- --yes
 */
import fs from 'node:fs';
import { config } from '../config';
import { getDb, initDatabase } from './index';

const confirmed = process.argv.includes('--yes') || process.argv.includes('-y');

async function main() {
  if (config.databaseUrl) {
    if (!confirmed) {
      console.error('⚠️  DATABASE_URL está configurada (Postgres externo). Rode com --yes para apagar tudo.');
      process.exit(1);
    }
    const db = await getDb();
    await db.exec(`
      DROP TABLE IF EXISTS payments, ai_chat_log, activity_log, settings, order_items, orders, products, tables, users CASCADE;
    `);
    await initDatabase();
    await db.close();
    console.log('✅ Banco externo recriado com sucesso.');
    return;
  }

  fs.rmSync(config.dataDir, { recursive: true, force: true });
  const { kind, seeded } = await initDatabase();
  console.log(`✅ Banco local (${kind}) recriado. Seed aplicado: ${seeded ? 'sim' : 'não'}`);
  const db = await getDb();
  await db.close();
}

main().catch((err) => {
  console.error('❌ Falha ao recriar o banco:', err);
  process.exit(1);
});
