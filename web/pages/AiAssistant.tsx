import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Loader2, Plus, RefreshCw, Send, Sparkles, Trash2, User as UserIcon, Wand2, Zap } from 'lucide-react';
import { api, type AiAction, type AiReply, type TableSummary } from '../lib/api';
import { useToast } from '../lib/store';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  actions?: AiAction[];
  suggestions?: string[];
  provider?: string;
  note?: string;
}

const STARTERS = [
  'Faturamento de hoje',
  'Mais vendidos hoje',
  'Mesas abertas agora',
  'Qual o melhor horário?',
  'Sugere uma bebida para a mesa 5?',
  'Como está o movimento?',
];

export default function AiAssistant() {
  const toast = useToast();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ provider: string; mode: string; enabled: boolean } | null>(null);
  const [summary, setSummary] = useState<{ headline: string; bullets: string[]; provider: string } | null>(null);
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [contextTable, setContextTable] = useState<number | ''>('');
  const endRef = useRef<HTMLDivElement>(null);
  const counter = useRef(0);

  useEffect(() => {
    api.aiStatus().then(setStatus).catch(() => {});
    api.aiSummary().then(setSummary).catch(() => {});
    api.tables().then((r) => setTables(r.tables)).catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const openTables = useMemo(() => tables.filter((t) => t.occupied), [tables]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setInput('');
    setMessages((list) => [...list, { id: ++counter.current, role: 'user', content: message }]);
    setBusy(true);
    try {
      const reply: AiReply = await api.aiChat(message, contextTable ? Number(contextTable) : undefined);
      setMessages((list) => [
        ...list,
        {
          id: ++counter.current,
          role: 'assistant',
          content: reply.answer,
          actions: reply.actions,
          suggestions: reply.suggestions,
          provider: `${reply.mode === 'remoto' ? reply.provider : 'motor local'}`,
          note: reply.note,
        },
      ]);
    } catch (err: any) {
      toast.error('A IA não respondeu', err.message);
    } finally {
      setBusy(false);
    }
  };

  /** Executa a ação proposta pela IA (lançar item, abrir/ir para mesa). */
  const runAction = async (action: AiAction) => {
    try {
      if (action.type === 'add_item') {
        if (!action.order_id || !action.product_id) {
          toast.info('Diga o número da mesa', 'Ex.: "2 picanha na mesa 5" — aí eu lanço direto.');
          return;
        }
        const res = await api.addItem({
          order_id: action.order_id,
          product_id: action.product_id,
          quantity: action.quantity ?? 1,
          command_name: 'Geral',
        });
        toast.success(`Lançado: ${action.quantity ?? 1}x ${action.product_name}`, `Mesa ${res.order.table_number} • novo total ${brl(res.order.total)}`);
        setMessages((list) => [
          ...list,
          {
            id: ++counter.current,
            role: 'assistant',
            content: `Feito! ${action.quantity ?? 1}x ${action.product_name} lançado na mesa ${res.order.table_number}. Total agora: ${brl(res.order.total)}.`,
            provider: 'ação executada',
          },
        ]);
        return;
      }
      if (action.type === 'open_table' && action.table_number) {
        const table = tables.find((t) => t.number === action.table_number);
        if (!table) return;
        await api.openTable(table.id, 1);
        toast.success(`Mesa ${table.number} aberta`);
        navigate(`/mesa/${table.id}`);
        return;
      }
      if (action.type === 'goto_table' && action.table_number) {
        const table = tables.find((t) => t.number === action.table_number);
        if (table) navigate(`/mesa/${table.id}`);
        return;
      }
      if (action.type === 'search' && action.term) {
        setInput(action.term);
        toast.info('Termo na caixa de texto', 'Complete a frase, por exemplo: "2 ' + action.term + ' na mesa 7".');
      }
    } catch (err: any) {
      toast.error('Não foi possível executar', err.message);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-[1400px] flex-1 gap-4 px-3 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Chat */}
      <div className="card flex min-h-[60vh] flex-col overflow-hidden lg:h-[calc(100vh-140px)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-4 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brasa-400 to-brasa-700 text-white">
            <Bot size={18} />
          </span>
          <div className="leading-tight">
            <h1 className="text-sm font-bold text-white">Assistente do salão</h1>
            <p className="text-[11px] text-slate-400">
              {status?.mode === 'remoto' ? `IA conectada: ${status.provider}` : 'Motor de IA local (sem chave, offline)'}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <select
              value={contextTable}
              onChange={(e) => setContextTable(e.target.value ? Number(e.target.value) : '')}
              className="rounded-xl border border-white/10 bg-carvao-950 px-3 py-2 text-xs font-semibold text-white"
              title="Mesa em contexto (usada nas ações)"
            >
              <option value="">Contexto: nenhuma mesa</option>
              {openTables.map((t) => (
                <option key={t.id} value={t.number}>
                  Mesa {t.number}
                </option>
              ))}
            </select>
            <button
              className="btn-ghost !px-3"
              onClick={async () => {
                if (messages.length === 0) return;
                setMessages([]);
                await api.clearAiHistory().catch(() => {});
                toast.info('Conversa limpa');
              }}
              title="Limpar conversa"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div className="grid h-full place-items-center text-center">
              <div className="max-w-md space-y-3">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-brasa-500/15 text-brasa-300">
                  <Wand2 size={26} />
                </span>
                <h2 className="text-lg font-bold text-white">Pergunte em português</h2>
                <p className="text-sm text-slate-400">
                  Eu leio o cardápio, as mesas abertas e o histórico de vendas. Posso lançar itens e abrir mesas pra você.
                </p>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  {STARTERS.map((s) => (
                    <button key={s} className="chip" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
              {m.role === 'assistant' && (
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brasa-500/15 text-brasa-300">
                  <Sparkles size={15} />
                </span>
              )}
              <div className={`max-w-[85%] ${m.role === 'user' ? 'order-first' : ''}`}>
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-brasa-600/90 text-white'
                      : 'border border-white/5 bg-carvao-950/70 text-slate-100'
                  }`}
                >
                  {m.content}
                </div>

                {m.note && <p className="mt-1 text-[11px] text-amber-300">⚠ {m.note}</p>}

                {m.actions && m.actions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.actions.map((a, i) => (
                      <button
                        key={i}
                        onClick={() => runAction(a)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-brasa-500/40 bg-brasa-500/15 px-3 py-2 text-xs font-bold text-brasa-100 transition hover:bg-brasa-500/25 active:scale-95"
                      >
                        {a.type === 'add_item' ? <Plus size={12} /> : a.type === 'open_table' ? <Zap size={12} /> : <Sparkles size={12} />}
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}

                {m.suggestions && m.suggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.suggestions.map((s) => (
                      <button key={s} className="chip !text-[11px]" onClick={() => send(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                {m.provider && <p className="mt-1 text-[10px] text-slate-500">{m.provider}</p>}
              </div>
              {m.role === 'user' && (
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/5 text-slate-300">
                  <UserIcon size={15} />
                </span>
              )}
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 size={14} className="animate-spin" /> pensando…
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-white/5 p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder='Ex.: "2 espetos de picanha na mesa 5", "quanto está a mesa 12?", "o que vende mais?"'
              className="input max-h-32 min-h-[46px] flex-1 resize-none !py-3"
            />
            <button className="btn-primary !px-4 !py-3" onClick={() => send(input)} disabled={busy || !input.trim()}>
              <Send size={17} />
            </button>
          </div>
        </div>
      </div>

      {/* Resumo */}
      <div className="space-y-3">
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-brasa-400" />
            <h2 className="text-sm font-bold text-white">{summary?.headline ?? 'Resumo do dia'}</h2>
            <button
              className="btn-icon ml-auto !h-8 !w-8"
              onClick={() => api.aiSummary().then(setSummary).catch(() => {})}
              title="Atualizar resumo"
            >
              <RefreshCw size={14} />
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {(summary?.bullets ?? ['Carregando resumo…']).map((b, i) => (
              <li key={i} className="flex gap-2 text-xs leading-relaxed text-slate-300">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brasa-400" />
                {b}
              </li>
            ))}
          </ul>
          {summary?.provider && <p className="mt-3 text-[10px] text-slate-500">Gerado por {summary.provider}</p>}
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-bold text-white">Exemplos que eu entendo</h2>
          <ul className="mt-2 space-y-1.5 text-xs text-slate-400">
            <li>• <span className="text-slate-200">"2 picanha na mesa 5"</span> → lanço os itens</li>
            <li>• <span className="text-slate-200">"abre a mesa 12 com 4 pessoas"</span></li>
            <li>• <span className="text-slate-200">"quanto está a mesa 33?"</span></li>
            <li>• <span className="text-slate-200">"faturamento de hoje"</span> / ticket médio</li>
            <li>• <span className="text-slate-200">"mais vendidos da semana"</span></li>
            <li>• <span className="text-slate-200">"sugere uma sobremesa?"</span></li>
            <li>• <span className="text-slate-200">"tem espeto de camarão?"</span></li>
          </ul>
          <p className="mt-3 border-t border-white/5 pt-3 text-[11px] leading-relaxed text-slate-500">
            Sem chave de API, eu funciono 100% no servidor da casa (busca com tolerância a erros, sugestões pelo histórico real). Para
            respostas geradas por GPT/Gemini, configure em <span className="font-semibold text-slate-300">Configurações ▸ Inteligência Artificial</span>.
          </p>
        </div>
      </div>
    </div>
  );
}

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v ?? 0));
