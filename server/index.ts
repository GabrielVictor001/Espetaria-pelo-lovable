import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config';
import { getDb, initDatabase } from './db';
import { errorHandler } from './lib/http';
import { getOverview } from './services/insights';

import authRoutes from './routes/auth';
import tableRoutes from './routes/tables';
import { itemsRouter, ordersRouter } from './routes/orders';
import productRoutes from './routes/products';
import aiRoutes from './routes/ai';
import adminRoutes from './routes/admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');

async function main() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    const db = await getDb();
    res.json({
      ok: true,
      database: db.kind === 'pglite' ? 'PostgreSQL embutido (PGlite)' : 'PostgreSQL externo',
      time: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/tables', tableRoutes);
  app.use('/api/orders', ordersRouter);
  app.use('/api/items', itemsRouter);
  app.use('/api/products', productRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/insights', async (req, res, next) => {
    try {
      if (req.method !== 'GET') return next();
      res.json(await getOverview());
    } catch (err) {
      next(err);
    }
  });

  // painel compilado (npm run build). Em desenvolvimento o Vite serve a interface.
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir, { index: false, maxAge: '1h' }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res.type('html').send(
        `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Espetaria PDV</title>
         <style>body{font-family:system-ui;background:#111;color:#eee;display:grid;place-items:center;height:100vh;margin:0}
         code{background:#000;padding:2px 6px;border-radius:4px}</style></head>
         <body><div><h1>🍢 Espetaria PDV — API no ar</h1>
         <p>Interface não compilada. Rode <code>npm run build</code> ou use <code>npm run dev</code>.</p></div></body></html>`,
      );
    });
  }

  app.use(errorHandler);

  const { kind, seeded } = await initDatabase();

  app.listen(config.port, '0.0.0.0', () => {
    console.log('');
    console.log('  🍢  ESPETARIA PDV');
    console.log(`  ▸ Servidor:  http://localhost:${config.port}`);
    console.log(`  ▸ Banco:     ${kind === 'pglite' ? 'PostgreSQL embutido (PGlite) • ' + config.dataDir : 'PostgreSQL externo'}`);
    console.log(`  ▸ Dados iniciais: ${seeded ? 'criados agora' : 'já existiam'}`);
    if (seeded) console.log('  ▸ Login admin: admin / admin123   •   atendente: joao / 123456');
    console.log('');
  });
}

main().catch((err) => {
  console.error('Falha ao iniciar o servidor:', err);
  process.exit(1);
});
