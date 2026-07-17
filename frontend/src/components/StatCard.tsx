import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { Card } from "./Card";
import { CountUp } from "./CountUp";
import { cn } from "../lib/utils";

type Trend = "up" | "down" | "neutral";

interface StatCardProps {
  label: string;
  value: number;
  suffix?: string;
  decimals?: number;
  icon: LucideIcon;
  trend?: Trend;
  deltaLabel?: string;
  /** "good" colors up = green; "cost" colors down = green (spending going down is good). */
  polarity?: "good" | "cost";
  delay?: number;
  className?: string;
  /** Opens the consultative drill-down; also shows the "لماذا هذا الرقم؟" hint. */
  onDetails?: () => void;
}

const trendMeta = {
  up: { Icon: ArrowUpRight, word: "صاعد" },
  down: { Icon: ArrowDownRight, word: "هابط" },
  neutral: { Icon: Minus, word: "ثابت" },
} as const;

export function StatCard({
  label,
  value,
  suffix = "ر.س",
  decimals = 0,
  icon: Icon,
  trend = "neutral",
  deltaLabel,
  polarity = "good",
  delay = 0,
  className,
  onDetails,
}: StatCardProps) {
  const meta = trendMeta[trend];
  // Decide chip color from trend + polarity
  const isPositive =
    trend === "neutral"
      ? null
      : polarity === "good"
      ? trend === "up"
      : trend === "down";
  const chipClass =
    isPositive === null
      ? "bg-cream-deep text-ink-soft"
      : isPositive
      ? "bg-positive-bg text-positive"
      : "bg-negative-bg text-negative";

  return (
    <Card
      className={cn("p-5 flex flex-col gap-4", className)}
      interactive
      onClick={onDetails}
    >
      <div className="flex items-start justify-between">
        <div className="w-11 h-11 rounded-xl bg-copper-tint flex items-center justify-center">
          <Icon size={20} className="text-copper" strokeWidth={2} />
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full",
            chipClass
          )}
        >
          <meta.Icon size={12} strokeWidth={2.5} />
          {deltaLabel ?? meta.word}
        </span>
      </div>
      <div>
        <CountUp
          value={value}
          decimals={decimals}
          delay={delay}
          suffix={suffix ? ` ${suffix}` : ""}
          className="text-2xl font-bold text-ink"
        />
        <div className="text-sm text-ink-soft mt-1">{label}</div>
        {onDetails && (
          <div className="text-xs text-copper font-semibold mt-2.5">لماذا هذا الرقم؟ ←</div>
        )}
      </div>
    </Card>
  );
}
