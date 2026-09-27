/**
 * Cardápio + motor de busca inteligente.
 * O mesmo motor alimenta o campo "search" do PDV e a IA local.
 */
import { query } from '../db';

export interface Product {
  id: number;
  name: string;
  price: string | number;
  category: string | null;
  description: string | null;
  keywords: string | null;
  active: boolean;
  favorite: boolean;
  sort_order: number;
}

export const normalize = (s: string) =>
  (s || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, prevDiag + (a[i - 1] === b[j - 1] ? 0 : 1));
      prevDiag = tmp;
    }
  }
  return prev[b.length];
}

/** Similaridade 0..1 tolerante a erros de digitação. */
function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

/**
 * Pontua o quanto um produto casa com a busca (0 a 1).
 * Considera: começo do nome, trecho do nome, palavras-chave da IA, categoria e erros de digitação.
 */
export function scoreProduct(search: string, product: Product): number {
  const q = normalize(search);
  if (!q) return 0;

  const name = normalize(product.name);
  const keywords = normalize(product.keywords || '');
  const category = normalize(product.category || '');
  const description = normalize(product.description || '');
  const qTokens = q.split(' ').filter(Boolean);
  const nameTokens = name.split(' ').filter(Boolean);

  let score = 0;
  if (name === q) score = Math.max(score, 1);
  if (name.startsWith(q)) score = Math.max(score, 0.97);
  if (name.includes(q)) score = Math.max(score, 0.93);
  if (keywords.includes(q)) score = Math.max(score, 0.88);
  if (category.includes(q)) score = Math.max(score, 0.82);
  if (description.includes(q)) score = Math.max(score, 0.75);

  // cobertura de palavras digitadas
  let matched = 0;
  let fuzzyTotal = 0;
  for (const token of qTokens) {
    if (name.includes(token)) matched += 1;
    else if (keywords.includes(token)) matched += 0.85;
    else if (category.includes(token)) matched += 0.7;
    else {
      const best = Math.max(
        ...nameTokens.map((nt) => similarity(nt, token) * (nt.length > 3 ? 1 : 0.9)),
        ...keywords.split(' ').filter(Boolean).map((kt) => similarity(kt, token) * 0.85),
      );
      if (best > 0.7) {
        matched += best * 0.8;
        fuzzyTotal += best;
      }
    }
  }
  if (qTokens.length) {
    const coverage = matched / qTokens.length;
    const tokenScore = 0.55 + 0.4 * coverage;
    score = Math.max(score, coverage >= 1 ? Math.min(0.95, tokenScore + 0.05) : tokenScore * coverage);
  }

  // desempate: favoritos primeiro, preço menor primeiro (menos digitação, melhor retorno)
  if (product.favorite) score += 0.02;
  if (fuzzyTotal > 0) score = Math.min(score, 0.9);
  return Math.min(1, score);
}

export interface ScoredProduct extends Product {
  score: number;
  price_number: number;
}

export async function searchProducts(term: string, limit = 10): Promise<ScoredProduct[]> {
  const all = await query<Product>('SELECT * FROM products WHERE active = TRUE');
  const scored = all
    .map((p) => ({ ...p, price_number: Number(p.price), score: scoreProduct(term, p) }))
    .filter((p) => p.score >= 0.45)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
  return scored;
}

export async function listProducts(opts: { q?: string; category?: string; includeInactive?: boolean } = {}) {
  const conds: string[] = [];
  const params: any[] = [];
  if (!opts.includeInactive) conds.push('active = TRUE');
  if (opts.category) {
    params.push(opts.category);
    conds.push(`category = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = await query<Product>(`SELECT * FROM products ${where} ORDER BY category, sort_order, name`, params);
  if (opts.q) {
    const q = normalize(opts.q);
    return rows
      .filter((p) => normalize(`${p.name} ${p.keywords ?? ''} ${p.category ?? ''}`).includes(q))
      .map((p) => ({ ...p, price_number: Number(p.price) }));
  }
  return rows.map((p) => ({ ...p, price_number: Number(p.price) }));
}

export async function listCategories() {
  const rows = await query<{ category: string; total: number }>(
    `SELECT COALESCE(category, 'Sem categoria') AS category, COUNT(*)::int AS total
       FROM products WHERE active = TRUE GROUP BY 1 ORDER BY 1`,
  );
  return rows;
}

export async function createProduct(input: {
  name: string;
  price: number;
  category?: string;
  description?: string;
  keywords?: string;
  favorite?: boolean;
}) {
  const rows = await query<Product>(
    `INSERT INTO products (name, price, category, description, keywords, favorite, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM products))
     RETURNING *`,
    [
      input.name.trim().slice(0, 100),
      input.price,
      input.category?.trim() || 'Outros',
      input.description?.trim() || null,
      input.keywords?.trim() || normalize(input.name),
      !!input.favorite,
    ],
  );
  return rows[0];
}

export async function updateProduct(
  id: number,
  patch: {
    name?: string;
    price?: number;
    category?: string;
    description?: string | null;
    keywords?: string | null;
    favorite?: boolean;
    active?: boolean;
  },
) {
  const rows = await query<Product>(
    `UPDATE products SET
        name = COALESCE($2, name),
        price = COALESCE($3, price),
        category = COALESCE($4, category),
        description = CASE WHEN $5::boolean THEN $6 ELSE description END,
        keywords = COALESCE($7, keywords),
        favorite = COALESCE($8, favorite),
        active = COALESCE($9, active)
      WHERE id = $1 RETURNING *`,
    [
      id,
      patch.name?.trim().slice(0, 100) ?? null,
      patch.price ?? null,
      patch.category?.trim() ?? null,
      patch.description !== undefined,
      patch.description?.trim() || null,
      patch.keywords?.trim() ?? null,
      patch.favorite ?? null,
      patch.active ?? null,
    ],
  );
  return rows[0] ?? null;
}

export async function deleteProduct(id: number) {
  // não apaga se já foi vendido: apenas desativa (mantém o histórico íntegro)
  const used = await query<{ c: number }>('SELECT COUNT(*)::int AS c FROM order_items WHERE product_id = $1', [id]);
  if ((used[0]?.c ?? 0) > 0) {
    await query('UPDATE products SET active = FALSE WHERE id = $1', [id]);
    return { deleted: false, deactivated: true };
  }
  await query('DELETE FROM products WHERE id = $1', [id]);
  return { deleted: true, deactivated: false };
}
