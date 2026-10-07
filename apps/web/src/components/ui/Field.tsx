import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

export function Field({
  label,
  hint,
  suffix,
  error,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  suffix?: ReactNode;
  error?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[13px] font-extrabold text-muted">
        {label}
      </label>
      <div
        className={`flex h-12 items-center rounded-2xl border bg-surface px-3 transition focus-within:border-primary ${error ? 'border-danger' : 'border-line'}`}
      >
        <input
          id={id}
          className="h-full w-full bg-transparent text-[16px] font-bold outline-none placeholder:text-muted"
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={hint || error ? `${id}-hint` : undefined}
          {...rest}
        />
        {suffix && <span className="ml-2 shrink-0 text-sm font-bold text-muted">{suffix}</span>}
      </div>
      {(hint || error) && (
        <p
          id={`${id}-hint`}
          className={`mt-1 text-[12px] font-semibold ${error ? 'text-danger' : 'text-muted'}`}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-chip bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-9 flex-1 rounded-chip px-3 text-sm font-extrabold transition ${
            value === o.value ? 'bg-surface text-ink shadow-card' : 'text-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
