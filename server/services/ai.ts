/**
 * Camada de Inteligência Artificial — PLUGÁVEL.
 *
 *  • Provedor "local"  → motor próprio (sem internet, sem chave, custo zero):
 *    busca inteligente com tolerância a erros de digitação, sugestões baseadas
 *    no que o cliente já pediu + co-ocorrência real do histórico, e respostas
 *    sobre vendas, mesas e cardápio.
 *
 *  • Provedores externos (OpenAI, Gemini ou qualquer endpoint compatível com
 *    OpenAI: Groq, OpenRouter, Ollama...) → basta colar a chave em
 *    Configurações ▸ Inteligência Artificial. Se a chave falhar, o PDV volta
 *    automaticamente para o motor local (o salão nunca para).
 */
import { config } from '../config';
import { num, query } from '../db';
import { getCooccurrence, getOverview } from './insights';
import { searchProducts, normalize, type Product } from './products';
import { getOrderProductIds, getOrderView, listOpenOrders } from './orders';

export type AiProvider = 'local' | 'openai' | 'gemini' | 'compatible';

export interface AiSettings {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
  persona: string;
}

export interface AiAction {
  type: 'add_item' | 'open_table' | 'goto_table' | 'search';
  label: string;
  table_number?: number;
  order_id?: number;
  product_id?: number;
  product_name?: string;
  quantity?: number;
  unit_price?: number;
  term?: string;
}

export interface AiReply {
  answer: string;
  actions: AiAction[];
  provider: string;
  mode: 'local' | 'remoto';
  note?: string;
  suggestions: string[];
}

/* ------------------------------------------------------------- CONFIG ----- */
const DEFAULTS: AiSettings = {
  enabled: true,
  provider: (config.ai.provider as AiProvider) || 'local',
  model: config.ai.model || '',
  apiKey: config.ai.apiKey || '',
  baseUrl: config.ai.baseUrl || '',
  persona: 'Garçom virtual simpático, direto e objetivo, especialista em churrasco e espetos.',
};

