import { useRef } from "react";
import { motion, useInView } from "motion/react";
import { EASE } from "../animations/variants";
import { formatSAR } from "../lib/utils";

export interface RingDatum {
  label: string;
  /** Fill percentage 0–100. */
  value: number;
  amount: number;
  color: string;
}

/**
 * Nested concentric progress rings for layered metrics (QClay-style).
 * Each ring self-draws from empty on scroll-in; a legend lists exact amounts.
 */
export function ConcentricRings({
  data,
  size = 200,
}: {
  data: RingDatum[];
  size: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const center = size / 2;
  const stroke = Math.max(9, size * 0.055);
  const gap = stroke + 6;
  const outer = center - stroke;

  return (
    <div ref={ref} className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
        {data.map((d, i) => {
          const r = outer - i * gap;
          if (r <= 0) return null;
          const circ = 2 * Math.PI * r;
          return (
            <g key={d.label}>
              <circle cx={center} cy={center} r={r} fill="none" stroke="var(--cream-deep)" strokeWidth={stroke} />
              <motion.circle
                cx={center}
                cy={center}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={circ}
                initial={{ strokeDashoffset: circ }}
                animate={inView ? { strokeDashoffset: circ - (d.value / 100) * circ } : {}}
                transition={{ duration: 1.3, ease: EASE, delay: i * 0.12 }}
              />
            </g>
          );
        })}
      </svg>

      <div className="space-y-2.5 min-w-0">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            <div className="min-w-0">
              <div className="text-sm font-bold text-ink tnum leading-none">{formatSAR(d.amount)}</div>
              <div className="text-xs text-ink-soft mt-0.5 truncate">{d.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
