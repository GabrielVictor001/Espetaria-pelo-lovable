import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, LogIn, User as UserIcon } from 'lucide-react';
import { useAuth, useToast } from '../lib/store';

const DEMO = [
  { username: 'admin', label: 'Administrador', hint: 'admin123' },
  { username: 'joao', label: 'João (atendente)', hint: '123456' },
  { username: 'maria', label: 'Maria (atendente)', hint: '123456' },
];

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const user = await login(username.trim(), password);
      toast.success(`Bem-vindo, ${user.name.split(' ')[0]}!`, 'Você já está na tela de mesas.');
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message ?? 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-carvao-950 px-4 py-10">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brasa-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-red-600/10 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-brasa-400 to-brasa-700 text-3xl shadow-2xl shadow-brasa-900/50">
            🍢
          </span>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-white">Espetaria PDV</h1>
          <p className="mt-1 text-sm text-slate-400">Mesas, comandas, pedidos e IA — em um só lugar.</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <label className="label" htmlFor="username">
              Usuário
            </label>
            <div className="relative">
              <UserIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                id="username"
                autoFocus
                autoComplete="username"
                className="input pl-10"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="password">
              Senha
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                id="password"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                className="input px-10"
                placeholder="••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-white/5"
                aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && <p className="rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</p>}

          <button type="submit" className="btn-primary w-full !py-3 text-base" disabled={loading || !username || !password}>
            {loading ? 'Entrando…' : (
              <>
                <LogIn size={18} /> Entrar no PDV
              </>
            )}
          </button>

          <div className="border-t border-white/5 pt-4">
            <p className="mb-2 text-center text-[11px] uppercase tracking-wide text-slate-500">Acesso rápido (demonstração)</p>
            <div className="flex flex-wrap justify-center gap-2">
              {DEMO.map((d) => (
                <button
                  key={d.username}
                  type="button"
                  className="chip"
                  onClick={() => {
                    setUsername(d.username);
                    setPassword(d.hint);
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          Ao entrar você vai direto para o mapa de mesas. Toque em uma mesa livre para abri-la em 1 clique.
        </p>
      </div>
    </div>
  );
}
