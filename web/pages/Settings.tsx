import { useCallback, useEffect, useState } from 'react';
import { Bot, Brush, CheckCircle2, Download, Eye, EyeOff, KeyRound, Loader2, Plug, Save, Store, Trash2, UserPlus, Users, XCircle } from 'lucide-react';
import Modal from '../components/Modal';
import CleanupModal from '../components/CleanupModal';
import { api, type User } from '../lib/api';
import { brl } from '../lib/format';
import { useAuth, useToast } from '../lib/store';

type Tab = 'ia' | 'usuarios' | 'casa' | 'conta';

export default function Settings() {
  const [tab, setTab] = useState<Tab>('ia');

  return (
    <div className="mx-auto w-full max-w-[1200px] flex-1 px-3 py-4 sm:px-5">
      <h1 className="mb-4 text-xl font-black text-white">Configurações</h1>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(
          [
            ['ia', 'Inteligência Artificial', Bot],
            ['usuarios', 'Usuários', Users],
            ['casa', 'Dados e limpeza', Store],
            ['conta', 'Minha conta', KeyRound],
          ] as const
        ).map(([id, label, Icon]) => (
          <button key={id} className={`chip ${tab === id ? 'chip-active' : ''}`} onClick={() => setTab(id)}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {tab === 'ia' && <AiSettings />}
      {tab === 'usuarios' && <UsersSettings />}
      {tab === 'casa' && <HouseSettings />}
      {tab === 'conta' && <AccountSettings />}
    </div>
  );
}

/* ------------------------------------------------------------ IA ---------- */
function AiSettings() {
  const toast = useToast();
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  const load = useCallback(async () => {
    try {
      const { settings } = await api.aiSettings();
      setSettings(settings);
    } catch (err: any) {
      toast.error('Não foi possível carregar as configurações de IA', err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const { settings: updated } = await api.saveAiSettings({
        enabled: settings.enabled,
        provider: settings.provider,
        model: settings.model,
        base_url: settings.base_url,
        persona: settings.persona,
        ...(apiKey ? { api_key: apiKey } : {}),
      });
      setSettings(updated);
      setApiKey('');
      toast.success('Configurações de IA salvas', `${updated.provider} • ${updated.model}`);
    } catch (err: any) {
      toast.error('Não foi possível salvar', err.message);
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testAi({
        provider: settings.provider,
        model: settings.model,
        base_url: settings.base_url,
        ...(apiKey ? { api_key: apiKey } : {}),
      });
      setTestResult(result);
      result.ok ? toast.success('Conexão OK') : toast.error('Falha na conexão', result.message);
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <Loading />;
  if (!settings) return null;

  const needsKey = settings.provider !== 'local';

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="card space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-brasa-400" />
          <h2 className="text-sm font-bold text-white">Provedor de IA</h2>
          <label className="ml-auto flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={settings.enabled}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
            />
            IA ativa
          </label>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {settings.available_providers.map((p: any) => (
            <button
              key={p.id}
              onClick={() => setSettings({ ...settings, provider: p.id, model: '' })}
              className={`rounded-2xl border px-4 py-3 text-left transition ${
                settings.provider === p.id ? 'border-brasa-400 bg-brasa-500/15' : 'border-white/10 bg-white/[0.03] hover:bg-white/5'
              }`}
            >
              <span className="block text-sm font-bold text-white">{p.label}</span>
              <span className="block text-[11px] text-slate-400">{p.needs_key ? 'precisa de chave de API' : 'funciona offline, sem custo'}</span>
            </button>
          ))}
        </div>

        {needsKey && (
          <>
            <div>
              <label className="label">Chave de API {settings.has_key && !apiKey && <span className="text-emerald-400">• salva ({settings.key_preview})</span>}</label>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={settings.has_key ? 'Deixe vazio para manter a chave atual' : 'sk-...'}
                  autoComplete="off"
                />
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400" onClick={() => setShowKey((v) => !v)}>
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Modelo</label>
                <input
                  className="input"
                  value={settings.model}
                  onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                  placeholder={settings.provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o-mini'}
                />
              </div>
              <div>
                <label className="label">URL base (provedores compatíveis)</label>
                <input
                  className="input"
                  value={settings.base_url}
                  onChange={(e) => setSettings({ ...settings, base_url: e.target.value })}
                  placeholder="https://api.groq.com/openai/v1"
                />
              </div>
            </div>
          </>
        )}

        <div>
          <label className="label">Personalidade do assistente</label>
          <textarea
            className="input min-h-[80px] resize-y"
            value={settings.persona}
            onChange={(e) => setSettings({ ...settings, persona: e.target.value })}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar
          </button>
          <button className="btn-ghost" onClick={test} disabled={testing}>
            {testing ? <Loader2 size={16} className="animate-spin" /> : <Plug size={16} />} Testar conexão
          </button>
          {testResult && (
            <span className={`flex items-center gap-1.5 text-xs ${testResult.ok ? 'text-emerald-300' : 'text-red-300'}`}>
              {testResult.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {testResult.message}
            </span>
          )}
        </div>
      </div>

      <div className="card space-y-3 p-5 text-sm">
        <h3 className="font-bold text-white">Como funciona</h3>
        <p className="text-xs leading-relaxed text-slate-400">
          <span className="font-semibold text-slate-200">Motor local (padrão):</span> roda dentro do próprio PDV. Faz busca inteligente
          (entende "franco" como frango), sugere combinações com base no seu histórico real e responde faturamento, mesas, ticket médio e
          mais vendidos. Não precisa de internet nem de chave.
        </p>
        <p className="text-xs leading-relaxed text-slate-400">
          <span className="font-semibold text-slate-200">IA externa:</span> se você colar uma chave da OpenAI, Gemini, Groq ou outro
          provedor compatível, as respostas do chat e o resumo do dia passam a ser gerados por ela — com os dados reais do seu salão no
          contexto. Se a chave falhar ou a internet cair, o PDV volta sozinho para o motor local (o atendimento não para).
        </p>
        <p className="text-xs leading-relaxed text-slate-400">
          Você pode definir a chave também fora do app, pelas variáveis <code className="rounded bg-black/40 px-1">AI_PROVIDER</code> e{' '}
          <code className="rounded bg-black/40 px-1">AI_API_KEY</code> no arquivo <code className="rounded bg-black/40 px-1">.env</code>.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- USUÁRIOS --------- */
function UsersSettings() {
  const toast = useToast();
  const { user: me } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | { mode: 'new' } | { mode: 'edit'; user: any }>(null);
  const [form, setForm] = useState({ name: '', username: '', role: 'waiter', password: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { users } = await api.users();
      setUsers(users);
    } catch (err: any) {
      toast.error('Não foi possível listar usuários', err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setForm({ name: '', username: '', role: 'waiter', password: '' });
    setModal({ mode: 'new' });
  };
  const openEdit = (user: any) => {
    setForm({ name: user.name, username: user.username ?? '', role: user.role, password: '' });
    setModal({ mode: 'edit', user });
  };

  const save = async () => {
    setBusy(true);
    try {
      if (modal?.mode === 'new') {
        await api.createUser({ name: form.name, username: form.username, role: form.role as any, password: form.password });
        toast.success('Usuário criado', form.name);
      } else if (modal?.mode === 'edit') {
        await api.updateUser(modal.user.id, {
          name: form.name,
          username: form.username,
          role: form.role,
          ...(form.password ? { password: form.password } : {}),
        });
        toast.success('Usuário atualizado', form.name);
      }
      setModal(null);
      load();
    } catch (err: any) {
      toast.error('Não foi possível salvar', err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (user: any) => {
    try {
      await api.updateUser(user.id, { active: !user.active });
      load();
    } catch (err: any) {
      toast.error('Não foi possível alterar', err.message);
    }
  };

  const remove = async (user: any) => {
    try {
      const res = await api.deleteUser(user.id);
      toast.success(res.deleted ? 'Usuário excluído' : 'Usuário desativado', user.name);
      load();
    } catch (err: any) {
      toast.error('Não foi possível excluir', err.message);
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-white">Equipe ({users.length})</h2>
        <button className="btn-primary ml-auto" onClick={openNew}>
          <UserPlus size={16} /> Novo usuário
        </button>
      </div>

      <div className="card divide-y divide-white/5">
        {users.map((user) => (
          <div key={user.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${user.active ? '' : 'opacity-50'}`}>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 text-xs font-bold text-white">
              {user.name.split(' ').slice(0, 2).map((n: string) => n[0]).join('')}
            </span>
            <div className="min-w-[150px] flex-1">
              <p className="text-sm font-semibold text-white">
                {user.name} {user.id === me?.id && <span className="text-[10px] font-bold text-brasa-300">(você)</span>}
              </p>
              <p className="text-[11px] text-slate-400">
                @{user.username} • {user.role === 'admin' ? 'Administrador' : 'Atendente'}
                {user.last_login_at && ` • último acesso ${new Date(user.last_login_at).toLocaleString('pt-BR')}`}
              </p>
            </div>
            <div className="text-right text-[11px] text-slate-400">
              <p className="font-semibold text-slate-200">{brl(user.revenue ?? 0)}</p>
              <p>
                {user.orders_opened ?? 0} abertas • {user.orders_closed ?? 0} fechadas
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button className={`chip !px-2.5 ${user.active ? 'chip-active' : ''}`} onClick={() => toggleActive(user)}>
                {user.active ? 'ativo' : 'inativo'}
              </button>
              <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => openEdit(user)}>
                Editar
              </button>
              {user.id !== me?.id && (
                <button className="btn-icon !h-8 !w-8 !border-red-500/30 !bg-red-500/10 !text-red-300" onClick={() => remove(user)} title="Excluir/desativar">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-500">
        Atendentes têm acesso ao salão, à IA e ao lançamento de itens. Painel, cardápio, configurações e o botão de limpeza são exclusivos
        do administrador.
      </p>

      {modal && (
        <Modal
          title={modal.mode === 'new' ? 'Novo usuário' : `Editar ${modal.user.name}`}
          onClose={() => setModal(null)}
          size="sm"
          footer={
            <>
              <button className="btn-ghost" onClick={() => setModal(null)} disabled={busy}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={save} disabled={busy || !form.name || !form.username}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <div>
              <label className="label">Nome</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Maria Silva" />
            </div>
            <div>
              <label className="label">Usuário de acesso</label>
              <input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="maria" autoComplete="off" />
            </div>
            <div>
              <label className="label">Perfil</label>
              <div className="flex gap-2">
                {(
                  [
                    ['waiter', 'Atendente'],
                    ['admin', 'Administrador'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    className={`chip flex-1 justify-center ${form.role === value ? 'chip-active' : ''}`}
                    onClick={() => setForm({ ...form, role: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">{modal.mode === 'new' ? 'Senha' : 'Nova senha (opcional)'}</label>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="mínimo 4 caracteres"
                autoComplete="new-password"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- CASA --------- */
function HouseSettings() {
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    fetch('/api/health').then((r) => r.json()).then(setHealth).catch(() => {});
  }, []);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="card p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white">
          <Brush size={16} className="text-brasa-400" /> Limpeza e organização
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          Sincronize o status das mesas, libere mesas abertas sem consumo, remova itens cancelados, apague contas antigas e zere o
          movimento. O botão também fica sempre disponível no topo da tela de mesas.
        </p>
        <button className="btn-primary mt-3" onClick={() => setCleanupOpen(true)}>
          <Brush size={15} /> Abrir limpeza
        </button>
      </div>

      <div className="card p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white">
          <Download size={16} className="text-emerald-400" /> Backup
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          Exporte um JSON com todos os dados do PDV (sem as senhas). Guarde em segurança: é possível importar em outra instalação.
        </p>
        <a className="btn-ghost mt-3" href={api.backupUrl()} target="_blank" rel="noreferrer">
          <Download size={15} /> Baixar backup
        </a>
      </div>

      <div className="card p-5 lg:col-span-2">
        <h2 className="text-sm font-bold text-white">Informações técnicas</h2>
        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-slate-500">Banco de dados</dt>
            <dd className="font-semibold text-slate-200">{health?.database ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Aplicação</dt>
            <dd className="font-semibold text-slate-200">Espetaria PDV 1.0</dd>
          </div>
          <div>
            <dt className="text-slate-500">Servidor</dt>
            <dd className="font-semibold text-slate-200">{health?.time ? new Date(health.time).toLocaleString('pt-BR') : '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Postgres externo</dt>
            <dd className="font-semibold text-slate-200">basta definir DATABASE_URL no .env</dd>
          </div>
        </dl>
      </div>

      {cleanupOpen && <CleanupModal onClose={() => setCleanupOpen(false)} onDone={() => setCleanupOpen(false)} />}
    </div>
  );
}

/* ---------------------------------------------------------- CONTA --------- */
function AccountSettings() {
  const toast = useToast();
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (next.length < 4) return toast.error('A nova senha precisa de ao menos 4 caracteres.');
    if (next !== confirm) return toast.error('As senhas não conferem.');
    setBusy(true);
    try {
      await api.changePassword(current, next);
      toast.success('Senha alterada com sucesso');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err: any) {
      toast.error('Não foi possível alterar a senha', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card max-w-lg space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-white">
        <KeyRound size={16} className="text-brasa-400" /> Trocar minha senha
      </h2>
      <p className="text-xs text-slate-400">
        Você está logado como <span className="font-semibold text-slate-200">{user?.name}</span> (@{user?.username}).
      </p>
      <div>
        <label className="label">Senha atual</label>
        <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </div>
      <div>
        <label className="label">Nova senha</label>
        <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      </div>
      <div>
        <label className="label">Confirmar nova senha</label>
        <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      </div>
      <button className="btn-primary" onClick={submit} disabled={busy || !current || !next}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar nova senha
      </button>
    </div>
  );
}

const Loading = () => (
  <div className="card grid place-items-center p-10">
    <Loader2 size={22} className="animate-spin text-slate-400" />
  </div>
);
