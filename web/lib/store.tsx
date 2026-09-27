import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler, tokenStore, type User } from './api';

/* ------------------------------------------------------------------ AUTH --- */
interface AuthCtx {
  user: User | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    const boot = async () => {
      if (!tokenStore.get()) {
        setReady(true);
        return;
      }
      try {
        const { user } = await api.me();
        setUser(user);
      } catch {
        tokenStore.clear();
      } finally {
        setReady(true);
      }
    };
    boot();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { token, user } = await api.login(username, password);
    tokenStore.set(token);
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    api.logout().catch(() => {});
  }, []);

  const value = useMemo(() => ({ user, ready, login, logout, isAdmin: user?.role === 'admin' }), [user, ready, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ---------------------------------------------------------------- TOASTS --- */
type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
  detail?: string;
}

interface ToastCtx {
  push: (message: string, kind?: ToastKind, detail?: string) => void;
  success: (message: string, detail?: string) => void;
  error: (message: string, detail?: string) => void;
  info: (message: string, detail?: string) => void;
}

const ToastContext = createContext<ToastCtx>(null as any);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const remove = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (message: string, kind: ToastKind = 'info', detail?: string) => {
      const id = ++counter.current;
      setToasts((list) => [...list.slice(-3), { id, message, kind, detail }]);
      setTimeout(() => remove(id), kind === 'error' ? 7000 : 3600);
    },
    [remove],
  );

  const value = useMemo<ToastCtx>(
    () => ({
      push,
      success: (m, d) => push(m, 'success', d),
      error: (m, d) => push(m, 'error', d),
      info: (m, d) => push(m, 'info', d),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => remove(t.id)}
            className={`animate-in pointer-events-auto w-full max-w-sm cursor-pointer rounded-2xl border px-4 py-3 shadow-xl backdrop-blur ${
              t.kind === 'success'
                ? 'border-emerald-500/30 bg-emerald-950/90 text-emerald-100'
                : t.kind === 'error'
                  ? 'border-red-500/30 bg-red-950/90 text-red-100'
                  : 'border-white/10 bg-carvao-800/95 text-slate-100'
            }`}
          >
            <p className="text-sm font-semibold">{t.message}</p>
            {t.detail && <p className="mt-0.5 text-xs opacity-80">{t.detail}</p>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------------- RELÓGIO ---- */
export function useClock(intervalMs = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
