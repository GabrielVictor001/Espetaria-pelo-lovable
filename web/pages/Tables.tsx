import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Coins, Hash, Loader2, RefreshCw, Search, TrendingUp, Users, Utensils } from 'lucide-react';
import { api, type Overview, type TableSummary } from '../lib/api';
import { brl, minutesLabel } from '../lib/format';
import { useAuth, useToast } from '../lib/store';

const ZONES = ['Todas', 'Salão', 'Varanda', 'Área externa'];

export default function Tables() {
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'free' | 'occupied'>('all');
  const [zoneFilter, setZoneFilter] = useState('Todas');
  const [term, setTerm] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.tables();
      setTables(data.tables);
      setOverview(data.overview);
    } catch (err: any) {
      if (!silent) toast.error('Não foi possível carregar as mesas', err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), 20000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** 1 CLIQUE = mesa aberta (e já vai para o lançamento de itens). */
  const handleTable = async (table: TableSummary) => {
    if (table.occupied) {
      navigate(`/mesa/${table.id}`);
      return;
    }
    setOpening(table.id);
    try {
      await api.openTable(table.id, 1);
      toast.success(`Mesa ${table.number} aberta!`, 'O campo de busca já está pronto para lançar itens.');
      navigate(`/mesa/${table.id}`);
    } catch (err: any) {
      toast.error(`Não foi possível abrir a mesa ${table.number}`, err.message);
      load(true);
    } finally {
      setOpening(null);
    }
  };

  const filtered = useMemo(() => {
    const t = term.trim();
    return tables.filter((table) => {
      if (statusFilter === 'free' && table.occupied) return false;
      if (statusFilter === 'occupied' && !table.occupied) return false;
      if (zoneFilter !== 'Todas' && table.zone !== zoneFilter) return false;
      if (t && !String(table.number).includes(t)) return false;
      return true;
    });
  }, [tables, statusFilter, zoneFilter, term]);

  const occupied = tables.filter((t) => t.occupied);

  return (
    <div className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-4 sm:px-5">
      {/* Resumo do dia */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
        <div className="kpi">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <Coins size={13} className="text-brasa-400" /> Faturamento hoje
          </span>
          <span className="text-xl font-black text-white sm:text-2xl">{brl(overview?.today.revenue ?? 0)}</span>
          <span className="text-[11px] text-slate-500">
            {overview?.today.orders ?? 0} contas • {overview?.today.items ?? 0} itens
          </span>
        </div>
        <div className="kpi">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <TrendingUp size={13} className="text-emerald-400" /> Ticket médio
          </span>
          <span className="text-xl font-black text-white sm:text-2xl">{brl(overview?.today.avg_ticket ?? 0)}</span>
          <span className="text-[11px] text-slate-500">{overview?.today.people ?? 0} clientes hoje</span>
        </div>
        <div className="kpi">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <Utensils size={13} className="text-brasa-400" /> Mesas abertas
          </span>
          <span className="text-xl font-black text-white sm:text-2xl">
            {occupied.length}
            <span className="ml-1 text-sm font-semibold text-slate-500">/ {tables.length}</span>
          </span>
          <span className="text-[11px] text-slate-500">{overview?.open.items ?? 0} itens em consumo</span>
        </div>
        <div className="kpi">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <Coins size={13} className="text-amber-400" /> Em consumo agora
          </span>
          <span className="text-xl font-black text-white sm:text-2xl">{brl(overview?.open.total ?? 0)}</span>
          <span className="text-[11px] text-slate-500">a receber das mesas abertas</span>
        </div>
        <div className="kpi col-span-2 lg:col-span-1">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <Users size={13} className="text-slate-400" /> Seu turno
          </span>
          <span className="truncate text-lg font-bold text-white">{user?.name}</span>
          <span className="text-[11px] text-slate-500">{user?.role === 'admin' ? 'Administrador' : 'Atendente'}</span>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            ref={searchRef}
            className="input pl-10"
            placeholder="Buscar mesa nº…  (tecla /)"
            inputMode="numeric"
            value={term}
            onChange={(e) => setTerm(e.target.value.replace(/\D/g, ''))}
          />
        </div>

        <div className="flex items-center gap-1.5">
          {(
            [
              ['all', 'Todas'],
              ['free', 'Livres'],
              ['occupied', 'Ocupadas'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`chip ${statusFilter === value ? 'chip-active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          {ZONES.map((zone) => (
            <button key={zone} onClick={() => setZoneFilter(zone)} className={`chip ${zoneFilter === zone ? 'chip-active' : ''}`}>
              {zone}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          <span className="hidden items-center gap-1 sm:flex">
            <Hash size={13} /> {filtered.length} mesas
          </span>
          <button className="btn-icon !h-9 !w-9" onClick={() => load()} title="Atualizar agora">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
        </div>
      </div>

      {/* Mapa de mesas */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
        {filtered.map((table) => {
          const isOpening = opening === table.id;
          const order = table.order;
          return (
            <button
              key={table.id}
              onClick={() => handleTable(table)}
              disabled={isOpening}
              className={`group relative flex aspect-square flex-col justify-between overflow-hidden rounded-2xl border p-2.5 text-left transition active:scale-[0.97] sm:p-3 ${
                table.occupied
                  ? 'border-brasa-500/40 bg-gradient-to-br from-brasa-900/50 to-carvao-800/90 shadow-lg shadow-black/30 hover:border-brasa-400'
                  : 'border-emerald-500/20 bg-emerald-950/20 hover:border-emerald-400/50 hover:bg-emerald-900/25'
              }`}
              title={order?.items_preview ?? `Mesa ${table.number} livre — toque para abrir`}
            >
              <div className="flex w-full items-start justify-between">
                <span className={`text-2xl font-black leading-none ${table.occupied ? 'text-white' : 'text-emerald-200'}`}>
                  {table.number}
                </span>
                {isOpening ? (
                  <Loader2 size={16} className="animate-spin text-brasa-300" />
                ) : table.occupied ? (
                  <span className="rounded-full bg-brasa-500/25 px-1.5 py-0.5 text-[10px] font-bold text-brasa-200">
                    {order?.items_count ?? 0} it
                  </span>
                ) : (
                  <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
                )}
              </div>

              {table.occupied && order ? (
                <div className="w-full">
                  <p className="truncate text-sm font-bold text-brasa-100">{brl(order.total)}</p>
                  <p className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Clock size={10} /> {minutesLabel(order.minutes_open)}
                    {order.people_count > 1 && <span>• {order.people_count}p</span>}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-500">{order.waiter_name?.split(' ')[0] ?? ''}</p>
                </div>
              ) : (
                <div className="w-full">
                  <p className="text-[11px] font-semibold text-emerald-300/90">Livre</p>
                  <p className="truncate text-[10px] text-slate-500">{table.zone}</p>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {!loading && filtered.length === 0 && (
        <div className="card mt-4 grid place-items-center gap-2 p-10 text-center">
          <Search size={22} className="text-slate-500" />
          <p className="text-sm text-slate-400">Nenhuma mesa encontrada com esses filtros.</p>
        </div>
      )}

      <p className="mt-4 text-center text-xs text-slate-500">
        Toque em uma mesa <span className="font-semibold text-emerald-300">livre</span> para abri-la na hora — o campo de busca de itens já vem pronto.
      </p>
    </div>
  );
}
