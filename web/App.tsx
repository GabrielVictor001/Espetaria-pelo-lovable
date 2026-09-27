import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/store';
import TopBar from './components/TopBar';
import Login from './pages/Login';
import Tables from './pages/Tables';
import TableDetail from './pages/TableDetail';
import AiAssistant from './pages/AiAssistant';
import Dashboard from './pages/Dashboard';
import Menu from './pages/Menu';
import Settings from './pages/Settings';

function Protected({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, ready, isAdmin } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="grid h-full place-items-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-brasa-500" />
          <p className="text-sm">Carregando PDV…</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/*"
        element={
          <Protected>
            <div className="flex h-full min-h-screen flex-col bg-carvao-900">
              <TopBar />
              <main className="flex min-h-0 flex-1 flex-col">
                <Routes>
                  <Route path="/" element={<Tables />} />
                  <Route path="/mesa/:id" element={<TableDetail />} />
                  <Route path="/ia" element={<AiAssistant />} />
                  <Route
                    path="/painel"
                    element={
                      <Protected adminOnly>
                        <Dashboard />
                      </Protected>
                    }
                  />
                  <Route
                    path="/cardapio"
                    element={
                      <Protected adminOnly>
                        <Menu />
                      </Protected>
                    }
                  />
                  <Route
                    path="/config"
                    element={
                      <Protected adminOnly>
                        <Settings />
                      </Protected>
                    }
                  />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </div>
          </Protected>
        }
      />
    </Routes>
  );
}
