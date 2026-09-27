import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Bot, LayoutGrid, LogOut, PanelTop, Sparkles, Store, UtensilsCrossed } from 'lucide-react';
import { useAuth, useClock, useToast } from '../lib/store';
import { api } from '../lib/api';
import { brl } from '../lib/format';
import CleanupModal from './CleanupModal';

const navItem = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
    isActive ? 'bg-brasa-500/20 text-brasa-200' : 'text-slate-300 hover:bg-white/5 hover:text-white'
  }`;

export default function TopBar() {
  const { user, isAdmin, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const now = useClock(15000);
  const [open, setOpen] = useState(false);
  const [aiLabel, setAiLabel] = useState<string>('IA');
  const [cleanupOpen, setCleanupOpen] = useState(false);

  useEffect(() => {
    api
      .aiStatus()
      .then((s) => setAiLabel(s.provider === 'motor local' || s.mode === 'local' ? 'IA local' : s.provider))
      .catch(() => {});
  }, []);

  return (
    <>
      <header className="no-print sticky top-0 z-40 border-b border-white/5 bg-carvao-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-3 py-2.5 sm:px-5">
          <button onClick={() => navigate('/')} className="mr-1 flex items-center gap-2 text-left">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brasa-400 to-brasa-700 text-xl shadow-lg shadow-brasa-900/40">
              🍢
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="block text-sm font-bold text-white">Espetaria PDV</span>
              <span className="block text-[11px] text-slate-400">
                {now.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })} •{' '}
                {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </span>
          </button>

          <nav className="ml-1 flex flex-1 items-center gap-1 overflow-x-auto no-scrollbar">
            <NavLink to="/" className={navItem} end>
              <UtensilsCrossed size={16} /> <span className="hidden sm:inline">Mesas</span>
            </NavLink>
            <NavLink to="/ia" className={navItem}>
              <Sparkles size={16} /> <span className="hidden sm:inline">IA</span>
            </NavLink>
            {isAdmin && (
              <>
                <NavLink to="/painel" className={navItem}>
                  <LayoutGrid size={16} /> <span className="hidden sm:inline">Painel</span>
                </NavLink>
                <NavLink to="/cardapio" className={navItem}>
                  <PanelTop size={16} /> <span className="hidden sm:inline">Cardápio</span>
                </NavLink>
                <NavLink to="/config" className={navItem}>
                  <Store size={16} /> <span className="hidden sm:inline">Config</span>
                </NavLink>
              </>
            )}
          </nav>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 lg:flex">
              <Bot size={13} className="text-brasa-400" /> {aiLabel}
            </span>

            {/* BOTÃO DE LIMPEZA — só administrador */}
            {isAdmin && (
              <button
                onClick={() => setCleanupOpen(true)}
                title="Limpar e organizar dados"
                className="btn-ghost !px-3"
              >
                <Sparkles size={15} className="text-brasa-300" />
                <span className="hidden lg:inline">Limpar</span>
              </button>
            )}

            <div className="relative">
              <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-left transition hover:bg-white/10"
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 text-[11px] font-bold text-white">
                  {user?.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="hidden leading-tight sm:block">
                  <span className="block max-w-[110px] truncate text-xs font-semibold text-white">{user?.name}</span>
                  <span className="block text-[10px] text-slate-400">{isAdmin ? 'Administrador' : 'Atendente'}</span>
                </span>
              </button>

              {open && (
                <div className="animate-in absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-white/10 bg-carvao-800 shadow-2xl">
                  <div className="border-b border-white/5 px-4 py-3">
                    <p className="text-sm font-semibold text-white">{user?.name}</p>
                    <p className="text-xs text-slate-400">@{user?.username}</p>
                  </div>
                  <button
                    onClick={() => {
                      setOpen(false);
                      navigate('/ia');
                    }}
                    className="flex w-full items-center gap-2 px-4 py-3 text-sm text-slate-200 hover:bg-white/5"
                  >
                    <Sparkles size={15} /> Assistente IA
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => {
                        setOpen(false);
                        navigate('/config');
                      }}
                      className="flex w-full items-center gap-2 px-4 py-3 text-sm text-slate-200 hover:bg-white/5"
                    >
                      <Store size={15} /> Configurações
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setOpen(false);
                      logout();
                      toast.info('Sessão encerrada.');
                      navigate('/login');
                    }}
                    className="flex w-full items-center gap-2 border-t border-white/5 px-4 py-3 text-sm text-red-300 hover:bg-red-500/10"
                  >
                    <LogOut size={15} /> Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {cleanupOpen && (
        <CleanupModal
          onClose={() => setCleanupOpen(false)}
          onDone={(msg) => {
            toast.success('Limpeza concluída', msg);
            navigate('/');
          }}
        />
      )}
    </>
  );
}
