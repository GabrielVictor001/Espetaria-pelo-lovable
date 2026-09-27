import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, Brush, CalendarDays, Coins, CreditCard, Download, RefreshCw, TrendingUp, Trophy, Users } from 'lucide-react';
import { api, type Overview } from '../lib/api';
import { brl, dateLabel, paymentLabel, weekdayLabel } from '../lib/format';
import { useToast } from '../lib/store';
import CleanupModal from '../components/CleanupModal';

export default function Dashboard() {
  const toast = useToast();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [report, setReport] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [days, setDays] = useState(7);
  const [tab, setTab] = useState<'resumo' | 'produtos' | 'auditoria'>('resumo');
  const [loading, setLoading] = useState(true);
  const [cleanupOpen, setCleanupOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [admin, rep, act] = await Promise.all([api.adminOverview(), api.reports(days), api.activity(60)]);
      setOverview(admin.overview);
      setReport(rep);
      setActivity(act.activity);
    } catch (err: any) {
      toast.error('Não foi possível carregar o painel', err.message);
    } finally {
      setLoading(false);
    }
  }, [days, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const series = overview?.series ?? [];
  const maxRevenue = Math.max(1, ...series.map((s) => s.revenue));
  const hours = overview?.hours ?? [];
  const maxHour = Math.max(1, ...hours.map((h) => h.orders));

  return (
    <div className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-4 sm:px-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-black text-white">Painel gerencial</h1>
        <div className="flex items-center gap-1.5">
          {[1, 7, 30, 90].map((d) => (
            <button key={d} className={`chip ${days === d ? 'chip-active' : ''}`} onClick={() => setDays(d)}>
              {d === 1 ? 'hoje' : `${d} dias`}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn-ghost !px-3" onClick={load} title="Atualizar">
            {loading ? <RefreshCw size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          </button>
          <a className="btn-ghost" href={api.backupUrl()} target="_blank" rel="noreferrer">
            <Download size={15} /> <span className="hidden sm:inline">Backup</span>
          </a>
          <button className="btn-primary" onClick={() => setCleanupOpen(true)}>
            <Brush size={15} /> Limpeza
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-6">
        <Kpi icon={<Coins size={14} className="text-brasa-400" />} label="Faturamento hoje" value={brl(overview?.today.revenue ?? 0)} sub={`${overview?.today.orders ?? 0} contas`} />
        <Kpi icon={<TrendingUp size={14} className="text-emerald-400" />} label="Ticket médio" value={brl(overview?.today.avg_ticket ?? 0)} sub={`${overview?.today.people ?? 0} clientes`} />
        <Kpi icon={<CalendarDays size={14} className="text-sky-400" />} label="Últimos 7 dias" value={brl(overview?.week_revenue ?? 0)} sub={`ontem ${brl(overview?.yesterday_revenue ?? 0)}`} />
        <Kpi icon={<CalendarDays size={14} className="text-indigo-400" />} label="Últimos 30 dias" value={brl(overview?.month_revenue ?? 0)} sub={`hoje ${brl(overview?.today.revenue ?? 0)}`} />
        <Kpi icon={<Users size={14} className="text-amber-400" />} label="Mesas abertas" value={`${overview?.open.tables ?? 0}`} sub={`${brl(overview?.open.total ?? 0)} em consumo`} />
        <Kpi icon={<CreditCard size={14} className="text-slate-300" />} label={`Retido no período (${days}d)`} value={brl(report?.by_day?.reduce((s: number, d: any) => s + d.total, 0) ?? 0)} sub={`${report?.by_day?.reduce((s: number, d: any) => s + d.orders, 0) ?? 0} contas`} />
      </div>

      <div className="mb-4 flex gap-1.5">
        {(
          [
            ['resumo', 'Vendas'],
            ['produtos', 'Produtos e equipe'],
            ['auditoria', 'Auditoria e limpeza'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={`chip ${tab === id ? 'chip-active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'resumo' && (
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="card p-4 lg:col-span-2">
            <h2 className="text-sm font-bold text-white">Faturamento dos últimos 14 dias</h2>
            <div className="mt-4 flex h-44 items-end gap-1">
              {series.map((s) => (
                <div key={s.day} className="group flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold text-slate-400 opacity-0 transition group-hover:opacity-100">{brl(s.revenue)}</span>
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-brasa-700 to-brasa-400 transition hover:from-brasa-600 hover:to-brasa-300"
                    style={{ height: `${Math.max(4, (s.revenue / maxRevenue) * 100)}%` }}
                    title={`${s.day}: ${brl(s.revenue)} • ${s.orders} contas`}
                  />
                  <span className="text-[9px] text-slate-500">{weekdayLabel(s.day)}</span>
                  <span className="text-[9px] text-slate-600">{dateLabel(s.day)}</span>
                </div>
              ))}
              {series.length === 0 && <p className="w-full text-center text-sm text-slate-500">Sem dados no período.</p>}
            </div>
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-bold text-white">Movimento por horário (7 dias)</h2>
            <div className="mt-4 space-y-2">
              {hours.map((h) => (
                <div key={h.hour} className="flex items-center gap-2">
                  <span className="w-10 text-xs font-semibold text-slate-400">{String(h.hour).padStart(2, '0')}h</span>
                  <div className="h-4 flex-1 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-gradient-to-r from-brasa-500 to-amber-400" style={{ width: `${(h.orders / maxHour) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right text-xs text-slate-400">{h.orders}</span>
                </div>
              ))}
              {hours.length === 0 && <p className="text-sm text-slate-500">Sem dados.</p>}
            </div>
          </div>

          <div className="card p-4 lg:col-span-2">
            <h2 className="text-sm font-bold text-white">Vendas por dia ({days} dia(s))</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2">Dia</th>
                    <th className="py-2 text-right">Contas</th>
                    <th className="py-2 text-right">Clientes</th>
                    <th className="py-2 text-right">Subtotal</th>
                    <th className="py-2 text-right">Taxa</th>
                    <th className="py-2 text-right">Desconto</th>
                    <th className="py-2 text-right">Total</th>
                    <th className="py-2 text-right">Ticket</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(report?.by_day ?? []).map((d: any) => (
                    <tr key={d.day} className="text-slate-200">
                      <td className="py-2 font-semibold">{dateLabel(d.day)}</td>
                      <td className="py-2 text-right">{d.orders}</td>
                      <td className="py-2 text-right">{d.people}</td>
                      <td className="py-2 text-right text-slate-400">{brl(d.subtotal)}</td>
                      <td className="py-2 text-right text-slate-400">{brl(d.service_fees)}</td>
                      <td className="py-2 text-right text-emerald-300">{brl(d.discounts)}</td>
                      <td className="py-2 text-right font-bold text-white">{brl(d.total)}</td>
                      <td className="py-2 text-right text-slate-300">{brl(d.avg_ticket)}</td>
                    </tr>
                  ))}
                  {(report?.by_day ?? []).length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-slate-500">
                        Nenhuma conta fechada no período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-bold text-white">Formas de pagamento</h2>
            <div className="mt-3 space-y-2">
              {(report?.by_method ?? []).map((m: any) => (
                <div key={m.method} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                  <span className="text-sm text-slate-200">{paymentLabel[m.method] ?? m.method}</span>
                  <span className="text-sm font-bold text-white">{brl(m.amount)}</span>
                </div>
              ))}
              {(report?.by_method ?? []).length === 0 && <p className="text-sm text-slate-500">Sem pagamentos no período.</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'produtos' && (
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="card p-4 lg:col-span-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-white">
              <Trophy size={15} className="text-brasa-400" /> Produtos mais vendidos ({days} dia(s))
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2">#</th>
                    <th className="py-2">Produto</th>
                    <th className="py-2">Categoria</th>
                    <th className="py-2 text-right">Qtd</th>
                    <th className="py-2 text-right">Faturamento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(report?.top_products ?? []).map((p: any, i: number) => (
                    <tr key={`${p.name}-${i}`}>
                      <td className="py-2 text-slate-500">{i + 1}</td>
                      <td className="py-2 font-semibold text-slate-100">{p.name}</td>
                      <td className="py-2 text-slate-400">{p.category}</td>
                      <td className="py-2 text-right text-slate-200">{p.qty}</td>
                      <td className="py-2 text-right font-bold text-brasa-200">{brl(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <div className="card p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                <Users size={15} className="text-sky-400" /> Desempenho da equipe
              </h2>
              <div className="mt-3 space-y-2">
                {(report?.by_waiter ?? []).map((w: any) => (
                  <div key={w.waiter} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                    <span className="text-sm text-slate-200">{w.waiter}</span>
                    <span className="text-xs text-slate-400">
                      {w.orders} contas • <span className="font-bold text-white">{brl(w.total)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                <AlertTriangle size={15} className="text-amber-400" /> Itens cancelados (botão X)
              </h2>
              <p className="mt-1 text-[11px] text-slate-400">Útil para achar erros de lançamento e desperdício.</p>
              <div className="mt-3 space-y-2">
                {(report?.canceled_items ?? []).map((c: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-red-500/15 bg-red-950/20 px-3 py-2">
                    <span className="min-w-0 truncate text-sm text-slate-200">
                      {c.name} <span className="text-xs text-slate-400">({c.qty} un)</span>
                    </span>
                    <span className="ml-2 shrink-0 text-xs text-slate-400">{c.canceled_by_name ?? '-'}</span>
                  </div>
                ))}
                {(report?.canceled_items ?? []).length === 0 && <p className="text-sm text-slate-500">Nenhum cancelamento no período. 🎉</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'auditoria' && (
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="card p-4 lg:col-span-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-white">
              <Activity size={15} className="text-emerald-400" /> Registro de atividades
            </h2>
            <div className="mt-3 max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
              {activity.map((a) => (
                <div key={a.id} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                  <span className="mt-0.5 rounded-lg bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">
                    {a.action.replace(/_/g, ' ')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-slate-200">{a.details ?? '-'}</p>
                    <p className="text-[10px] text-slate-500">
                      {a.user_name} • {new Date(a.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>
              ))}
              {activity.length === 0 && <p className="text-sm text-slate-500">Nada registrado ainda.</p>}
            </div>
          </div>

          <div className="space-y-3">
            <div className="card p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                <Brush size={15} className="text-brasa-400" /> Limpeza e organização
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Sincronize o status das mesas, feche mesas vazias, apague contas antigas e zere o movimento do dia. Tudo isso sem perder o
                cardápio nem os usuários.
              </p>
              <button className="btn-primary mt-3 w-full" onClick={() => setCleanupOpen(true)}>
                <Brush size={15} /> Abrir limpeza
              </button>
            </div>
            <div className="card p-4">
              <h2 className="text-sm font-bold text-white">Backup dos dados</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Baixa um arquivo JSON com usuários, mesas, produtos, contas, itens, pagamentos e configurações (senhas mascaradas).
              </p>
              <a className="btn-ghost mt-3 w-full" href={api.backupUrl()} target="_blank" rel="noreferrer">
                <Download size={15} /> Baixar backup agora
              </a>
            </div>
          </div>
        </div>
      )}

      {cleanupOpen && <CleanupModal onClose={() => setCleanupOpen(false)} onDone={() => load()} />}
    </div>
  );
}

const Kpi = ({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) => (
  <div className="kpi">
    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
      {icon} {label}
    </span>
    <span className="text-lg font-black text-white sm:text-xl">{value}</span>
    {sub && <span className="text-[11px] text-slate-500">{sub}</span>}
  </div>
);
