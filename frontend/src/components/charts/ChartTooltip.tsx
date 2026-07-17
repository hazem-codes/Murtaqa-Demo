import type { TooltipProps } from "recharts";
import { formatSAR } from "../../lib/utils";

/**
 * Elegant, on-brand tooltip for Recharts — warm white card, hairline border,
 * copper labels. Shows the exact value for the hovered data point.
 */
export function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div
      dir="rtl"
      className="rounded-xl bg-card/95 backdrop-blur-sm border border-line px-3.5 py-2.5 shadow-[var(--shadow-lg)]"
    >
      {label && <div className="text-xs text-ink-soft mb-1.5 font-medium">{label}</div>}
      <div className="space-y-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: entry.color as string }}
            />
            <span className="text-ink-soft">{entry.name}</span>
            <span className="font-bold text-ink tnum me-1">
              {formatSAR(Number(entry.value))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Percentage-flavored tooltip for the spending donut. */
export function PercentTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0];
  const datum = p.payload as { amount?: number };
  return (
    <div
      dir="rtl"
      className="rounded-xl bg-card/95 backdrop-blur-sm border border-line px-3.5 py-2.5 shadow-[var(--shadow-lg)]"
    >
      <div className="flex items-center gap-2 text-sm">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: (p.payload.color as string) ?? (p.color as string) }}
        />
        <span className="text-ink-soft">{p.name}</span>
        <span className="font-bold text-ink tnum">{Number(p.value)}٪</span>
      </div>
      {datum.amount != null && (
        <div className="text-xs text-ink-soft mt-1 text-start pe-4">
          {formatSAR(datum.amount)}
        </div>
      )}
    </div>
  );
}