export async function getAiSettings(): Promise<AiSettings> {
  const rows = await query<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key IN ('ai_enabled','ai_provider','ai_model','ai_api_key','ai_base_url','ai_persona')`,
  );
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const provider = (map.get('ai_provider') || DEFAULTS.provider) as AiProvider;
  return {
    enabled: (map.get('ai_enabled') ?? String(DEFAULTS.enabled)) !== 'false',
    provider: ['local', 'openai', 'gemini', 'compatible'].includes(provider) ? provider : 'local',
    model: map.get('ai_model') ?? DEFAULTS.model,
    apiKey: map.get('ai_api_key') ?? DEFAULTS.apiKey,
    baseUrl: map.get('ai_base_url') ?? DEFAULTS.baseUrl,
    persona: map.get('ai_persona') ?? DEFAULTS.persona,
  };
}

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  local: 'motor-local-v1',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  compatible: 'llama-3.1-8b-instant',
};

export function publicAiSettings(s: AiSettings) {
  const masked = s.apiKey ? `${s.apiKey.slice(0, 4)}••••${s.apiKey.slice(-4)}` : '';
  return {
    enabled: s.enabled,
    provider: s.provider,
    model: s.model || DEFAULT_MODELS[s.provider],
    base_url: s.baseUrl,
    persona: s.persona,
    has_key: !!s.apiKey,
    key_preview: masked,
    available_providers: [
      { id: 'local', label: 'Motor local (offline, sem chave)', needs_key: false },
      { id: 'openai', label: 'OpenAI (GPT)', needs_key: true },
      { id: 'gemini', label: 'Google Gemini', needs_key: true },
      { id: 'compatible', label: 'Compatível com OpenAI (Groq, OpenRouter, Ollama...)', needs_key: true },
    ],
  };
}

export async function saveAiSettings(patch: Partial<AiSettings> & { api_key?: string }) {
  const pairs: Array<[string, string]> = [];
  if (patch.enabled !== undefined) pairs.push(['ai_enabled', String(patch.enabled)]);
  if (patch.provider) pairs.push(['ai_provider', patch.provider]);
  if (patch.model !== undefined) pairs.push(['ai_model', patch.model]);
  if (patch.baseUrl !== undefined) pairs.push(['ai_base_url', patch.baseUrl]);
  if (patch.persona !== undefined) pairs.push(['ai_persona', patch.persona]);
  if (patch.api_key !== undefined) pairs.push(['ai_api_key', patch.api_key]);
  else if (patch.apiKey) pairs.push(['ai_api_key', patch.apiKey]);

  for (const [key, value] of pairs) {
    await query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [key, value],
    );
  }
  return publicAiSettings(await getAiSettings());
}

/* ------------------------------------------------------------ CONTEXTO ---- */
export async function buildContext() {
  const [overview, openOrders, menu] = await Promise.all([
    getOverview(),
    listOpenOrders(),
    query<Product>('SELECT id, name, price, category, keywords, favorite, active FROM products WHERE active = TRUE ORDER BY category, name'),
  ]);

  return {
    overview,
    openOrders,
    menu: menu.map((p) => ({ id: p.id, name: p.name, price: Number(p.price), category: p.category, keywords: p.keywords })),
    now: new Date().toISOString(),
  };
}

function contextToText(ctx: Awaited<ReturnType<typeof buildContext>>) {
  const o = ctx.overview;
  const money = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
  const lines: string[] = [];
  lines.push(`Estabelecimento: ${o.restaurant_name}`);
  lines.push(
    `Hoje: ${o.today.orders} contas fechadas, faturamento ${money(o.today.revenue)}, ticket médio ${money(
      o.today.avg_ticket,
    )}, ${o.today.items} itens vendidos, ${o.today.people} clientes.`,
  );
  lines.push(`Ontem: ${money(o.yesterday_revenue)}. Últimos 7 dias: ${money(o.week_revenue)}. Últimos 30 dias: ${money(o.month_revenue)}.`);
  lines.push(
    `Agora: ${o.open.tables} mesas abertas, somando ${money(o.open.total)} em consumo e ${o.open.items} itens.`,
  );
  if (o.top_today.length) {
    lines.push(`Mais vendidos hoje: ${o.top_today.map((t) => `${t.name} (${t.qty})`).join(', ')}.`);
  }
  if (o.top_week.length) {
    lines.push(`Mais vendidos na semana: ${o.top_week.map((t) => `${t.name} (${t.qty})`).join(', ')}.`);
  }
  if (ctx.openOrders.length) {
    lines.push(
      `Mesas abertas: ${ctx.openOrders
        .map((t: any) => `mesa ${t.table_number} (${t.items_count} itens, ${money(t.total_amount)}, ${t.minutes_open} min)`)
        .join('; ')}.`,
    );
  }
  lines.push(
    `Cardápio (id | nome | categoria | preço): ${ctx.menu
      .map((p) => `${p.id} | ${p.name} | ${p.category} | ${p.price.toFixed(2)}`)
      .join('; ')}`,
  );
  return lines.join('\n');
}

/* --------------------------------------------------- PROVEDOR EXTERNO ----- */
async function callLlm(system: string, user: string, s: AiSettings): Promise<string> {
  const model = s.model || DEFAULT_MODELS[s.provider];
  const timeout = 25000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    if (s.provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
        s.apiKey,
      )}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
        }),
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json: any = await res.json();
      return json.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
    }

    const base = (s.baseUrl || (s.provider === 'openai' ? 'https://api.openai.com/v1' : '')).replace(/\/$/, '');
    if (!base) throw new Error('Informe a URL base do provedor compatível com OpenAI.');
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 700,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`${s.provider} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json: any = await res.json();
    return json.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}

export async function testAiConnection(s: AiSettings) {
  if (s.provider === 'local') return { ok: true, message: 'Motor local ativo (não precisa de chave).' };
  if (!s.apiKey) return { ok: false, message: 'Informe a chave de API.' };
  try {
    const started = Date.now();
    const answer = await callLlm('Você responde de forma curtíssima.', 'Responda apenas: OK', s);
    return { ok: true, message: `Conectado em ${Date.now() - started}ms • resposta: ${answer.trim().slice(0, 40)}` };
  } catch (err: any) {
    return { ok: false, message: `Falha na conexão: ${err?.message ?? err}` };
  }
}

/* ------------------------------------------------------- MOTOR LOCAL ------ */
interface Parsed {
  tableNumber: number | null;
  quantity: number;
  product: { id: number; name: string; price: number } | null;
  raw: string;
}

const STOPWORDS = new Set([
  // verbos de ação
  'adicionar', 'adiciona', 'add', 'incluir', 'inclui', 'lancar', 'lanca', 'pedir', 'pede', 'quero', 'queria',
  'colocar', 'coloca', 'por', 'poe', 'bota', 'traz', 'mais',
  // palavras de pergunta
  'quanto', 'custa', 'custo', 'preco', 'valor', 'quais', 'qual', 'tem', 'teria', 'voce', 'vc', 'me', 'mim',
  'como', 'onde', 'que', 'quem', 'seria', 'sera', 'pode', 'poderia',
  // salão / tempo
  'mesa', 'mesas', 'aberta', 'abertas', 'aberto', 'fechada', 'agora', 'hoje', 'ontem', 'semana', 'ai',
  // conectivos
  'de', 'do', 'da', 'dos', 'das', 'um', 'uma', 'uns', 'umas', 'favor', 'pra', 'para', 'na', 'no', 'com', 'e',
  'o', 'a', 'os', 'as', 'ja', 'eh', 'é',
]);

