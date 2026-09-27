import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

export default function Modal({
  title,
  subtitle,
  children,
  onClose,
  footer,
  size = 'md',
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];

  return (
    <div className="no-print fixed inset-0 z-[90] flex items-end justify-center overflow-y-auto bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className={`animate-in card w-full ${width} my-auto max-h-[95vh] overflow-hidden rounded-b-none sm:rounded-2xl`}>
        <div className="flex items-start justify-between gap-4 border-b border-white/5 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="btn-icon !h-9 !w-9" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/5 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}
