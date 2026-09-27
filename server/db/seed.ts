/**
 * Dados iniciais: usuários, cardápio, mesas (1 a 70, já criadas no schema.sql),
 * configurações e — opcionalmente — um histórico de vendas para a IA ter o que analisar.
 */
import bcrypt from 'bcryptjs';
import type { Db } from './index';

type SeedProduct = [name: string, price: number, category: string, keywords: string, favorite?: boolean];

export const SETTINGS_DEFAULTS: Record<string, string> = {
  restaurant_name: 'Espetaria do Zé',
  service_fee_percent: '10',
  ai_enabled: 'true',
  ai_provider: 'local',
  ai_model: '',
  ai_api_key: '',
  ai_base_url: '',
  ai_persona: 'Garçom virtual simpático, direto e objetivo, especialista em churrasco e espetos.',
  cleanup_last_run: '',
};

export const MENU: SeedProduct[] = [
  // --- Espetos de carne ------------------------------------------------
  ['Espeto de Carne Bovina', 12.0, 'Espetos de Carne', 'carne boi bovino alcatra churrasco', true],
  ['Espeto de Picanha', 18.0, 'Espetos de Carne', 'carne picanha nobre bovino', true],
  ['Espeto de Alcatra com Queijo', 16.0, 'Espetos de Carne', 'carne alcatra queijo bovino'],
  ['Espeto de Costela', 17.0, 'Espetos de Carne', 'carne costela bovino'],
  ['Espeto de Maminha', 16.0, 'Espetos de Carne', 'carne maminha bovino'],
  ['Espeto de Cupim', 17.0, 'Espetos de Carne', 'carne cupim bovino'],
  ['Espeto de Fraldinha', 16.0, 'Espetos de Carne', 'carne fraldinha bovino'],
  ['Espeto de Contrafilé', 16.5, 'Espetos de Carne', 'carne contrafile bovino'],
  ['Espeto de Coração de Boi', 12.0, 'Espetos de Carne', 'carne coracao miudo boi', true],
  ['Espeto de Fígado com Bacon', 13.0, 'Espetos de Carne', 'carne figado bacon miudo'],
  // --- Espetos especiais ----------------------------------------------
  ['Espeto de Frango com Bacon', 14.0, 'Espetos Especiais', 'frango bacon aves', true],
  ['Espeto de Frango Simples', 12.0, 'Espetos Especiais', 'frango aves'],
  ['Espeto de Asa de Frango', 12.0, 'Espetos Especiais', 'frango asa aves'],
  ['Espeto de Linguiça Toscana', 12.0, 'Espetos Especiais', 'linguica toscana porco'],
  ['Espeto de Linguiça Calabresa', 12.0, 'Espetos Especiais', 'linguica calabresa porco'],
  ['Espeto de Queijo Coalho', 12.0, 'Espetos Especiais', 'queijo coalho vegetariano', true],
  ['Espeto de Queijo Coalho com Mel', 14.0, 'Espetos Especiais', 'queijo coalho mel doce'],
  ['Espeto de Camarão', 22.0, 'Espetos Especiais', 'camarao frutos do mar'],
  ['Espeto de Kafta', 14.0, 'Espetos Especiais', 'kafta carne arabe'],
  ['Espeto de Cordeiro', 26.0, 'Espetos Especiais', 'cordeiro carneiro premium'],
  ['Espeto de Legumes', 10.0, 'Espetos Especiais', 'legumes vegetariano vegano'],
  ['Espeto de Pão de Alho', 10.0, 'Espetos Especiais', 'pao alho vegetariano', true],
  ['Espeto de Abacaxi com Canela', 12.0, 'Espetos Especiais', 'abacaxi canela doce'],
  // --- Porções ---------------------------------------------------------
  ['Pão de Alho (4 un)', 18.0, 'Porções', 'pao alho entrada', true],
  ['Batata Frita', 25.0, 'Porções', 'batata frita porcao'],
  ['Batata Frita com Cheddar e Bacon', 35.0, 'Porções', 'batata cheddar bacon', true],
  ['Calabresa Acebolada', 32.0, 'Porções', 'calabresa cebola porcao'],
  ['Queijo Coalho na Chapa', 28.0, 'Porções', 'queijo coalho chapa'],
  ['Frango a Passarinho', 38.0, 'Porções', 'frango passarinho porcao'],
  ['Mandioca Frita', 25.0, 'Porções', 'mandioca aipim frita'],
  ['Torresmo de Rolo', 28.0, 'Porções', 'torresmo porco'],
  ['Bolinho de Bacalhau (6 un)', 30.0, 'Porções', 'bacalhau bolinho'],
  ['Tilápia Frita', 45.0, 'Porções', 'peixe tilapia'],
  // --- Acompanhamentos -------------------------------------------------
  ['Farofa da Casa', 8.0, 'Acompanhamentos', 'farofa acompanhamento'],
  ['Vinagrete', 6.0, 'Acompanhamentos', 'vinagrete salada'],
  ['Molho Especial da Casa', 5.0, 'Acompanhamentos', 'molho especial'],
  ['Salada Mista', 18.0, 'Acompanhamentos', 'salada verde tomate'],
  ['Feijão Tropeiro', 22.0, 'Acompanhamentos', 'feijao tropeiro'],
  ['Arroz Branco (porção)', 12.0, 'Acompanhamentos', 'arroz'],
  // --- Bebidas ---------------------------------------------------------
  ['Coca-Cola Lata 350ml', 7.0, 'Bebidas', 'coca cola refrigerante', true],
  ['Coca-Cola 600ml', 10.0, 'Bebidas', 'coca cola refrigerante'],
  ['Coca-Cola Zero Lata', 7.0, 'Bebidas', 'coca zero refrigerante'],
  ['Guaraná Antarctica Lata', 7.0, 'Bebidas', 'guarana refrigerante'],
  ['Fanta Laranja Lata', 7.0, 'Bebidas', 'fanta laranja refrigerante'],
  ['Sprite Lata', 7.0, 'Bebidas', 'sprite refrigerante limao'],
  ['Água Mineral 500ml', 5.0, 'Bebidas', 'agua mineral'],
  ['Água com Gás 500ml', 6.0, 'Bebidas', 'agua gas'],
  ['Suco de Laranja', 12.0, 'Bebidas', 'suco laranja natural'],
  ['Suco de Maracujá', 12.0, 'Bebidas', 'suco maracuja'],
  ['Limonada Suíça', 14.0, 'Bebidas', 'limonada suica limao', true],
  ['Energético Red Bull 250ml', 18.0, 'Bebidas', 'energetico red bull'],
  ['H2O Limão 500ml', 8.0, 'Bebidas', 'h2o agua saborizada'],
  // --- Cervejas --------------------------------------------------------
  ['Skol 600ml', 14.0, 'Cervejas', 'cerveja skol pilsen', true],
  ['Brahma Duplo Malte 600ml', 15.0, 'Cervejas', 'cerveja brahma pilsen'],
  ['Original 600ml', 17.0, 'Cervejas', 'cerveja original pilsen', true],
  ['Heineken Long Neck', 14.0, 'Cervejas', 'cerveja heineken long neck'],
  ['Budweiser Long Neck', 13.0, 'Cervejas', 'cerveja budweiser'],
  ['Stella Artois Long Neck', 15.0, 'Cervejas', 'cerveja stella'],
  ['Corona Long Neck', 16.0, 'Cervejas', 'cerveja corona'],
  ['Eisenbahn Pilsen 600ml', 18.0, 'Cervejas', 'cerveja eisenbahn'],
  // --- Drinks ----------------------------------------------------------
  ['Caipirinha de Limão', 22.0, 'Drinks', 'caipirinha limao pinga', true],
  ['Caipirinha de Frutas', 26.0, 'Drinks', 'caipirinha frutas'],
  ['Caipiroska', 26.0, 'Drinks', 'caipiroska vodka'],
  ['Batida de Coco', 20.0, 'Drinks', 'batida coco'],
  ['Dose de Cachaça', 10.0, 'Drinks', 'cachaca dose pinga'],
  ['Dose de Whisky', 25.0, 'Drinks', 'whisky dose'],
  ['Gin Tônica', 28.0, 'Drinks', 'gin tonica'],
  ['Vodka com Energético', 30.0, 'Drinks', 'vodka energetico'],
  ['Taça de Vinho', 22.0, 'Drinks', 'vinho taca'],
  // --- Sobremesas ------------------------------------------------------
  ['Abacaxi na Brasa com Mel', 18.0, 'Sobremesas', 'abacaxi brasa mel doce'],
  ['Banana na Brasa com Canela', 15.0, 'Sobremesas', 'banana brasa canela doce'],
  ['Sorvete 2 Bolas', 14.0, 'Sobremesas', 'sorvete sobremesa'],
  ['Açaí 300ml', 20.0, 'Sobremesas', 'acai'],
  ['Mousse de Maracujá', 14.0, 'Sobremesas', 'mousse maracuja doce'],
  ['Pudim de Leite', 12.0, 'Sobremesas', 'pudim leite doce'],
];