function parseMessage(
  message: string,
  menu: Array<{ id: number; name: string; price: number; keywords?: string | null; category?: string | null }>,
): Parsed {
  const text = normalize(message);

  const tableMatch = text.match(/mesa\s*(?:n[ºo]?\s*)?(\d{1,3})/);
  const tableNumber = tableMatch ? Number(tableMatch[1]) : null;

  let quantity = 1;
  for (const m of text.matchAll(/(?:^|\s)(\d{1,3})\s*(?:x|un|unid|unidades?)?(?=\s|$)/g)) {
    const value = Number(m[1]);
    if (value > 0 && value < 100 && value !== tableNumber) {
      quantity = value;
      break;
    }
  }

  const cleaned = text
    .replace(/mesa\s*(?:n[ºo]?\s*)?\d{1,3}/g, ' ')
    .replace(/\b\d{1,3}\b/g, ' ')
    .split(' ')
    .filter((w) => w && !STOPWORDS.has(w))
    .join(' ')
    .trim();

  const best = menu
    .map((p) => ({ p, score: looseScore(cleaned, `${p.name} ${p.keywords ?? ''} ${p.category ?? ''}`) }))
    .filter((r) => r.score >= 0.55)
    .sort((a, b) => b.score - a.score)[0];

  return {
    tableNumber,
    quantity,
    product: best ? { id: best.p.id, name: best.p.name, price: Number(best.p.price) } : null,
    raw: cleaned,
  };
}

/** Pontuação simplificada (frase limpa -> nome do produto). */
function looseScore(term: string, name: string) {
  const t = normalize(term);
  const n = normalize(name);
  if (!t) return 0;
  if (n.includes(t)) return 0.95;
  const tokens = t.split(' ').filter(Boolean);
  if (!tokens.length) return 0;
  let hits = 0;
  for (const token of tokens) if (n.includes(token)) hits++;
  const coverage = hits / tokens.length;
  return coverage >= 0.6 ? 0.6 + 0.3 * coverage : 0;
}

const money = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

