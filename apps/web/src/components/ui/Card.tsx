import type { HTMLAttributes, ReactNode } from 'react';

export function Card({
  className = '',
  children,
  tone = 'default',
  ...rest
}: HTMLAttributes<HTMLDivElement> & { tone?: 'default' | 'warm' | 'teal' | 'primary' }) {
  const tones = {
    default: 'bg-surface',
    warm: 'bg-surface-2',
    teal: 'bg-teal-soft',
    primary: 'bg-primary-soft',
  } as const;
  return (
    <div
      className={`rounded-card ${tones[tone]} p-4 shadow-card animate-fade-up ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  icon,
  action,
  subtitle,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="flex items-center gap-2">
        {icon && <span className="text-muted">{icon}</span>}
        <div>
          <h2 className="text-[17px] font-extrabold leading-tight">{title}</h2>
          {subtitle && <p className="text-[13px] font-semibold text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between px-1">
      <h2 className="text-[13px] font-extrabold uppercase tracking-wider text-muted">{children}</h2>
      {action}
    </div>
  );
}
