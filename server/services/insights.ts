/**
 * Métricas do negócio: usadas no painel (dashboard) e como contexto para a IA.
 */
import { num, query, scalar } from '../db';

export interface Overview {
  restaurant_name: string;
  service_fee_percent: number;
  today: {
    revenue: number;
    service_fees: number;
    discounts: number;
    orders: number;
    items: number;
    people: number;
    avg_ticket: number;
  };
  open: { tables: number; total: number; items: number };
  yesterday_revenue: number;
  week_revenue: number;
  month_revenue: number;
  top_today: Array<{ name: string; qty: number; revenue: number }>;
  top_week: Array<{ name: string; qty: number; revenue: number }>;
  series: Array<{ day: string; revenue: number; orders: number }>;
  hours: Array<{ hour: number; orders: number; revenue: number }>;
}

const dayFilter = (offsetDays = 0) =>
  offsetDays === 0
    ? "o.status = 'closed' AND o.closed_at >= CURRENT_DATE"
    : `o.status = 'closed' AND o.closed_at >= CURRENT_DATE - INTERVAL '${offsetDays} days'`;

export async function getOverview(): Promise<Overview> {
  const settings = await query<{ key: string; value: string }>(
    "SELECT key, value FROM settings WHERE key IN ('restaurant_name','service_fee_percent')",
  );
  const restaurantName = settings.find((s) => s.key === 'restaurant_name')?.value || 'Espetaria';
  const feePercent = Number(settings.find((s) => s.key === 'service_fee_percent')?.value ?? 10) || 0;

  const today = await query<any>(`
    SELECT COUNT(DISTINCT o.id)::int AS orders,
           COALESCE(SUM(o.total_amount + o.service_fee - o.discount), 0) AS revenue,
           COALESCE(SUM(o.service_fee), 0) AS service_fees,
           COALESCE(SUM(o.discount), 0) AS discounts,
           COALESCE(SUM(o.people_count), 0)::int AS people
      FROM orders o WHERE ${dayFilter(0)}
  `);
  const itemsToday = num(
    await scalar<string>(`
      SELECT COALESCE(SUM(i.quantity), 0) FROM order_items i
        JOIN orders o ON o.id = i.order_id
       WHERE ${dayFilter(0)} AND i.status = 'active'
    `),
  );

  const open = await query<any>(`
    SELECT COUNT(*)::int AS tables, COALESCE(SUM(o.total_amount), 0) AS total,
           COALESCE((SELECT SUM(i.quantity) FROM order_items i
                       JOIN orders o2 ON o2.id = i.order_id
                      WHERE o2.status = 'open' AND i.status = 'active'), 0) AS items
      FROM orders o WHERE o.status = 'open'
  `);

  const yesterday = await query<any>(`
    SELECT COALESCE(SUM(o.total_amount + o.service_fee - o.discount), 0) AS revenue
      FROM orders o WHERE o.status = 'closed' AND o.closed_at >= CURRENT_DATE - INTERVAL '1 day' AND o.closed_at < CURRENT_DATE
  `);
  const week = await query<any>(`
    SELECT COALESCE(SUM(o.total_amount + o.service_fee - o.discount), 0) AS revenue
      FROM orders o WHERE o.status = 'closed' AND o.closed_at >= CURRENT_DATE - INTERVAL '6 days'
  `);
  const month = await query<any>(`
    SELECT COALESCE(SUM(o.total_amount + o.service_fee - o.discount), 0) AS revenue
      FROM orders o WHERE o.status = 'closed' AND o.closed_at >= CURRENT_DATE - INTERVAL '29 days'
  `);

  const topQuery = (days: number) => `
    SELECT p.name, SUM(i.quantity)::int AS qty, SUM(i.quantity * i.unit_price) AS revenue
      FROM order_items i
      JOIN orders o ON o.id = i.order_id
      JOIN products p ON p.id = i.product_id
     WHERE o.status = 'closed' AND i.status = 'active'
       AND o.closed_at >= CURRENT_DATE ${days > 0 ? `- INTERVAL '${days - 1} days'` : ''}
     GROUP BY p.name ORDER BY qty DESC, revenue DESC LIMIT 8
  `;

  const topToday = await query<any>(topQuery(1));
  const topWeek = await query<any>(topQuery(7));

  const series = await query<any>(`
    SELECT TO_CHAR(o.closed_at, 'YYYY-MM-DD') AS day,
           COALESCE(SUM(o.total_amount + o.service_fee - o.discount), 0) AS revenue,
           COUNT(*)::int AS orders
      FROM orders o
     WHERE o.status = 'closed' AND o.closed_at >= CURRENT_DATE - INTERVAL '13 days'
     GROUP BY 1 ORDER BY 1
  `);

  const hours = await query<any>(`
    SELECT EXTRACT(HOUR FROM o.closed_at)::int AS hour, COUNT(*)::int AS orders,
           COALESCE(SUM(o.total_amount + o.service_fee - o.discount), 0) AS revenue
      FROM orders o
     WHERE o.status = 'closed' AND o.closed_at >= CURRENT_DATE - INTERVAL '6 days'
     GROUP BY 1 ORDER BY 1
  `);

  const orders = today[0]?.orders ?? 0;
  const revenue = num(today[0]?.revenue);

  return {
    restaurant_name: restaurantName,
    service_fee_percent: feePercent,
    today: {
      revenue,
      service_fees: num(today[0]?.service_fees),
      discounts: num(today[0]?.discounts),
      orders,
      items: itemsToday,
      people: today[0]?.people ?? 0,
      avg_ticket: orders ? Math.round((revenue / orders) * 100) / 100 : 0,
    },
    open: { tables: open[0]?.tables ?? 0, total: num(open[0]?.total), items: num(open[0]?.items) },
    yesterday_revenue: num(yesterday[0]?.revenue),
    week_revenue: num(week[0]?.revenue),
    month_revenue: num(month[0]?.revenue),
    top_today: topToday.map((r) => ({ name: r.name, qty: Number(r.qty), revenue: num(r.revenue) })),
    top_week: topWeek.map((r) => ({ name: r.name, qty: Number(r.qty), revenue: num(r.revenue) })),
    series: series.map((r) => ({ day: r.day, revenue: num(r.revenue), orders: Number(r.orders) })),
    hours: hours.map((r) => ({ hour: Number(r.hour), orders: Number(r.orders), revenue: num(r.revenue) })),
  };
}

