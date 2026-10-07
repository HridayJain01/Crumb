import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, TriangleAlert } from 'lucide-react';

interface ToastOptions {
  message: string;
  tone?: 'success' | 'info' | 'warning';
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const ToastContext = createContext<(t: ToastOptions) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (opts: ToastOptions) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-1), { ...opts, id }]);
      window.setTimeout(() => dismiss(id), opts.durationMs ?? (opts.action ? 6000 : 3200));
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] mx-auto flex max-w-lg flex-col items-center gap-2 px-4"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex w-full items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-[15px] font-semibold text-white shadow-lg animate-pop"
          >
            {t.tone === 'warning' ? (
              <TriangleAlert className="size-5 shrink-0 text-[#FFD27A]" aria-hidden />
            ) : t.tone === 'info' ? (
              <Info className="size-5 shrink-0 text-[#9FE3D8]" aria-hidden />
            ) : (
              <CheckCircle2 className="size-5 shrink-0 text-[#8EE0AE]" aria-hidden />
            )}
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                className="rounded-full px-2 py-1 font-extrabold text-[#FFB59E] hover:bg-white/10"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
