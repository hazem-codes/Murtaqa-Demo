import { RefreshCw, CloudOff, Inbox } from "lucide-react";
import { cn } from "../lib/utils";

/** Warm shimmer block used while a data section loads. */
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn("rounded-2xl bg-cream-deep animate-[shimmer_2.2s_linear_infinite]", className)}
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--cream-deep) 25%, var(--sand) 50%, var(--cream-deep) 75%)",
        backgroundSize: "200% 100%",
        ...style,
      }}
      aria-hidden
    />
  );
}

/** Full-section loading placeholder: header line + content block. */
export function SectionLoading({ height = 220 }: { height?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="جارٍ التحميل">
      <Skeleton className="h-5 w-40" />
      <Skeleton style={{ height }} className="w-full" />
    </div>
  );
}

/** Error state with retry — shown when an API call fails. */
export function SectionError({ onRetry, message }: { onRetry: () => void; message?: string }) {
  return (
    <div className="rounded-2xl border border-negative/20 bg-negative-bg/40 p-8 text-center">
      <div className="w-12 h-12 rounded-2xl bg-card shadow-[var(--shadow-sm)] flex items-center justify-center mx-auto mb-4">
        <CloudOff size={22} className="text-negative" />
      </div>
      <div className="font-bold text-ink text-sm mb-1">تعذّر تحميل البيانات</div>
      <p className="text-xs text-ink-soft leading-relaxed mb-4">
        {message ?? "حدث خلل أثناء جلب بياناتك. لا تقلق — بياناتك سليمة، والمشكلة في الاتصال فقط."}
      </p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 text-sm font-semibold text-copper bg-card border border-copper/25 rounded-full px-5 py-2 hover:bg-copper-tint transition-colors"
      >
        <RefreshCw size={15} />
        إعادة المحاولة
      </button>
    </div>
  );
}

/** Empty state for sections that can legitimately have no rows. */
export function SectionEmpty({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-cream-deep/50 p-8 text-center">
      <div className="w-12 h-12 rounded-2xl bg-card shadow-[var(--shadow-sm)] flex items-center justify-center mx-auto mb-3">
        <Inbox size={22} className="text-ink-faint" />
      </div>
      <p className="text-sm text-ink-soft">{label}</p>
    </div>
  );
}