export const USERS: Array<{ name: string; username: string; role: 'admin' | 'waiter'; password: string }> = [
  { name: 'Administrador', username: 'admin', role: 'admin', password: 'admin123' },
  { name: 'João Atendente', username: 'joao', role: 'waiter', password: '123456' },
  { name: 'Maria Atendente', username: 'maria', role: 'waiter', password: '123456' },
  { name: 'Carla Atendente', username: 'carla', role: 'waiter', password: '123456' },
];

/* Gerador pseudoaleatório determinístico (o mesmo histórico em toda instalação) */
function makeRandom(seed = 20260927) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

export async function seed(db: Db, opts: { demo?: boolean } = {}) {
  const demo = opts.demo !== false;

  // --- Configurações ------------------------------------------------------
  await ensureSettings(db);

  // --- Usuários -----------------------------------------------------------
  for (const u of USERS) {
    const hash = await bcrypt.hash(u.password, 10);
    await db.query(
      `INSERT INTO users (name, role, password_hash, username, active)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT DO NOTHING`,
      [u.name, u.role, hash, u.username],
    );
  }

  // --- Cardápio -----------------------------------------------------------
  for (let i = 0; i < MENU.length; i++) {
    const [name, price, category, keywords, favorite] = MENU[i];
    const exists = await db.query('SELECT id FROM products WHERE name = $1', [name]);
    if (exists.rows.length === 0) {
      await db.query(
        `INSERT INTO products (name, price, category, keywords, favorite, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [name, price, category, keywords, !!favorite, i],
      );
    }
  }

  const products = (await db.query<{ id: number; price: string; category: string; name: string }>(
    'SELECT id, name, price, category FROM products ORDER BY sort_order, id',
  )).rows;

  const waiterIds = (await db.query<{ id: number }>("SELECT id FROM users WHERE role = 'waiter' ORDER BY id")).rows.map(
    (r) => r.id,
  );
  const adminId = (await db.query<{ id: number }>("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")).rows[0]?.id;

  if (!demo || products.length === 0) return;

  const rnd = makeRandom();
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const beers = products.filter((p) => ['Cervejas', 'Bebidas', 'Drinks'].includes(p.category));
  const skewers = products.filter((p) => p.category.startsWith('Espetos'));
  const sides = products.filter((p) => p.category === 'Porções');
  const desserts = products.filter((p) => p.category === 'Sobremesas');

  const userId = adminId ?? waiterIds[0];

  // --- Histórico de vendas (últimos 21 dias) para relatórios e IA ----------
  for (let daysAgo = 21; daysAgo >= 0; daysAgo--) {
    const isWeekend = () => {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      return [5, 6, 0].includes(d.getDay());
    };
    const base = isWeekend() ? 16 : 8;
    const ordersToday = base + Math.floor(rnd() * 8);

    for (let k = 0; k < ordersToday; k++) {
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      date.setHours(18 + Math.floor(rnd() * 5), Math.floor(rnd() * 60), 0, 0);
      if (date.getTime() > Date.now()) date.setTime(Date.now() - 1000 * 60 * (30 + Math.floor(rnd() * 600)));

      const tableNumber = 1 + Math.floor(rnd() * 70);
      const table = (await db.query<{ id: number }>('SELECT id FROM tables WHERE number = $1', [tableNumber])).rows[0];
      if (!table) continue;

      const people = 1 + Math.floor(rnd() * 5);
      const order = await db.query<{ id: number }>(
        `INSERT INTO orders (table_id, status, created_at, closed_at, people_count, opened_by, closed_by, notes)
         VALUES ($1, 'closed', $2, $3, $4, $5, $6, NULL) RETURNING id`,
        [table.id, date.toISOString(), new Date(date.getTime() + 1000 * 60 * 75).toISOString(), people, userId, userId],
      );
      const orderId = order.rows[0].id;

      const comandas = people > 1 && rnd() > 0.55 ? people : 1;
      const itemCount = 2 + Math.floor(rnd() * 6);
      for (let it = 0; it < itemCount; it++) {
        const bucket = rnd();
        const product = bucket < 0.55 ? pick(skewers) : bucket < 0.8 ? pick(beers) : bucket < 0.92 ? pick(sides) : pick(desserts);
        if (!product) continue;
        const qty = 1 + Math.floor(rnd() * (product.category.startsWith('Espetos') ? 4 : 2));
        await db.query(
          `INSERT INTO order_items (order_id, product_id, command_name, quantity, unit_price, created_at, status, added_by)
           VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)`,
          [
            orderId,
            product.id,
            comandas === 1 ? 'Geral' : `Cliente ${1 + Math.floor(rnd() * comandas)}`,
            qty,
            product.price,
            date.toISOString(),
            userId,
          ],
        );
      }

      // taxa de serviço de 10% em parte das contas
      const withFee = rnd() > 0.4;
      await db.query(
        `UPDATE orders o SET total_amount = COALESCE((
             SELECT SUM(i.quantity * i.unit_price) FROM order_items i WHERE i.order_id = o.id AND i.status = 'active'
           ), 0),
           service_fee = CASE WHEN $2 THEN ROUND(COALESCE((
             SELECT SUM(i.quantity * i.unit_price) FROM order_items i WHERE i.order_id = o.id AND i.status = 'active'
           ), 0) * 0.10, 2) ELSE 0 END
         WHERE o.id = $1`,
        [orderId, withFee],
      );

      const method = pick(['cash', 'pix', 'credit', 'debit']);
      await db.query(
        `INSERT INTO payments (order_id, method, amount, created_at, created_by)
         SELECT $1, $2, total_amount + service_fee - discount, $3, $4 FROM orders WHERE id = $1`,
        [orderId, method, date.toISOString(), userId],
      );
    }
  }

  // --- Mesas abertas agora (para o app não começar vazio) ------------------
  const openNow: Array<{ table: number; people: number; items: Array<[string, number, string]> }> = [
    {
      table: 5,
      people: 2,
      items: [
        ['Espeto de Picanha', 2, 'Geral'],
        ['Espeto de Queijo Coalho', 2, 'Geral'],
        ['Original 600ml', 2, 'Geral'],
      ],
    },
    {
      table: 12,
      people: 4,
      items: [
        ['Espeto de Carne Bovina', 3, 'Cliente 1'],
        ['Espeto de Frango com Bacon', 2, 'Cliente 1'],
        ['Batata Frita com Cheddar e Bacon', 1, 'Cliente 2'],
        ['Espeto de Camarão', 2, 'Cliente 2'],
        ['Caipirinha de Limão', 2, 'Cliente 2'],
      ],
    },
    {
      table: 33,
      people: 3,
      items: [
        ['Espeto de Costela', 4, 'Geral'],
        ['Pão de Alho (4 un)', 1, 'Geral'],
        ['Coca-Cola 600ml', 2, 'Geral'],
        ['Sorvete 2 Bolas', 1, 'Geral'],
      ],
    },
    {
      table: 61,
      people: 6,
      items: [
        ['Espeto de Cordeiro', 2, 'Cliente 1'],
        ['Espeto de Linguiça Toscana', 4, 'Cliente 1'],
        ['Heineken Long Neck', 6, 'Cliente 2'],
        ['Abacaxi na Brasa com Mel', 2, 'Cliente 3'],
      ],
    },
  ];

  for (const o of openNow) {
    const table = (await db.query<{ id: number }>('SELECT id FROM tables WHERE number = $1', [o.table])).rows[0];
    if (!table) continue;
    const createdAt = new Date(Date.now() - (10 + Math.floor(rnd() * 50)) * 60 * 1000);
    const order = await db.query<{ id: number }>(
      `INSERT INTO orders (table_id, status, created_at, people_count, opened_by)
       VALUES ($1, 'open', $2, $3, $4) RETURNING id`,
      [table.id, createdAt.toISOString(), o.people, pick(waiterIds.length ? waiterIds : [userId])],
    );
    const orderId = order.rows[0].id;
    for (const [name, qty, command] of o.items) {
      const p = products.find((x) => x.name === name);
      if (!p) continue;
      await db.query(
        `INSERT INTO order_items (order_id, product_id, command_name, quantity, unit_price, created_at, status, added_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)`,
        [orderId, p.id, command, qty, p.price, createdAt.toISOString(), userId],
      );
    }
    await db.query(
      `UPDATE orders o SET total_amount = COALESCE((
         SELECT SUM(i.quantity * i.unit_price) FROM order_items i WHERE i.order_id = o.id AND i.status = 'active'
       ), 0) WHERE o.id = $1`,
      [orderId],
    );
    await db.query("UPDATE tables SET status = 'occupied', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [table.id]);
  }

  await db.query(
    `INSERT INTO activity_log (user_name, action, entity, details)
     VALUES ('sistema', 'seed', 'database', 'Carga inicial: usuários, cardápio, 70 mesas e histórico de demonstração')`,
  );
}

export async function ensureSettings(db: Db) {
  for (const [key, value] of Object.entries(SETTINGS_DEFAULTS)) {
    await db.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, value]);
  }
}