/** Co-ocorrência: "quem pede X também pede Y" — base das sugestões da IA. */
export async function getCooccurrence(productIds: number[], limit = 6) {
  if (!productIds.length) return [];
  const placeholders = productIds.map((_, i) => `$${i + 1}`).join(',');
  const rows = await query<any>(
    `SELECT p.id, p.name, p.price, p.category, COUNT(DISTINCT i2.order_id)::int AS strength
       FROM order_items i1
       JOIN order_items i2 ON i2.order_id = i1.order_id AND i2.product_id <> i1.product_id
       JOIN products p ON p.id = i2.product_id
      WHERE i1.product_id IN (${placeholders}) AND i1.status = 'active' AND i2.status = 'active'
        AND i2.product_id NOT IN (${placeholders}) AND p.active = TRUE
      GROUP BY p.id, p.name, p.price, p.category
      ORDER BY strength DESC, p.name LIMIT $${productIds.length + 1}`,
    [...productIds, limit],
  );
  return rows.map((r) => ({ ...r, price: num(r.price) }));
}

export async function getHourlyDemand(limit = 4) {
  const rows = await query<any>(`
    SELECT EXTRACT(HOUR FROM closed_at)::int AS hour, COUNT(*)::int AS orders
      FROM orders WHERE status = 'closed' AND closed_at >= CURRENT_DATE - INTERVAL '20 days'
     GROUP BY 1 ORDER BY orders DESC LIMIT $1
  `, [limit]);
  return rows.map((r) => ({ hour: Number(r.hour), orders: Number(r.orders) }));
}
