import { useEffect, useState } from 'react';
import { Printer, Receipt } from 'lucide-react';
import Modal from './Modal';
import { api } from '../lib/api';
import { useToast } from '../lib/store';

export default function BillModal({
  tableId,
  onClose,
  onCloseAccount,
}: {
  tableId: number;
  onClose: () => void;
  onCloseAccount: () => void;
}) {
  const toast = useToast();
  const [bill, setBill] = useState<string>('');

  useEffect(() => {
    api
      .bill(tableId)
      .then((r) => setBill(r.bill))
      .catch((err) => toast.error('Não foi possível gerar a conta', err.message));
  }, [tableId, toast]);

  return (
    <Modal
      title="Conferência da conta"
      subtitle="Confira com o cliente antes de fechar. Você pode imprimir ou mostrar na tela."
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button className="btn-ghost" onClick={() => window.print()}>
            <Printer size={16} /> Imprimir
          </button>
          <button className="btn-success" onClick={onCloseAccount}>
            <Receipt size={16} /> Fechar conta
          </button>
        </>
      }
    >
      <pre className="print-area overflow-x-auto rounded-2xl bg-carvao-950 p-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-slate-200">
        {bill || 'Gerando…'}
      </pre>
    </Modal>
  );
}
