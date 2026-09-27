import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bot,
  Check,
  Clock,
  Loader2,
  Minus,
  NotebookPen,
  Plus,
  PlusCircle,
  Receipt,
  RefreshCw,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
  Undo2,
  Utensils,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import Modal from '../components/Modal';
import BillModal from '../components/BillModal';
import CloseAccountModal, { type Receipt as ReceiptType } from '../components/CloseAccountModal';
import { api, type Order, type OrderItem, type Product, type Suggestion, type TableDetail as TableDetailType } from '../lib/api';
import { brl, minutesLabel, parseQuickAdd } from '../lib/format';
import { useToast } from '../lib/store';

export default function TableDetail() {
  const { id } = useParams();
  const tableId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();

  const [detail, setDetail] = useState<TableDetailType | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [modal, setModal] = useState<null | 'bill' | 'close' | 'transfer' | 'cancel'>(null);

  // busca / lançamento
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  // comanda selecionada (destino dos lançamentos)
  const [command, setCommand] = useState('Geral');
  const [newCommandOpen, setNewCommandOpen] = useState(false);
  const [newCommandName, setNewCommandName] = useState('');

  // grade rápida
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('Favoritos');
  const [categoryProducts, setCategoryProducts] = useState<Product[]>([]);

  const [feePercent, setFeePercent] = useState(10);
  const [busyItem, setBusyItem] = useState<number | null>(null);

  const order: Order | null = detail?.order ?? null;

  /* ------------------------------------------------------------ CARGA ---- */
  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await api.table(tableId);
        setDetail(data);
        setSuggestions(data.suggestions ?? []);
        if (data.order) {
          const names = data.order.commands.map((c) => c.name);
          setCommand((current) => (names.includes(current) ? current : (names[names.length - 1] ?? 'Geral')));
        }
      } catch (err: any) {
        toast.error('Mesa não encontrada', err.message);
        navigate('/');
      } finally {
        setLoading(false);
      }
    },
    [tableId, toast, navigate],
  );

  useEffect(() => {
    load();
    api.insights().then((o) => setFeePercent(o.service_fee_percent || 10)).catch(() => {});
    api.categories().then((r) => setCategories(r.categories.map((c) => c.category))).catch(() => {});
  }, [load]);

  useEffect(() => {
    if (!loading) searchRef.current?.focus();
  }, [loading]);

  const loadCategory = useCallback(async (category: string) => {
    try {
      if (category === 'Favoritos') {
        const { products } = await api.products();
        setCategoryProducts(products.filter((p) => p.favorite).slice(0, 18));
      } else {
        const { products } = await api.products({ category });
        setCategoryProducts(products.slice(0, 24));
      }
    } catch {
      setCategoryProducts([]);
    }
  }, []);

  useEffect(() => {
    loadCategory(activeCategory);
  }, [activeCategory, loadCategory]);

  /* ------------------------------------------------------------ BUSCA ---- */
  const { quantity: quickQty, term: quickTerm } = parseQuickAdd(search);

  useEffect(() => {
    if (!quickTerm.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const { results } = await api.aiSearch(quickTerm, 8);
        setResults(results);
        setHighlight(0);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 140);
    return () => clearTimeout(timer);
  }, [quickTerm]);

  /* --------------------------------------------------------- LANÇAMENTOS -- */
  const addProduct = async (product: Product, quantity = 1) => {
    if (!order && !detail) return;
    try {
      const res = await api.addItem({
        order_id: order?.id,
        table_id: order ? undefined : tableId,
        product_id: product.id,
        quantity: quantity || 1,
        command_name: command,
      });
      setDetail((prev) => (prev ? { ...prev, order: res.order, table: { ...prev.table, status: 'occupied' } } : prev));
      setSuggestions(res.suggestions ?? []);
      toast.success(`${quantity || 1}x ${product.name}`, `${command} • ${brl(Number(product.price) * (quantity || 1))}`);
      setSearch('');
      setResults([]);
      searchRef.current?.focus();
    } catch (err: any) {
      toast.error('Não foi possível lançar o item', err.message);
    }
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(results.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const product = results[highlight] ?? results[0];
      if (product) addProduct(product, quickQty);
      else if (quickTerm.trim()) toast.info('Nada encontrado', `Tente outro nome para "${quickTerm}".`);
    } else if (e.key === 'Escape') {
      setSearch('');
      setResults([]);
    }
  };

  const changeQty = async (item: OrderItem, delta: number) => {
    const quantity = Math.max(1, item.quantity + delta);
    if (quantity === item.quantity) return;
    // atualização otimista
    setDetail((prev) =>
      prev?.order
        ? {
            ...prev,
            order: {
              ...prev.order,
              items: prev.order.items.map((i) => (i.id === item.id ? { ...i, quantity, total: quantity * i.unit_price } : i)),
            },
          }
        : prev,
    );
    try {
      const res = await api.updateItem(item.id, { quantity });
      setDetail((prev) => (prev ? { ...prev, order: res.order } : prev));
    } catch (err: any) {
      toast.error('Não foi possível alterar a quantidade', err.message);
      load(true);
    }
  };

  /** O "X": cancela o item na hora, sem apagar o histórico (dá para restaurar). */
  const cancelItem = async (item: OrderItem) => {
    setBusyItem(item.id);
    try {
      const res = await api.cancelItem(item.id, 'cancelado no PDV');
      setDetail((prev) => (prev ? { ...prev, order: res.order } : prev));
      toast.success(`Item cancelado: ${item.quantity}x ${item.name}`, 'Toque em “Restaurar” se foi engano.');
    } catch (err: any) {
      toast.error('Não foi possível cancelar o item', err.message);
    } finally {
      setBusyItem(null);
    }
  };

  const restoreItem = async (item: OrderItem) => {
    setBusyItem(item.id);
    try {
      const res = await api.restoreItem(item.id);
      setDetail((prev) => (prev ? { ...prev, order: res.order } : prev));
      toast.success('Item restaurado', item.name);
    } catch (err: any) {
      toast.error('Não foi possível restaurar', err.message);
    } finally {
      setBusyItem(null);
    }
  };

  const saveNote = async (item: OrderItem, notes: string) => {
    try {
      const res = await api.updateItem(item.id, { notes: notes || null });
      setDetail((prev) => (prev ? { ...prev, order: res.order } : prev));
      toast.info('Observação salva', `${item.name}: ${notes || 'removida'}`);
    } catch (err: any) {
      toast.error('Não foi possível salvar a observação', err.message);
    }
  };

  const openTableNow = async () => {
    setOpening(true);
    try {
      const data = await api.openTable(tableId, 1);
      setDetail(data);
      setSuggestions(data.suggestions ?? []);
      toast.success(`Mesa ${data.table.number} aberta!`, 'Pesquise o item e toque em Enter.');
    } catch (err: any) {
      toast.error('Não foi possível abrir a mesa', err.message);
    } finally {
      setOpening(false);
    }
  };

  const createCommand = () => {
    const name = newCommandName.trim();
    if (!name) return;
    setCommand(name);
    setNewCommandOpen(false);
    setNewCommandName('');
    searchRef.current?.focus();
    toast.info(`Comanda "${name}" selecionada`, 'Os próximos itens vão para ela.');
  };

  /* -------------------------------------------------------- AGRUPAMENTO --- */
  const grouped = useMemo(() => {
    if (!order) return [];
    const map = new Map<string, OrderItem[]>();
    for (const item of order.items) {
      const key = item.command_name || 'Geral';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()];
  }, [order]);

  const commandNames = useMemo(() => {
    const names = new Set<string>(['Geral', ...(order?.commands.map((c) => c.name) ?? []), command]);
    return [...names];
  }, [order, command]);

  if (loading || !detail) {
    return (
      <div className="grid flex-1 place-items-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-brasa-500" />
          <p className="text-sm">Carregando mesa…</p>
        </div>
      </div>
    );
  }

  const totalLive = order ? Math.round((order.subtotal + order.service_fee - order.discount) * 100) / 100 : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Cabeçalho da mesa */}
      <div className="border-b border-white/5 bg-carvao-950/60 px-3 py-3 sm:px-5">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3">
          <button className="btn-ghost !px-3" onClick={() => navigate('/')}>
            <ArrowLeft size={16} /> <span className="hidden sm:inline">Mesas</span>
          </button>

          <div className="flex items-center gap-3">
            <span
              className={`grid h-12 w-12 place-items-center rounded-2xl text-xl font-black ${
                order ? 'bg-gradient-to-br from-brasa-400 to-brasa-700 text-white' : 'bg-emerald-500/20 text-emerald-200'
              }`}
            >
              {detail.table.number}
            </span>
            <div className="leading-tight">
              <h1 className="text-lg font-bold text-white">
                Mesa {detail.table.number} <span className="text-sm font-medium text-slate-400">• {detail.table.zone}</span>
              </h1>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Users size={12} /> {order?.people_count ?? 1} pessoa(s)
                </span>
                {order && (
                  <>
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> aberta há {minutesLabel((Date.now() - new Date(order.created_at).getTime()) / 60000)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Utensils size={12} /> {order.active_count} itens
                    </span>
                    <span className="hidden sm:inline">por {order.opened_by_name ?? '-'}</span>
                  </>
                )}
                {!order && <span className="font-semibold text-emerald-300">livre</span>}
              </p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button className="btn-ghost !px-3" onClick={() => load(true)} title="Atualizar">
              <RefreshCw size={15} />
            </button>
            {order ? (
              <>
                <button className="btn-ghost" onClick={() => setModal('bill')}>
                  <Receipt size={15} /> <span className="hidden sm:inline">Conferir conta</span>
                </button>
                <button className="btn-ghost" onClick={() => setModal('transfer')}>
                  <ArrowLeft size={15} className="rotate-180" /> <span className="hidden sm:inline">Transferir</span>
                </button>
                <button className="btn-danger" onClick={() => setModal('cancel')}>
                  <XCircle size={15} /> <span className="hidden sm:inline">Cancelar mesa</span>
                </button>
                <button className="btn-success" onClick={() => setModal('close')}>
                  <Receipt size={16} /> Fechar conta
                </button>
              </>
            ) : (
              <button className="btn-primary" onClick={openTableNow} disabled={opening}>
                {opening ? <Loader2 size={16} className="animate-spin" /> : <PlusCircle size={16} />} Abrir mesa
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Corpo */}
      <div className="mx-auto grid w-full max-w-[1600px] flex-1 gap-4 px-3 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Coluna principal */}
        <div className="min-w-0 space-y-3">
          {/* Busca/ lançamento */}
          <div className="card p-3 sm:p-4">
            <div className="relative">
              <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-brasa-400" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder='Pesquise o item: "picanha", "2 cerveja", "farofa"...'
                className="w-full rounded-2xl border border-white/10 bg-carvao-950/80 py-4 pl-12 pr-28 text-base font-medium text-white outline-none transition placeholder:text-slate-500 focus:border-brasa-500/70 focus:ring-2 focus:ring-brasa-500/20"
                autoComplete="off"
              />
              <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
                {searching && <Loader2 size={16} className="animate-spin text-slate-400" />}
                {quickQty > 1 && (
                  <span className="rounded-lg bg-brasa-500/20 px-2 py-1 text-xs font-bold text-brasa-200">{quickQty}x</span>
                )}
                <span className="hidden rounded-lg border border-white/10 px-2 py-1 text-[10px] text-slate-400 sm:block">
                  Enter ↵ lança
                </span>
              </div>
            </div>

            {/* Resultados */}
            {results.length > 0 && (
              <div className="animate-in mt-2 divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-carvao-950/90">
                {results.map((product, index) => (
                  <button
                    key={product.id}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => addProduct(product, quickQty)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                      highlight === index ? 'bg-brasa-500/15' : 'hover:bg-white/5'
                    }`}
                  >
                    <Plus size={16} className="shrink-0 text-brasa-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">{product.name}</span>
                      <span className="block text-[11px] text-slate-400">
                        {product.category}
                        {product.score !== undefined && product.score < 0.99 && <span className="ml-2 text-brasa-300">busca inteligente</span>}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-brasa-200">{brl(product.price_number)}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Grade rápida (sem digitar) */}
            <div className="mt-3">
              <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {['Favoritos', ...categories].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`chip whitespace-nowrap ${activeCategory === cat ? 'chip-active' : ''}`}
                  >
                    {cat === 'Favoritos' ? '⭐ Favoritos' : cat}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {categoryProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addProduct(product, 1)}
                    className="group flex flex-col items-start gap-1 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5 text-left transition hover:border-brasa-500/40 hover:bg-brasa-500/10 active:scale-[0.97]"
                  >
                    <span className="line-clamp-2 text-xs font-semibold text-slate-100">{product.name}</span>
                    <span className="text-xs font-bold text-brasa-300">{brl(product.price_number)}</span>
                  </button>
                ))}
                {categoryProducts.length === 0 && (
                  <p className="col-span-full py-3 text-center text-xs text-slate-500">Nenhum produto nesta categoria.</p>
                )}
              </div>
            </div>
          </div>

          {/* Itens lançados */}
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                <Utensils size={15} className="text-brasa-400" /> Itens da mesa
                {order && <span className="text-xs font-medium text-slate-400">({order.active_count} ativos)</span>}
              </h2>
              <div className="ml-auto flex items-center gap-2">
                <select
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  className="rounded-xl border border-white/10 bg-carvao-950 px-3 py-2 text-xs font-semibold text-white"
                  title="Comanda de destino dos novos itens"
                >
                  {commandNames.map((name) => (
                    <option key={name} value={name}>
                      Comanda: {name}
                    </option>
                  ))}
                </select>
                <button className="chip" onClick={() => setNewCommandOpen(true)}>
                  <Plus size={12} /> Nova comanda
                </button>
                <button
                  className="btn-primary !px-3 !py-2"
                  onClick={() => {
                    searchRef.current?.focus();
                    searchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                >
                  <PlusCircle size={15} /> Adicionar
                </button>
              </div>
            </div>

            {order && order.items.length > 0 ? (
              <div className="divide-y divide-white/5">
                {grouped.map(([commandName, items]) => {
                  const active = items.filter((i) => i.status === 'active');
                  const subtotal = active.reduce((sum, i) => sum + i.total, 0);
                  return (
                    <div key={commandName}>
                      {(grouped.length > 1 || commandName !== 'Geral') && (
                        <div className="flex items-center gap-2 bg-white/[0.02] px-4 py-2">
                          <span className="text-xs font-bold uppercase tracking-wide text-brasa-300">{commandName}</span>
                          <span className="text-xs text-slate-400">{active.length} itens</span>
                          <span className="ml-auto text-xs font-bold text-slate-200">{brl(subtotal)}</span>
                        </div>
                      )}
                      <div className="divide-y divide-white/5">
                        {items.map((item) => (
                          <ItemRow
                            key={item.id}
                            item={item}
                            busy={busyItem === item.id}
                            onQty={(delta) => changeQty(item, delta)}
                            onCancel={() => cancelItem(item)}
                            onRestore={() => restoreItem(item)}
                            onNote={(notes) => saveNote(item, notes)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid place-items-center gap-2 px-4 py-12 text-center">
                <Utensils size={22} className="text-slate-500" />
                <p className="text-sm font-semibold text-slate-300">Nenhum item lançado ainda</p>
                <p className="max-w-sm text-xs text-slate-500">
                  Use o campo de busca acima (digite e aperte Enter) ou toque em um produto da grade para lançar. Toque em{' '}
                  <span className="font-semibold text-brasa-300">Adicionar</span> a qualquer momento.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Coluna lateral: sugestões + totais */}
        <div className="space-y-3">
          {suggestions.length > 0 && (
            <div className="card p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                <Bot size={15} className="text-brasa-400" /> Sugestões da IA
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-400">Baseado no que já está na mesa e no histórico real de vendas.</p>
              <div className="mt-3 space-y-2">
                {suggestions.map((s) => (
                  <button
                    key={s.product.id}
                    onClick={() => addProduct({ ...s.product, price_number: Number(s.product.price) }, 1)}
                    className="flex w-full items-start gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-left transition hover:border-brasa-500/40 hover:bg-brasa-500/10"
                  >
                    <Plus size={14} className="mt-0.5 shrink-0 text-brasa-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-white">{s.product.name}</span>
                      <span className="block text-[10px] leading-snug text-slate-400">{s.reason}</span>
                    </span>
                    <span className="shrink-0 text-xs font-bold text-brasa-200">{brl(s.product.price)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="card sticky top-20 p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-white">
              <Sparkles size={15} className="text-brasa-400" /> Conta da mesa
            </h3>
            <div className="mt-3 space-y-2 text-sm">
              <Row label={`Subtotal (${order?.active_count ?? 0} itens)`} value={brl(order?.subtotal ?? 0)} />
              {!!order?.service_fee && <Row label="Taxa de serviço" value={`+ ${brl(order.service_fee)}`} />}
              {!!order?.discount && <Row label="Desconto" value={`- ${brl(order.discount)}`} tone="emerald" />}
              {!!order?.canceled_total && (
                <Row label="Itens cancelados (fora do total)" value={`- ${brl(order.canceled_total)}`} tone="muted" />
              )}
              <div className="flex items-center justify-between border-t border-white/10 pt-2">
                <span className="text-sm font-bold text-white">TOTAL</span>
                <span className="text-2xl font-black text-brasa-300">{brl(totalLive)}</span>
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              <button className="btn-primary" disabled={!order} onClick={() => setModal('close')}>
                <Receipt size={16} /> Fechar conta e receber
              </button>
              <button className="btn-ghost" disabled={!order} onClick={() => setModal('bill')}>
                <NotebookPen size={15} /> Conferir / imprimir
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              Dica: clique no botão <span className="font-semibold text-red-300">X</span> ao lado de um item para cancelá-lo. O item fica
              marcado como cancelado e pode ser restaurado — nada é apagado do histórico.
            </p>
          </div>
        </div>
      </div>

      {/* Modais */}
      {modal === 'bill' && <BillModal tableId={tableId} onClose={() => setModal(null)} onCloseAccount={() => setModal('close')} />}
      {modal === 'close' && order && (
        <CloseAccountModal
          order={order}
          defaultFeePercent={feePercent}
          onClose={() => {
            setModal(null);
            load(true);
          }}
          onClosed={() => load(true)}
        />
      )}
      {modal === 'transfer' && (
        <TransferModal
          tableId={tableId}
          current={detail.table.number}
          onClose={() => setModal(null)}
          onDone={(number) => {
            setModal(null);
            toast.success(`Conta transferida para a mesa ${number}`);
            navigate(`/`);
          }}
        />
      )}
      {modal === 'cancel' && (
        <CancelModal
          tableId={tableId}
          number={detail.table.number}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            toast.info(`Mesa ${detail.table.number} liberada`);
            navigate('/');
          }}
        />
      )}
      {newCommandOpen && (
        <Modal
          title="Nova comanda"
          subtitle="Use para separar o consumo por cliente (ex.: Cliente 4, Ana, Casal 2)."
          onClose={() => setNewCommandOpen(false)}
          size="sm"
          footer={
            <>
              <button className="btn-ghost" onClick={() => setNewCommandOpen(false)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={createCommand} disabled={!newCommandName.trim()}>
                <Check size={16} /> Criar comanda
              </button>
            </>
          }
        >
          <div className="flex flex-wrap gap-1.5 pb-3">
            {['Cliente 1', 'Cliente 2', 'Cliente 3', 'Cliente 4', 'Casal', 'Mesa 2'].map((s) => (
              <button key={s} className="chip" onClick={() => setNewCommandName(s)}>
                {s}
              </button>
            ))}
          </div>
          <label className="label">Nome da comanda</label>
          <input
            autoFocus
            className="input"
            value={newCommandName}
            onChange={(e) => setNewCommandName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createCommand()}
            placeholder="Ex.: Cliente 3"
          />
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- LINHA --- */
function ItemRow({
  item,
  busy,
  onQty,
  onCancel,
  onRestore,
  onNote,
}: {
  item: OrderItem;
  busy: boolean;
  onQty: (delta: number) => void;
  onCancel: () => void;
  onRestore: () => void;
  onNote: (notes: string) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(item.notes ?? '');
  const canceled = item.status === 'canceled';

  return (
    <div className={`flex items-center gap-3 px-3 py-3 sm:px-4 ${canceled ? 'bg-red-950/20' : ''}`}>
      <div className="flex shrink-0 items-center gap-1">
        <button
          className="btn-icon !h-9 !w-9 disabled:opacity-30"
          onClick={() => onQty(-1)}
          disabled={canceled || item.quantity <= 1}
          aria-label="Diminuir quantidade"
        >
          <Minus size={15} />
        </button>
        <span className={`w-7 text-center text-base font-black ${canceled ? 'text-slate-500 line-through' : 'text-white'}`}>
          {item.quantity}
        </span>
        <button className="btn-icon !h-9 !w-9 disabled:opacity-30" onClick={() => onQty(1)} disabled={canceled} aria-label="Aumentar quantidade">
          <Plus size={15} />
        </button>
      </div>

      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-semibold ${canceled ? 'text-slate-500 line-through' : 'text-white'}`}>{item.name}</p>
        <p className="truncate text-[11px] text-slate-400">
          {brl(item.unit_price)} un • {item.command_name}
          {item.added_by_name && ` • ${item.added_by_name.split(' ')[0]}`}
          {canceled && item.cancel_reason && ` • cancelado: ${item.cancel_reason}`}
        </p>
        {item.notes && !noteOpen && (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-amber-300">
            <StickyNote size={10} /> {item.notes}
          </p>
        )}
        {noteOpen && (
          <input
            autoFocus
            className="input mt-1 !py-1.5 text-xs"
            placeholder="Observação (ex.: sem cebola)"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={() => {
              setNoteOpen(false);
              if ((item.notes ?? '') !== noteDraft) onNote(noteDraft);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setNoteDraft(item.notes ?? '');
                setNoteOpen(false);
              }
            }}
          />
        )}
      </div>

      <div className="shrink-0 text-right">
        <p className={`text-sm font-bold ${canceled ? 'text-slate-500 line-through' : 'text-brasa-200'}`}>{brl(item.total)}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          className="btn-icon !h-9 !w-9"
          title="Adicionar observação"
          onClick={() => setNoteOpen((v) => !v)}
          disabled={canceled}
        >
          <StickyNote size={14} />
        </button>
        {canceled ? (
          <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={onRestore} disabled={busy} title="Restaurar item">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />} Restaurar
          </button>
        ) : (
          <button
            className="grid h-9 w-9 place-items-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 transition hover:bg-red-500/25 active:scale-95 disabled:opacity-40"
            onClick={onCancel}
            disabled={busy}
            title="Cancelar este item"
            aria-label={`Cancelar ${item.name}`}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <X size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}

const Row = ({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'muted' }) => (
  <div className="flex items-center justify-between">
    <span className="text-slate-400">{label}</span>
    <span className={tone === 'emerald' ? 'font-semibold text-emerald-300' : tone === 'muted' ? 'text-slate-500' : 'font-semibold text-white'}>
      {value}
    </span>
  </div>
);

/* ------------------------------------------------------------- TRANSFERIR - */
function TransferModal({
  tableId,
  current,
  onClose,
  onDone,
}: {
  tableId: number;
  current: number;
  onClose: () => void;
  onDone: (number: number) => void;
}) {
  const toast = useToast();
  const [value, setValue] = useState('');
  const [free, setFree] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .tables()
      .then((r) => setFree(r.tables.filter((t) => !t.occupied).map((t) => t.number)))
      .catch(() => {});
  }, []);

  const confirm = async (number: number) => {
    setBusy(true);
    try {
      await api.transferTable(tableId, number);
      onDone(number);
    } catch (err: any) {
      toast.error('Não foi possível transferir', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Transferir mesa"
      subtitle={`Levar a conta da mesa ${current} para outra mesa livre`}
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={!value || busy} onClick={() => confirm(Number(value))}>
            Transferir para {value || '…'}
          </button>
        </>
      }
    >
      <label className="label">Número da mesa de destino</label>
      <input
        autoFocus
        className="input"
        inputMode="numeric"
        value={value}
        placeholder="Ex.: 24"
        onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
      />
      <p className="label mt-4">Mesas livres (toque para escolher)</p>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
        {free.slice(0, 40).map((n) => (
          <button
            key={n}
            onClick={() => setValue(String(n))}
            className={`rounded-xl border px-2 py-2 text-sm font-bold transition ${
              value === String(n) ? 'border-brasa-400 bg-brasa-500/20 text-brasa-100' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------- CANCELAR - */
function CancelModal({
  tableId,
  number,
  onClose,
  onDone,
}: {
  tableId: number;
  number: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await api.cancelTable(tableId, reason || 'mesa cancelada');
      onDone();
    } catch (err: any) {
      toast.error('Não foi possível cancelar', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Cancelar a mesa ${number}?`}
      subtitle="A conta sai do movimento e a mesa fica livre. O histórico é mantido como cancelado (não é apagado)."
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Voltar
          </button>
          <button className="btn-danger" onClick={confirm} disabled={busy}>
            <Trash2 size={15} /> {busy ? 'Cancelando…' : 'Confirmar cancelamento'}
          </button>
        </>
      }
    >
      <label className="label">Motivo (opcional)</label>
      <input
        className="input"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Ex.: cliente desistiu, lançamento errado..."
      />
    </Modal>
  );
}
