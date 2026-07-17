import { Sparkles } from "lucide-react";
import { Modal } from "./Modal";
import type { MetricDetail } from "../lib/data";

/**
 * Consultative drill-down for a metric: what the number is, how it breaks
 * down, and the guide's practical note — the "لماذا هذا الرقم؟" layer that
 * separates summary from detail across the dashboards.
 */
export function MetricDetailModal({
  detail,
  open,
  onClose,
}: {
  detail: MetricDetail | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} className="max-w-md" title={detail?.title ?? "تفاصيل الرقم"}>
      {!detail && (
        <p className="text-sm text-ink-soft leading-relaxed">لا تتوفر تفاصيل لهذا البند حالياً.</p>
      )}
      {detail && (
        <div className="space-y-5">
          <p className="text-sm text-ink-soft leading-relaxed">{detail.explanation}</p>

          <div className="rounded-2xl border border-line divide-y divide-line overflow-hidden">
            {detail.breakdown.map((row) => (
              <div key={row.label} className="flex items-center justify-between px-4 py-3 bg-card">
                <span className="text-sm text-ink-soft">{row.label}</span>
                <span className="text-sm font-bold text-ink tnum">{row.value}</span>
              </div>
            ))}
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-espresso p-4">
            <div className="pointer-events-none absolute -top-8 -end-6 w-32 h-32 rounded-full bg-gold/15 blur-2xl" />
            <div className="relative flex items-start gap-3">
              <span className="shrink-0 w-8 h-8 rounded-lg bg-gold/15 flex items-center justify-center">
                <Sparkles size={15} className="text-gold" />
              </span>
              <div>
                <div className="text-xs font-bold text-gold mb-1">ملاحظة مرشدك</div>
                <p className="text-xs text-white/75 leading-relaxed">{detail.advice}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
