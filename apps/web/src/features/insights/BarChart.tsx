/**
 * Minimal, accessible bar chart (hand-drawn SVG; no chart library). Each chart answers one
 * question, has a reference line (target or average) with a legend, and a text alternative.
 */
export function BarChart({
  title,
  data,
  reference,
  referenceLabel,
  color,
  format = (v) => String(Math.round(v)),
}: {
  title: string;
  data: { label: string; value: number | null; highlight?: boolean }[];
  reference?: number;
  referenceLabel?: string;
  color: string;
  format?: (v: number) => string;
}) {
  const W = 320;
  const H = 150;
  const padTop = 18;
  const padBottom = 22;
  const values = data.map((d) => d.value ?? 0);
  const max = Math.max(1, ...values, reference ?? 0) * 1.1;
  const slot = W / data.length;
  const barW = Math.min(28, slot * 0.6);
  const y = (v: number) => padTop + (H - padTop - padBottom) * (1 - v / max);
  const summary = data
    .map((d) => `${d.label}: ${d.value === null ? 'no data' : format(d.value)}`)
    .join(', ');

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${title}. ${summary}`}
      >
        {reference !== undefined && reference > 0 && (
          <g>
            <line
              x1={0}
              x2={W}
              y1={y(reference)}
              y2={y(reference)}
              stroke="var(--color-muted)"
              strokeDasharray="4 4"
              strokeWidth={1.2}
            />
          </g>
        )}
        {data.map((d, i) => {
          const x = i * slot + (slot - barW) / 2;
          const v = d.value ?? 0;
          const top = y(v);
          return (
            <g key={d.label + i}>
              {d.value !== null && v > 0 ? (
                <>
                  <rect
                    x={x}
                    y={top}
                    width={barW}
                    height={Math.max(2, H - padBottom - top)}
                    rx={6}
                    fill={color}
                    opacity={d.highlight ? 1 : 0.75}
                  />
                  <text
                    x={x + barW / 2}
                    y={top - 4}
                    textAnchor="middle"
                    fontSize={9.5}
                    fontWeight={800}
                    fill="var(--color-ink)"
                  >
                    {format(v)}
                  </text>
                </>
              ) : (
                <rect
                  x={x}
                  y={H - padBottom - 3}
                  width={barW}
                  height={3}
                  rx={1.5}
                  fill="var(--color-line)"
                />
              )}
              <text
                x={x + barW / 2}
                y={H - 6}
                textAnchor="middle"
                fontSize={10}
                fontWeight={d.highlight ? 900 : 700}
                fill={d.highlight ? 'var(--color-ink)' : 'var(--color-muted)'}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      {reference !== undefined && reference > 0 && referenceLabel && (
        // The legend sits outside the plot so it never collides with tall bars.
        <figcaption className="mt-1 flex items-center gap-2 text-[12px] font-bold text-muted">
          <svg width="22" height="6" aria-hidden>
            <line
              x1={0}
              x2={22}
              y1={3}
              y2={3}
              stroke="var(--color-muted)"
              strokeDasharray="4 4"
              strokeWidth={1.5}
            />
          </svg>
          {referenceLabel}
        </figcaption>
      )}
    </figure>
  );
}
