export const brl = (value: number | string | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0));

export const brlCompact = (value: number) => {
  const n = Number(value ?? 0);
  if (Math.abs(n) >= 1000) return `R$ ${(n / 1000).toFixed(1).replace('.', ',')}k`;
  return brl(n);
};

export const minutesLabel = (mins: number) => {
  const m = Math.max(0, Math.round(mins || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return `${h}h${rest ? String(rest).padStart(2, '0') : ''}`;
};

export const timeLabel = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';

export const dateTimeLabel = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';

export const dateLabel = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

export const weekdayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');

export const paymentLabel: Record<string, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  debit: 'Débito',
  credit: 'Crédito',
  other: 'Outro',
};

export const statusLabel: Record<string, string> = {
  free: 'Livre',
  occupied: 'Ocupada',
  closing: 'Fechando',
  open: 'Aberta',
  closed: 'Fechada',
  canceled: 'Cancelada',
};

export const initials = (name: string) =>
  (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('');

export const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const parseNumberInput = (v: string) => {
  const clean = String(v).replace(/[^\d,.-]/g, '').replace(',', '.');
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
};

/** Divide "2x picanha" em quantidade + termo de busca. */
export const parseQuickAdd = (raw: string): { quantity: number; term: string } => {
  const text = raw.trim();
  const m = text.match(/^(\d{1,3})\s*[xX*]?\s+(.*)$/) || text.match(/^(\d{1,3})\s*[xX*]$/);
  if (m) {
    const quantity = Math.min(999, Math.max(1, Number(m[1])));
    const term = (m[2] ?? '').trim();
    return term ? { quantity, term } : { quantity, term: text };
  }
  return { quantity: 1, term: text };
};
