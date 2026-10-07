import type { ReactNode } from 'react';
import { Mascot } from './Mascot';

export function EmptyState({
  title,
  body,
  action,
  mood = 'happy',
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  mood?: 'happy' | 'thinking' | 'oops' | 'sleepy';
}) {
  return (
    <div className="flex flex-col items-center px-6 py-8 text-center animate-fade-up">
      <Mascot mood={mood} size={88} />
      <h3 className="mt-3 text-lg font-extrabold">{title}</h3>
      {body && <p className="mt-1 max-w-xs text-[15px] font-semibold text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Something went sideways',
  body,
  action,
}: {
  title?: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return <EmptyState title={title} body={body} action={action} mood="oops" />;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-xl ${className}`} aria-hidden />;
}

export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-3"
      role="status"
      aria-live="polite"
    >
      <Mascot mood="thinking" size={84} className="animate-pulse" />
      <p className="text-sm font-bold text-muted">{label}</p>
    </div>
  );
}