async function localAnswer(message: string, ctx: Awaited<ReturnType<typeof buildContext>>, tableId?: number): Promise<AiReply> {
  const text = normalize(message);
  const o = ctx.overview;
  const actions: AiAction[] = [];
  const suggestions: string[] = [];
  const openTables = ctx.openOrders as any[];

  const has = (...words: string[]) => words.some((w) => text.includes(w));
  const wantsTop = has(
    'mais vendid', 'vende mais', 'vendem mais', 'sai mais', 'saiu mais', 'mais sai', 'campe',
    'ranking', 'melhores', 'top 5', 'top5', 'top de', 'lidera',
  );

  let currentOrder: any = null;
  if (tableId) {
    const detail = await getOrderView(await orderIdFromTable(tableId)).catch(() => null);
    if (detail) currentOrder = detail;
  }

  const parsed = parseMessage(message, ctx.menu);
  const isQuestion = has('quanto', 'cust', 'preco', 'valor', 'suger', 'sugest', 'indica', 'recomend', 'qual', 'como', 'onde');
  const wantsAction =
    !isQuestion &&
    (has('adicion', 'add ', 'lanc', 'incluir', 'inclu', 'quero', 'traz', 'poe', 'coloca', 'manda', 'pede') ||
      // frase implícita: "2 espeto de picanha na mesa 5" ou "picanha na mesa 5"
      (!!parsed.product && (parsed.quantity > 1 || parsed.tableNumber !== null)));
  const wantsTableInfo = parsed.tableNumber !== null && !wantsAction;
  const wantsOpenList = has('mesa aberta', 'mesas aberta', 'ocupad', 'salao', 'mapa', 'mesas');

  // --- 0. Limpeza / ajuda / saudação --------------------------------------
  if (has('limpar', 'limpeza', 'organiz', 'reset')) {
    return {
      answer:
        'O botão de limpeza fica no topo da tela de Mesas (ícone de vassoura, só para admin). Ele permite: sincronizar o status das mesas, fechar mesas vazias, apagar contas antigas, limpar o histórico da IA e zerar os dados de demonstração.',
      actions: [],
      provider: 'motor local',
      mode: 'local',
      suggestions: ['Como está o movimento hoje?'],
    };
  }
  if (has('ajuda', 'o que voce faz', 'o que você faz', 'help', 'comandos')) {
    return {
      answer:
        'Posso: buscar pratos mesmo com erro de digitação, lançar itens (ex.: "2 picanha na mesa 5"), dizer quanto está cada mesa, mostrar faturamento, ticket médio, mais vendidos e o horário de pico, e sugerir combinações com base no que o cliente já pediu.',
      actions: [],
      provider: 'motor local',
      mode: 'local',
      suggestions: ['Quanto está a mesa 5?', 'Mais vendidos hoje', 'Como está o movimento hoje?'],
    };
  }
  if (has('oi', 'ola', 'bom dia', 'boa tarde', 'boa noite') && text.length < 25) {
    return {
      answer: `Oi! Sou o assistente do ${o.restaurant_name}. Hoje já foram ${o.today.orders} contas e ${money(o.today.revenue)}. O que você precisa?`,
      actions: [],
      provider: 'motor local',
      mode: 'local',
      suggestions: ['Mesas abertas agora', 'Mais vendidos hoje', 'Sugere uma bebida?'],
    };
  }

  // --- 1. Ação: adicionar item -------------------------------------------
  if (wantsAction && parsed.product) {
    const targetTable = parsed.tableNumber;
    const openTable = targetTable ? openTables.find((t) => t.table_number === targetTable) : currentOrder ? openTables.find((t) => t.table_number === currentOrder.table_number) : null;
    const qty = parsed.quantity;

    if (openTable) {
      actions.push({
        type: 'add_item',
        label: `Lançar ${qty}x ${parsed.product.name} na mesa ${openTable.table_number}`,
        order_id: openTable.id,
        table_number: openTable.table_number,
        product_id: parsed.product.id,
        product_name: parsed.product.name,
        quantity: qty,
        unit_price: parsed.product.price,
      });
      return {
        answer: `Beleza! ${qty}x ${parsed.product.name} (${money(parsed.product.price * qty)}) na mesa ${openTable.table_number}. Toque no botão abaixo para confirmar o lançamento.`,
        actions,
        provider: 'motor local',
        mode: 'local',
        suggestions: [`Quanto está a mesa ${openTable.table_number}?`, 'Sugere uma bebida?'],
      };
    }
    if (targetTable) {
      actions.push({ type: 'open_table', label: `Abrir a mesa ${targetTable} e lançar`, table_number: targetTable });
      return {
        answer: `A mesa ${targetTable} está livre. Toque abaixo: eu abro a mesa e já lanço ${qty}x ${parsed.product.name}.`,
        actions,
        provider: 'motor local',
        mode: 'local',
        suggestions: ['Mesas abertas agora', 'Como está o movimento hoje?'],
      };
    }
    actions.push({ type: 'search', label: `Buscar "${parsed.product.name}"`, term: parsed.product.name });
    return {
      answer: `Encontrei ${parsed.product.name} por ${money(parsed.product.price)}. Diga o número da mesa (ex.: "mesa 5") que eu lanço o item.`,
      actions,
      provider: 'motor local',
      mode: 'local',
      suggestions: ['Quanto está a mesa 5?', 'Mais vendidos hoje'],
    };
  }

  // --- 2. Preço de produto -------------------------------------------------
  if (parsed.product && has('quanto', 'custo', 'preco', 'preço', 'custa', 'valor')) {
    const product = parsed.product;
    actions.push({
      type: 'search',
      label: `Buscar ${product.name}`,
      term: product.name,
    });
    if (currentOrder) {
      actions.push({
        type: 'add_item',
        label: `Lançar 1x ${product.name} (${money(product.price)})`,
        order_id: currentOrder.id,
        table_number: currentOrder.table_number,
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit_price: product.price,
      });
    }
    return {
      answer: `${product.name}: ${money(product.price)}.${currentOrder ? ' Mesa ' + currentOrder.table_number + ' aberta.' : ''}`,
      actions,
      provider: 'motor local',
      mode: 'local',
      suggestions: ['Mais vendidos hoje', 'Sugere uma bebida?'],
    };
  }

  // --- 3. Detalhe de uma mesa ---------------------------------------------
  if (wantsTableInfo) {
    const open = openTables.find((t) => t.table_number === parsed.tableNumber);
    if (open) {
      const detail = await getOrderView(open.id);
      const preview = detail.items
        .filter((i) => i.status === 'active')
        .slice(0, 6)
        .map((i) => `${i.quantity}x ${i.name}`)
        .join(', ');
      actions.push({ type: 'goto_table', label: `Abrir a mesa ${open.table_number}`, table_number: open.table_number });
      return {
        answer:
          `Mesa ${open.table_number}: ${money(open.total_amount)} em ${detail.active_count} itens lançados` +
          `${detail.commands.length > 1 ? ` (${detail.commands.length} comandas)` : ''}, aberta há ${open.minutes_open} min.` +
          (preview ? `\nItens: ${preview}${detail.active_count > 6 ? '...' : ''}` : ''),
        actions,
        provider: 'motor local',
        mode: 'local',
        suggestions: [`Sugere uma bebida para a mesa ${open.table_number}?`, 'Fechar essa conta'],
      };
    }
    return {
      answer: `A mesa ${parsed.tableNumber} está livre.`,
      actions: [{ type: 'goto_table', label: `Ir para a mesa ${parsed.tableNumber}`, table_number: parsed.tableNumber! }],
      provider: 'motor local',
      mode: 'local',
      suggestions: ['Mesas abertas agora'],
    };
  }

  // --- 3. Faturamento / movimento ----------------------------------------
  if (
    !wantsTop &&
    (/\b(faturamento|vendas|vendeu|vendi|caixa|movimento|resultado|faturei)\b/.test(text) ||
      has('quanto fez', 'quanto entrou', 'quanto vendeu'))
  ) {
    const diff = o.yesterday_revenue ? ((o.today.revenue - o.yesterday_revenue) / o.yesterday_revenue) * 100 : 0;
    const tendency = diff === 0 ? 'igual a ontem' : diff > 0 ? `${diff.toFixed(1)}% acima de ontem` : `${Math.abs(diff).toFixed(1)}% abaixo de ontem`;
    return {
      answer:
        `Hoje: ${money(o.today.revenue)} em ${o.today.orders} contas fechadas (${tendency}).\n` +
        `Ticket médio ${money(o.today.avg_ticket)} • ${o.today.items} itens • ${o.today.people} clientes.\n` +
        `Ainda em aberto: ${o.open.tables} mesas com ${money(o.open.total)} em consumo.`,
      actions: [],
      provider: 'motor local',
      mode: 'local',
      suggestions: ['Mais vendidos hoje', 'Mesas abertas agora', 'Qual o melhor horário?'],
    };
  }

  // --- 4. Mais vendidos ---------------------------------------------------
  if (wantsTop) {
    const list = (o.top_today.length ? o.top_today : o.top_week).slice(0, 6);
    if (!list.length) {
      return {
        answer: 'Ainda não há vendas registradas para ranquear. Assim que as contas forem fechadas eu monto o ranking.',
        actions: [],
        provider: 'motor local',
        mode: 'local',
        suggestions: ['Como está o movimento hoje?'],
      };
    }
    return {
      answer: `Top vendas ${o.top_today.length ? 'de hoje' : 'da semana'}:\n` + list.map((t, i) => `${i + 1}º ${t.name} — ${t.qty} un (${money(t.revenue)})`).join('\n'),
      actions: list.slice(0, 1).map((t) => ({
        type: 'search' as const,
        label: `Buscar ${t.name}`,
        term: t.name,
      })),
      provider: 'motor local',
      mode: 'local',
      suggestions: ['Como está o movimento hoje?', 'Qual o melhor horário?'],
    };
  }

  // --- 5. Melhor horário --------------------------------------------------
  if (has('horario', 'horário', 'movimento', 'pico', 'cheio', 'lotad')) {
    const busiest = [...o.hours].sort((a, b) => b.orders - a.orders)[0];
    if (!busiest) {
      return { answer: 'Ainda não tenho histórico suficiente para dizer o horário de pico.', actions: [], provider: 'motor local', mode: 'local', suggestions: [] };
    }
    return {
      answer: `Seu pico é por volta das ${busiest.hour}h (${busiest.orders} contas nos últimos 7 dias). Hoje já são ${o.today.orders} contas e ${o.open.tables} mesas abertas agora.`,
      actions: [],
      provider: 'motor local',
      mode: 'local',
      suggestions: ['Mais vendidos da semana', 'Sugere uma promoção?'],
    };
  }

  // --- 6. Mesas ocupadas --------------------------------------------------
  if (wantsOpenList || has('aberta')) {
    if (!openTables.length) {
      return { answer: 'Nenhuma mesa aberta agora — salão livre.', actions: [], provider: 'motor local', mode: 'local', suggestions: ['Mais vendidos hoje'] };
    }
    return {
      answer:
        `${openTables.length} mesas abertas (${money(o.open.total)} em consumo):\n` +
        openTables
          .slice(0, 10)
          .map((t) => `• Mesa ${t.table_number} — ${money(t.total_amount)} • ${t.items_count} itens • ${t.minutes_open} min`)
          .join('\n') +
        (openTables.length > 10 ? `\n...e mais ${openTables.length - 10} mesas.` : ''),
      actions: [],
      provider: 'motor local',
      mode: 'local',
      suggestions: ['Quanto está a mesa ' + openTables[0].table_number + '?', 'Mais vendidos hoje'],
    };
  }

  // --- 7. Sugestão de venda ------------------------------------------------
  if (has('suger', 'combina', 'indica', 'recomend', 'vender mais', 'upsell')) {
    const hint = has('bebida', 'cerveja', 'drink', 'gelada', 'refrigerante', 'suco')
      ? ('bebida' as const)
      : has('sobremesa', 'doce', 'dessert')
        ? ('doce' as const)
        : has('porcao', 'porção', 'petisco', 'entrada', 'comida', 'espeto')
          ? ('comida' as const)
          : undefined;
    const sug = await suggestForContext({ order_id: currentOrder?.id, limit: 3, hint });
    if (!sug.suggestions.length) {
      return { answer: 'Sem histórico suficiente para sugerir combinações ainda.', actions: [], provider: 'motor local', mode: 'local', suggestions: [] };
    }
    return {
      answer:
        `Sugestões${currentOrder ? ` para a mesa ${currentOrder.table_number}` : ''}:\n` +
        sug.suggestions.map((s) => `• ${s.product.name} (${money(s.product.price_number ?? s.product.price)}) — ${s.reason}`).join('\n'),
      actions: sug.suggestions.map((s) => ({
        type: 'add_item' as const,
        label: `+ ${s.product.name}`,
        order_id: currentOrder?.id,
        product_id: s.product.id,
        product_name: s.product.name,
        quantity: 1,
        unit_price: Number(s.product.price),
      })),
      provider: 'motor local',
      mode: 'local',
      suggestions: ['Como está o movimento hoje?'],
    };
  }


  // --- 9. Ajuda / limpeza (tratado no topo) --------------------------------

  // --- 10. Fallback: busca no cardápio -------------------------------------
  const results = parsed.raw
    ? (await searchProducts(parsed.raw, 5)).length
      ? await searchProducts(parsed.raw, 5)
      : await searchProducts(message, 5)
    : await searchProducts(message, 5);
  if (results.length) {
    return {
      answer: `Encontrei no cardápio:\n` + results.map((r) => `• ${r.name} — ${money(r.price_number)} (${r.category})`).join('\n'),
      actions: results.slice(0, 3).map((r) => ({
        type: 'add_item' as const,
        label: `+ ${r.name}`,
        order_id: currentOrder?.id,
        product_id: r.id,
        product_name: r.name,
        quantity: 1,
        unit_price: r.price_number,
      })),
      provider: 'motor local',
      mode: 'local',
      suggestions: ['Mais vendidos hoje', 'Mesas abertas agora'],
    };
  }

  return {
    answer:
      'Não entendi 100%. Tente algo como: "2 espetos de picanha na mesa 5", "quanto está a mesa 12?", "faturamento de hoje" ou "o que vende mais?".',
    actions: [],
    provider: 'motor local',
    mode: 'local',
    suggestions: ['Faturamento de hoje', 'Mais vendidos hoje', 'Mesas abertas agora'],
  };
}

