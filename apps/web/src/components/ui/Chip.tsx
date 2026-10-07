import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Chip({
  selected,
  icon,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; icon?: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-chip border px-3.5 text-sm font-bold transition active:scale-[0.97] ${
        selected
          ? 'border-primary bg-primary text-white'
          : 'border-line bg-surface text-ink hover:border-primary/40'
      } ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export function ChipRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] ${className}`}
    >
      {children}
    </div>
  );
}
