import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, PencilLine, Plus, Search, Star, Trash2, X } from 'lucide-react';
import Modal from '../components/Modal';
import { api, type Product } from '../lib/api';
import { brl, parseNumberInput } from '../lib/format';
import { useToast } from '../lib/store';

const emptyForm = { name: '', price: '', category: '', description: '', keywords: '', favorite: false };

export default function Menu() {
  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState('Todas');
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [priceDraft, setPriceDraft] = useState<{ id: number; value: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ products }, { categories }] = await Promise.all([api.products({ all: true }), api.categories()]);
      setProducts(products);
      setCategories(categories.map((c) => c.category));
    } catch (err: any) {
      toast.error('Não foi possível carregar o cardápio', err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    return products.filter((p) => {
      if (!showInactive && !p.active) return false;
      if (category !== 'Todas' && p.category !== category) return false;
      if (t && !`${p.name} ${p.keywords ?? ''} ${p.category ?? ''}`.toLowerCase().includes(t)) return false;
      return true;
    });
  }, [products, term, category, showInactive]);

  const groupedByCategory = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of filtered) {
      const key = p.category ?? 'Sem categoria';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const openNew = () => {
    setForm(emptyForm);
    setEditing('new');
  };

  const openEdit = (product: Product) => {
    setForm({
      name: product.name,
      price: String(product.price_number ?? product.price),
      category: product.category ?? '',
      description: product.description ?? '',
      keywords: product.keywords ?? '',
      favorite: product.favorite,
    });
    setEditing(product);
  };

  const save = async () => {
    if (!form.name.trim() || !form.price) {
      toast.error('Informe nome e preço');
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(),
        price: parseNumberInput(form.price),
        category: form.category.trim() || 'Outros',
        description: form.description.trim(),
        keywords: form.keywords.trim(),
        favorite: form.favorite,
      };
      if (editing === 'new') {
        await api.createProduct(body);
        toast.success('Produto criado', body.name);
      } else if (editing) {
        await api.updateProduct(editing.id, body);
        toast.success('Produto atualizado', body.name);
      }
      setEditing(null);
      load();
    } catch (err: any) {
      toast.error('Não foi possível salvar', err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleField = async (product: Product, field: 'active' | 'favorite') => {
    try {
      const updated = await api.updateProduct(product.id, { [field]: !product[field] });
      setProducts((list) => list.map((p) => (p.id === product.id ? { ...p, ...updated.product } : p)));
    } catch (err: any) {
      toast.error('Não foi possível alterar', err.message);
    }
  };

  const savePrice = async (product: Product) => {
    if (!priceDraft) return;
    const value = parseNumberInput(priceDraft.value);
    setPriceDraft(null);
    if (!value || value === Number(product.price)) return;
    try {
      const updated = await api.updateProduct(product.id, { price: value });
      setProducts((list) => list.map((p) => (p.id === product.id ? { ...p, ...updated.product } : p)));
      toast.success('Preço atualizado', `${product.name}: ${brl(value)}`);
    } catch (err: any) {
      toast.error('Não foi possível alterar o preço', err.message);
    }
  };

  const remove = async (product: Product) => {
    try {
      const res = await api.deleteProduct(product.id);
      toast.success(res.deleted ? 'Produto excluído' : 'Produto desativado', res.deleted ? product.name : 'Ele já tem vendas no histórico, então foi desativado.');
      load();
    } catch (err: any) {
      toast.error('Não foi possível excluir', err.message);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-4 sm:px-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-black text-white">Cardápio</h1>
        <span className="text-xs text-slate-400">
          {products.filter((p) => p.active).length} ativos de {products.length}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn-ghost" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? 'Ocultar inativos' : 'Ver inativos'}
          </button>
          <button className="btn-primary" onClick={openNew}>
            <Plus size={16} /> Novo produto
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input pl-10" placeholder="Buscar produto…" value={term} onChange={(e) => setTerm(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['Todas', ...categories].map((c) => (
            <button key={c} className={`chip ${category === c ? 'chip-active' : ''}`} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="card grid place-items-center p-10">
          <Loader2 size={22} className="animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="space-y-3">
          {groupedByCategory.map(([cat, list]) => (
            <div key={cat} className="card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-white/5 bg-white/[0.02] px-4 py-2.5">
                <h2 className="text-sm font-bold text-brasa-300">{cat}</h2>
                <span className="text-xs text-slate-500">{list.length} itens</span>
              </div>
              <div className="divide-y divide-white/5">
                {list.map((product) => (
                  <div key={product.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${product.active ? '' : 'opacity-50'}`}>
                    <button
                      onClick={() => toggleField(product, 'favorite')}
                      className={`shrink-0 rounded-lg p-1.5 transition ${product.favorite ? 'text-amber-300' : 'text-slate-600 hover:text-slate-400'}`}
                      title="Marcar como favorito (aparece na grade rápida da mesa)"
                    >
                      <Star size={16} fill={product.favorite ? 'currentColor' : 'none'} />
                    </button>

                    <div className="min-w-[180px] flex-1">
                      <p className="text-sm font-semibold text-white">{product.name}</p>
                      {product.keywords && <p className="truncate text-[11px] text-slate-500">busca: {product.keywords}</p>}
                    </div>

                    <div className="flex items-center gap-2">
                      {priceDraft?.id === product.id ? (
                        <>
                          <input
                            autoFocus
                            className="input w-24 !py-1.5 text-center"
                            value={priceDraft.value}
                            onChange={(e) => setPriceDraft({ id: product.id, value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') savePrice(product);
                              if (e.key === 'Escape') setPriceDraft(null);
                            }}
                          />
                          <button className="btn-icon !h-8 !w-8" onClick={() => savePrice(product)}>
                            <Check size={14} className="text-emerald-400" />
                          </button>
                          <button className="btn-icon !h-8 !w-8" onClick={() => setPriceDraft(null)}>
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <button
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-bold text-brasa-200 transition hover:bg-white/10"
                          onClick={() => setPriceDraft({ id: product.id, value: String(product.price_number ?? product.price) })}
                          title="Clique para editar o preço"
                        >
                          {brl(product.price_number ?? product.price)}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleField(product, 'active')}
                        className={`chip !px-2.5 ${product.active ? 'chip-active' : ''}`}
                        title={product.active ? 'Desativar (some do PDV)' : 'Reativar'}
                      >
                        {product.active ? 'ativo' : 'inativo'}
                      </button>
                      <button className="btn-icon !h-9 !w-9" onClick={() => openEdit(product)} title="Editar">
                        <PencilLine size={15} />
                      </button>
                      <button
                        className="btn-icon !h-9 !w-9 !border-red-500/30 !bg-red-500/10 !text-red-300"
                        onClick={() => remove(product)}
                        title="Excluir / desativar"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {groupedByCategory.length === 0 && (
            <div className="card grid place-items-center gap-2 p-10 text-center">
              <p className="text-sm text-slate-400">Nenhum produto encontrado.</p>
              <button className="btn-primary" onClick={openNew}>
                <Plus size={16} /> Cadastrar produto
              </button>
            </div>
          )}
        </div>
      )}

      {editing && (
        <Modal
          title={editing === 'new' ? 'Novo produto' : 'Editar produto'}
          subtitle="As palavras-chave ajudam a IA e a busca do PDV a achar o item mesmo com erro de digitação."
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn-ghost" onClick={() => setEditing(null)} disabled={busy}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={save} disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Salvar
              </button>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Nome</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Espeto de Picanha" />
            </div>
            <div>
              <label className="label">Preço (R$)</label>
              <input className="input" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="18,00" />
            </div>
            <div>
              <label className="label">Categoria</label>
              <input className="input" list="categorias" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Espetos de Carne" />
              <datalist id="categorias">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Palavras-chave para a busca</label>
              <input className="input" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="carne, boi, picanha, churrasco" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Descrição (opcional)</label>
              <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Corte nobre, ponto a gosto" />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300 sm:col-span-2">
              <input type="checkbox" checked={form.favorite} onChange={(e) => setForm({ ...form, favorite: e.target.checked })} className="h-4 w-4" />
              Mostrar entre os favoritos (grade rápida da mesa)
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