async function orderIdFromTable(tableId: number): Promise<number> {
  const rows = await query<{ id: number }>("SELECT id FROM orders WHERE table_id = $1 AND status = 'open'", [tableId]);
  return rows[0]?.id ?? 0;
}

/* --------------------------------------------------- SUGESTÕES (UPSELL) -- */
export interface Suggestion {
  product: Product & { price_number: number };
  reason: string;
  score: number;
}

export const SUGGESTION_GROUPS: Record<string, string[]> = {
  bebida: ['Bebidas', 'Cervejas', 'Drinks'],
  comida: ['Espetos de Carne', 'Espetos Especiais', 'Porções', 'Acompanhamentos'],
  doce: ['Sobremesas'],
};

export async function suggestForContext(opts: {
  order_id?: number;
  table_id?: number;
  limit?: number;
  hint?: 'bebida' | 'comida' | 'doce';
}): Promise<{
  suggestions: Suggestion[];
  based_on: string[];
  provider: string;
}> {
  const limit = Math.min(8, Math.max(1, opts.limit ?? 5));
  let orderId = opts.order_id;
  if (!orderId && opts.table_id) orderId = (await orderIdFromTable(opts.table_id)) || undefined;

  const currentIds = orderId ? await getOrderProductIds(orderId) : [];
  const basedOn: string[] = [];
  if (currentIds.length) {
    const names = await query<{ name: string }>(`SELECT name FROM products WHERE id IN (${currentIds.map((_, i) => `$${i + 1}`).join(',')})`, currentIds);
    basedOn.push(...names.map((n) => n.name));
  }

  const out: Suggestion[] = [];
  const seen = new Set<number>(currentIds);

  // 1) co-ocorrência real do histórico
  if (currentIds.length) {
    const co = await getCooccurrence(currentIds, limit * 2);
    for (const c of co) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({
        product: { ...c, price_number: c.price, active: true } as any,
        reason: `costuma sair junto com ${basedOn[0] ?? 'esse item'} (${c.strength}x no histórico)`,
        score: c.strength,
      });
    }
  }

  // 2) bebidas / acompanhamentos que combinam com o que está na mesa
  if (out.length < limit) {
    const cats = currentIds.length
      ? (await query<{ category: string; qty: number }>(
          `SELECT p.category, SUM(i.quantity)::int AS qty FROM order_items i JOIN products p ON p.id = i.product_id
            WHERE i.order_id = $1 AND i.status = 'active' GROUP BY 1 ORDER BY qty DESC`,
          [orderId!],
        ))
      : [];
    const hasDrink = cats.some((c) => ['Bebidas', 'Cervejas', 'Drinks'].includes(c.category ?? ''));
    const hasFood = cats.some((c) => (c.category ?? '').startsWith('Espetos') || c.category === 'Porções');
    const wanted = opts.hint
      ? SUGGESTION_GROUPS[opts.hint]
      : hasFood && !hasDrink
        ? ['Cervejas', 'Bebidas', 'Drinks']
        : hasDrink && !hasFood
          ? ['Espetos de Carne', 'Espetos Especiais', 'Porções']
          : ['Espetos Especiais', 'Porções', 'Bebidas'];

    const candidates = await query<Product & { price_number: number }>(
      `SELECT *, price AS price_number FROM products WHERE active = TRUE AND favorite = TRUE ORDER BY sort_order LIMIT 20`,
    );
    for (const c of candidates) {
      if (out.length >= limit) break;
      if (seen.has(c.id)) continue;
      if (!wanted.includes(c.category ?? '')) continue;
      seen.add(c.id);
      out.push({
        product: { ...c, price_number: Number(c.price) },
        reason: wanted[0].includes('Beb') || wanted[0] === 'Drinks' ? 'bebida gelada é o pedido que mais falta na mesa' : 'entrada/porção que combina com o consumo atual',
        score: 0.5,
      });
    }
  }

  // 3) campeões de venda como reserva
  if (out.length < limit) {
    const top = await query<Product & { price_number: number; qty: number }>(`
      SELECT p.*, p.price AS price_number, SUM(i.quantity)::int AS qty
        FROM order_items i JOIN products p ON p.id = i.product_id
       WHERE i.status = 'active' AND p.active = TRUE
       GROUP BY p.id ORDER BY qty DESC LIMIT 10
    `);
    for (const t of top) {
      if (out.length >= limit) break;
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push({ product: { ...t, price_number: Number(t.price) }, reason: `${t.qty} unidades vendidas no histórico`, score: 0.3 });
    }
  }

  // com foco explícito ("bebida", "sobremesa"), o grupo pedido vem primeiro
  if (opts.hint) {
    const group = SUGGESTION_GROUPS[opts.hint] ?? [];
    out.sort((a, b) => Number(group.includes(b.product.category ?? '')) - Number(group.includes(a.product.category ?? '')));
  }

  const s = await getAiSettings();
  return { suggestions: out.slice(0, limit), based_on: basedOn, provider: s.provider === 'local' ? 'motor local' : s.provider };
}

