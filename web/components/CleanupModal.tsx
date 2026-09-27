import { useEffect, useState } from 'react';
import { Brush, CalendarX, Eraser, History, ListChecks, RefreshCcw, RotateCcw, ShieldAlert, Utensils } from 'lucide-react';
import Modal from './Modal';
import { api } from '../lib/api';
import { useToast } from '../lib/store';

interface Preview {
  stale_table_status: number;
  empty_open_orders: number;
  closed_orders: number;
  canceled_items: number;
  ai_history: number;
  activity_logs: number;
}

const ACTIONS = [
  {
    id: 'sync_status',
    icon: RefreshCcw,
    title: 'Sincronizar status das mesas',
    description: 'Corrige mesas que ficaram marcadas como ocupadas sem conta aberta (e o contrário). Faça isso sempre que a tela parecer estranha.',
    tone: 'safe',
  },
  {
    id: 'close_empty_tables',
    icon: ListChecks,
    title: 'Fechar mesas sem consumo',
    description: 'Libera mesas que foram abertas por engano e não têm nenhum item lançado.',
    tone: 'safe',
  },
  {
    id: 'purge_canceled_items',
    icon: Eraser,
    title: 'Remover itens cancelados',
    description: 'Apaga do histórico os itens que foram cancelados no botão X, mantendo a conta e o total corretos.',
    tone: 'days',
  },
  {
    id: 'purge_closed_orders',
    icon: CalendarX,
    title: 'Apagar contas fechadas antigas',
    description: 'Remove definitivamente contas já fechadas/canceladas mais antigas que o período escolhido. Use para o sistema ficar leve.',
    tone: 'days',
  },
  {
    id: 'clear_ai_history',
    icon: Brush,
    title: 'Limpar histórico da IA',
    description: 'Apaga as conversas salvas com o assistente.',
    tone: 'safe',
  },
  {
    id: 'clear_activity_log',
    icon: History,
    title: 'Enxugar registro de atividades',
    description: 'Mantém apenas as últimas ações registradas (auditoria), apagando o restante.',
    tone: 'logs',
  },
  {
    id: 'reset_operational',
    icon: RotateCcw,
    title: 'Zerar movimento (recomendado no fim do dia)',
    description: 'Apaga contas, itens, pagamentos e históricos, libera todas as mesas e mantém cardápio e usuários. Comece o dia limpo.',
    tone: 'danger',
  },
  {
    id: 'factory_reset',
    icon: ShieldAlert,
    title: 'Restauração de fábrica',
    description: 'Apaga TUDO (inclusive cardápio e usuários) e recria os dados de demonstração. Só use para recomeçar do zero.',
    tone: 'factory',
  },
] as const;

export default function CleanupModal({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const toast = useToast();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [keepLogs, setKeepLogs] = useState(500);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = () => api.cleanupPreview().then((r) => setPreview(r.preview)).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const run = async (action: string) => {
    const needsConfirm = action === 'reset_operational' || action === 'factory_reset';
    if (needsConfirm && confirming !== action) {
      setConfirming(action);
      return;
    }
    setBusy(action);
    try {
      const { result } = await api.cleanup(action, { days, keep_logs: keepLogs, confirm: needsConfirm });
      toast.success('Limpeza concluída', result.message);
      setPreview(result ? (await api.cleanupPreview()).preview : null);
      setConfirming(null);
      if (action === 'factory_reset' || action === 'reset_operational') onDone(result.message);
    } catch (err: any) {
      toast.error('Não foi possível limpar', err.message);
    } finally {
      setBusy(null);
    }
  };

  const counts: Record<string, string> = preview
    ? {
        sync_status: `${preview.stale_table_status} mesa(s) com status errado`,
        close_empty_tables: `${preview.empty_open_orders} mesa(s) aberta(s) sem itens`,
        purge_canceled_items: `${preview.canceled_items} item(ns) cancelado(s) no histórico`,
        purge_closed_orders: `${preview.closed_orders} conta(s) fechada(s)/cancelada(s)`,
        clear_ai_history: `${preview.ai_history} mensagem(ns) salva(s)`,
        clear_activity_log: `${preview.activity_logs} registro(s) de atividade`,
      }
    : {};

  return (
    <Modal
      title="Limpeza e organização"
      subtitle="Mantenha o PDV leve e a tela do salão coerente. Área exclusiva do administrador."
      onClose={onClose}
      size="lg"
      footer={
        <>
          <span className="mr-auto text-xs text-slate-400">
            {preview ? `Base atual: ${preview.closed_orders} contas fechadas • ${preview.canceled_items} itens cancelados • ${preview.activity_logs} registros` : 'Carregando…'}
          </span>
          <button className="btn-ghost" onClick={onClose}>
            Fechar
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          const isDanger = action.tone === 'danger' || action.tone === 'factory';
          return (
            <div key={action.id} className={`rounded-2xl border p-4 ${isDanger ? 'border-red-500/25 bg-red-950/20' : 'border-white/5 bg-white/[0.02]'}`}>
              <div className="flex items-start gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${isDanger ? 'bg-red-500/15 text-red-300' : 'bg-brasa-500/15 text-brasa-300'}`}>
                  <Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{action.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{action.description}</p>
                  {counts[action.id] && <p className="mt-1 text-xs font-semibold text-brasa-300">{counts[action.id]}</p>}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                {action.tone === 'days' && (
                  <label className="mr-auto flex items-center gap-2 text-xs text-slate-400">
                    Mais antigas que
                    <input
                      type="number"
                      min={0}
                      max={3650}
                      value={days}
                      onChange={(e) => setDays(Math.max(0, Number(e.target.value)))}
                      className="w-20 rounded-lg border border-white/10 bg-carvao-950 px-2 py-1 text-center text-sm text-white"
                    />
                    dia(s)
                  </label>
                )}
                {action.tone === 'logs' && (
                  <label className="mr-auto flex items-center gap-2 text-xs text-slate-400">
                    Manter últimas
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      value={keepLogs}
                      onChange={(e) => setKeepLogs(Math.max(0, Number(e.target.value)))}
                      className="w-24 rounded-lg border border-white/10 bg-carvao-950 px-2 py-1 text-center text-sm text-white"
                    />
                    ações
                  </label>
                )}

                {confirming === action.id ? (
                  <>
                    <span className="text-xs font-semibold text-red-300">Tem certeza? Não dá para desfazer.</span>
                    <button className="btn-ghost !py-1.5" onClick={() => setConfirming(null)}>
                      Cancelar
                    </button>
                    <button className="btn-danger !py-1.5" disabled={busy === action.id} onClick={() => run(action.id)}>
                      {busy === action.id ? 'Executando…' : 'Confirmar'}
                    </button>
                  </>
                ) : (
                  <button
                    className={isDanger ? 'btn-danger !py-1.5' : 'btn-ghost !py-1.5'}
                    disabled={busy === action.id}
                    onClick={() => run(action.id)}
                  >
                    {busy === action.id ? 'Executando…' : isDanger ? <><Utensils size={14} /> Executar</> : 'Executar'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
