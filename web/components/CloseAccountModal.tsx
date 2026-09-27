import { useMemo, useState } from 'react';
import { Banknote, CreditCard, Printer, QrCode, Receipt, Smartphone, Sparkles } from 'lucide-react';
import Modal from './Modal';
import { api, type Order } from '../lib/api';
import { brl, paymentLabel, parseNumberInput } from '../lib/format';
import { useToast } from '../lib/store';

const METHODS = [
  { id: 'cash', label: 'Dinheiro', icon: Banknote },
  { id: 'pix', label: 'Pix', icon: QrCode },
  { id: 'debit', label: 'Débito', icon: CreditCard },
  { id: 'credit', label: 'Crédito', icon: Smartphone },
] as const;

export interface Receipt {
  table_number: number;
  subtotal: number;
  service_fee: number;
  discount: number;
  total: number;
  method: string;
}

export default function CloseAccountModal({
  order,
  defaultFeePercent,
  onClose,
  onClosed,
}: {
  order: Order;
  defaultFeePercent: number;
  onClose: () => void;
  onClosed: (receipt: Receipt) => void;
}) {
  const toast = useToast();
  const [method, setMethod] = useState<string>('cash');
  const [applyFee, setApplyFee] = useState(defaultFeePercent > 0);
  const [feePercent, setFeePercent] = useState(defaultFeePercent || 10);
  const [discountMode, setDiscountMode] = useState<'value' | 'percent'>('value');
  const [discountInput, setDiscountInput] = useState('');
  const [people, setPeople] = useState(order.people_count);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const subtotal = order.subtotal;
  const discount = useMemo(() => {
    const value = parseNumberInput(discountInput);
    const computed = discountMode === 'percent' ? (subtotal * value) / 100 : value;
    return Math.min(Math.max(0, Math.round(computed * 100) / 100), subtotal);
  }, [discountInput, discountMode, subtotal]);
  const serviceFee = applyFee ? Math.round(subtotal * (feePercent / 100) * 100) / 100 : 0;
  const total = Math.max(0, Math.round((subtotal + serviceFee - discount) * 100) / 100);

  const confirm = async () => {
    setBusy(true);
    try {
      const res = await api.closeTable(order.table_id, {
        method,
        service_fee_percent: applyFee ? feePercent : 0,
        discount,
        people_count: people,
      });
      setReceipt(res.receipt);
      toast.success(`Mesa ${res.receipt.table_number} fechada!`, `${paymentLabel[method]} • ${brl(res.receipt.total)}`);
      onClosed(res.receipt);
    } catch (err: any) {
      toast.error('Não foi possível fechar a conta', err.message);
    } finally {
      setBusy(false);
    }
  };

  if (receipt) {
    return (
      <Modal title="Conta fechada 🎉" subtitle={`Mesa ${receipt.table_number} • ${paymentLabel[receipt.method]}`} onClose={onClose} size="sm"
        footer={
          <>
            <button className="btn-ghost" onClick={() => window.print()}>
              <Printer size={16} /> Imprimir
            </button>
            <button className="btn-primary" onClick={onClose}>
              Voltar para as mesas
            </button>
          </>
        }
      >
        <div className="print-area rounded-2xl bg-carvao-950 p-5 font-mono text-sm text-slate-200">
          <p className="mb-3 text-center text-base font-bold">*** CONTA ***</p>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{brl(receipt.subtotal)}</span>
            </div>
            {receipt.service_fee > 0 && (
              <div className="flex justify-between text-slate-400">
                <span>Taxa de serviço</span>
                <span>+ {brl(receipt.service_fee)}</span>
              </div>
            )}
            {receipt.discount > 0 && (
              <div className="flex justify-between text-emerald-300">
                <span>Desconto</span>
                <span>- {brl(receipt.discount)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-dashed border-white/20 pt-2 text-lg font-black text-white">
              <span>TOTAL</span>
              <span>{brl(receipt.total)}</span>
            </div>
            <p className="pt-2 text-center text-xs text-slate-400">Pago em {paymentLabel[receipt.method]}</p>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-slate-400">A mesa já está livre para o próximo cliente.</p>
      </Modal>
    );
  }

  return (
    <Modal
      title="Fechar conta"
      subtitle={`Mesa ${order.table_number} • ${order.active_count} itens • ${order.commands.length} comanda(s)`}
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="btn-success !px-6 !py-3 text-base" onClick={confirm} disabled={busy}>
            <Receipt size={18} /> {busy ? 'Fechando…' : `Confirmar ${brl(total)}`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="label">Forma de pagamento</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {METHODS.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-3 text-xs font-bold transition ${
                    method === m.id
                      ? 'border-brasa-400 bg-brasa-500/20 text-brasa-100'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <Icon size={20} />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Taxa de serviço</span>
              <button
                onClick={() => setApplyFee((v) => !v)}
                className={`h-6 w-11 rounded-full transition ${applyFee ? 'bg-emerald-500' : 'bg-white/15'}`}
                aria-label="Ligar/desligar taxa de serviço"
              >
                <span className={`block h-5 w-5 rounded-full bg-white transition ${applyFee ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {applyFee && (
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={feePercent}
                  onChange={(e) => setFeePercent(Number(e.target.value))}
                  className="w-16 rounded-lg border border-white/10 bg-carvao-950 px-2 py-1 text-center text-sm text-white"
                />
                % = {brl(serviceFee)}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Desconto</span>
              <div className="flex gap-1">
                {(['value', 'percent'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setDiscountMode(mode)}
                    className={`chip !px-2 !py-0.5 ${discountMode === mode ? 'chip-active' : ''}`}
                  >
                    {mode === 'value' ? 'R$' : '%'}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                className="input !py-1.5"
                placeholder={discountMode === 'value' ? '0,00' : '10'}
                inputMode="decimal"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
              />
              <span className="w-24 shrink-0 text-right text-sm font-semibold text-emerald-300">- {brl(discount)}</span>
            </div>
            <div className="mt-1 flex gap-1">
              {[5, 10, 15].map((p) => (
                <button
                  key={p}
                  className="chip !px-2 !py-0.5"
                  onClick={() => {
                    setDiscountMode('percent');
                    setDiscountInput(String(p));
                  }}
                >
                  {p}%
                </button>
              ))}
              <button
                className="chip !px-2 !py-0.5"
                onClick={() => {
                  setDiscountMode('value');
                  setDiscountInput('');
                }}
              >
                limpar
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.02] p-3">
          <span className="text-sm font-semibold text-white">Clientes na mesa</span>
          <div className="flex items-center gap-2">
            <button className="btn-icon !h-8 !w-8" onClick={() => setPeople((p) => Math.max(1, p - 1))}>
              −
            </button>
            <span className="w-8 text-center text-lg font-bold text-white">{people}</span>
            <button className="btn-icon !h-8 !w-8" onClick={() => setPeople((p) => Math.min(99, p + 1))}>
              +
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-brasa-500/20 bg-brasa-900/25 p-4">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-slate-300">
              <span>Subtotal ({order.active_count} itens)</span>
              <span>{brl(subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Taxa de serviço</span>
              <span>+ {brl(serviceFee)}</span>
            </div>
            <div className="flex justify-between text-emerald-300">
              <span>Desconto</span>
              <span>- {brl(discount)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
              <span className="text-base font-bold text-white">TOTAL</span>
              <span className="text-2xl font-black text-brasa-300">{brl(total)}</span>
            </div>
            {people > 1 && (
              <p className="flex items-center gap-1.5 pt-1 text-xs text-slate-400">
                <Sparkles size={12} /> {brl(Math.round((total / people) * 100) / 100)} por pessoa ({people} pessoas)
              </p>
            )}
          </div>
        </div>

        {order.commands.length > 1 && (
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
            <p className="label">Divisão por comanda</p>
            <div className="mt-1 space-y-1">
              {order.commands.map((c) => (
                <div key={c.name} className="flex justify-between text-sm">
                  <span className="text-slate-300">{c.name}</span>
                  <span className="font-semibold text-white">{brl(c.subtotal)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