/* ------------------------------------------------------------- BUSCA IA -- */
export async function aiSearch(term: string, limit = 8) {
  const local = await searchProducts(term, Math.max(limit, 6));
  const s = await getAiSettings();
  if (!s.enabled || s.provider === 'local' || !s.apiKey || !term.trim() || local.length === 0) {
    return {
      results: local.map((r) => ({ ...r, price: r.price_number })),
      provider: 'motor local',
      understood: local[0]?.name ?? null,
    };
  }

  // com IA externa: pede para escolher os itens corretos entre os candidatos
  try {
    const shortlist = (await query<Product>('SELECT id, name, category, price FROM products WHERE active = TRUE ORDER BY category, name')).map(
      (p, i) => `${i + 1}. id=${p.id} ${p.name} (${p.category}) R$${Number(p.price).toFixed(2)}`,
    );
    const answer = await callLlm(
      'Você é o buscador de um PDV de espetaria. Receberá uma frase digitada rapidamente por um garçom e uma lista de produtos com id. Responda APENAS com os ids separados por vírgula, do mais provável ao menos provável (máximo 8). Nenhuma explicação.',
      `Frase: "${term}"\n\nProdutos:\n${shortlist.join('\n')}`,
      s,
    );
    const ids = (answer.match(/\d+/g) ?? []).map(Number).slice(0, limit);
    if (!ids.length) throw new Error('sem ids');
    const rows = await query<Product>(`SELECT * FROM products WHERE id IN (${ids.map((_, i) => `$${i + 1}`).join(',')})`, ids);
    const ordered = ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean) as Product[];
    return {
      results: ordered.map((p) => ({ ...p, price: Number(p.price), score: 1, price_number: Number(p.price) })),
      provider: s.provider,
      understood: ordered[0]?.name ?? null,
    };
  } catch (err: any) {
    return {
      results: local.map((r) => ({ ...r, price: r.price_number })),
      provider: 'motor local',
      understood: local[0]?.name ?? null,
      note: `IA externa falhou (${err?.message?.slice(0, 80) ?? 'erro'}) — usei o motor local.`,
    } as any;
  }
}

/* ---------------------------------------------------------------- CHAT ---- */
export async function aiChat(message: string, opts: { table_id?: number; user_name?: string } = {}): Promise<AiReply> {
  const ctx = await buildContext();
  const local = await localAnswer(message, ctx, opts.table_id);
  const s = await getAiSettings();

  if (s.enabled && s.provider !== 'local' && s.apiKey) {
    try {
      const system =
        `${s.persona}\nVocê ajuda a equipe de um PDV de espetaria. Responda em português do Brasil, curto e prático ` +
        `(máximo 6 linhas), use os dados reais abaixo. Nunca invente números que não estejam aqui.\n\n=== DADOS DO SISTEMA AGORA ===\n` +
        contextToText(ctx);

      const answer = await callLlm(system, message, s);
      if (answer?.trim()) {
        return {
          answer: answer.trim(),
          actions: local.actions,
          provider: s.provider,
          mode: 'remoto',
          suggestions: local.suggestions,
        };
      }
      throw new Error('resposta vazia');
    } catch (err: any) {
      return {
        ...local,
        note: `IA externa indisponível (${String(err?.message ?? err).slice(0, 100)}). Respondi com o motor local.`,
      };
    }
  }

  return local;
}

/* ------------------------------------------------------- RESUMO DO DIA --- */
export async function aiSummary(): Promise<{ headline: string; bullets: string[]; provider: string; mode: string }> {
  const o = await getOverview();
  const s = await getAiSettings();
  const money = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
  const diff = o.yesterday_revenue ? ((o.today.revenue - o.yesterday_revenue) / o.yesterday_revenue) * 100 : 0;
  const busiest = [...o.hours].sort((a, b) => b.orders - a.orders)[0];

  const fallbackBullets = [
    `Faturamento de hoje: ${money(o.today.revenue)} em ${o.today.orders} contas (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}% vs ontem).`,
    `Ticket médio ${money(o.today.avg_ticket)} • ${o.today.items} itens vendidos • ${o.today.people} clientes atendidos.`,
    `${o.open.tables} mesas abertas agora, com ${money(o.open.total)} em consumo.`,
    o.top_today.length
      ? `Campeão de vendas: ${o.top_today[0].name} (${o.top_today[0].qty} un).`
      : 'Nenhuma venda registrada hoje ainda.',
    busiest ? `Horário de maior movimento: ${busiest.hour}h.` : 'Sem histórico de horários ainda.',
  ];

  if (!s.enabled || s.provider === 'local' || !s.apiKey) {
    return {
      headline: `Resumo de ${new Date().toLocaleDateString('pt-BR')}`,
      bullets: fallbackBullets,
      provider: 'motor local',
      mode: 'local',
    };
  }

  try {
    const ctx = await buildContext();
    const answer = await callLlm(
      `${s.persona} Gere um resumo gerencial com no máximo 5 tópicos curtos, em português, começando cada linha com "- ". Use apenas os dados fornecidos.`,
      `Gere o resumo do dia.\n\n${contextToText(ctx)}`,
      s,
    );
    const bullets = answer
      .split('\n')
      .map((l) => l.replace(/^[-•*]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 6);
    return {
      headline: `Resumo de ${new Date().toLocaleDateString('pt-BR')}`,
      bullets: bullets.length ? bullets : fallbackBullets,
      provider: s.provider,
      mode: 'remoto',
    };
  } catch {
    return {
      headline: `Resumo de ${new Date().toLocaleDateString('pt-BR')}`,
      bullets: fallbackBullets,
      provider: 'motor local',
      mode: 'local',
    };
  }
}
