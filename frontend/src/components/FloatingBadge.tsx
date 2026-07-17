import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";

interface FloatingBadgeProps {
  icon: LucideIcon;
  /** Which edge/corner it floats on. In RTL, "start" = right, "end" = left. */
  position?: "top-start" | "top-end" | "top-center";
  tone?: "copper" | "espresso" | "gold";
  size?: number;
  className?: string;
}

const toneStyles: Record<NonNullable<FloatingBadgeProps["tone"]>, string> = {
  copper: "bg-gradient-to-br from-copper-light to-copper-dark text-white",
  espresso: "bg-gradient-to-br from-espresso-2 to-espresso text-gold",
  gold: "bg-gradient-to-br from-[#E8CEA6] to-[#C29A64] text-espresso",
};

const ringColor: Record<NonNullable<FloatingBadgeProps["tone"]>, string> = {
  copper: "var(--copper)",
  espresso: "var(--espresso)",
  gold: "var(--gold)",
};

/**
 * A circular icon badge that floats half-inside / half-outside a card's edge,
 * with a gentle vertical float and a soft expanding pulse ring —
 * the signature "spending card" accent seen on premium bank dashboards.
 * Parent card must be `position: relative`.
 */
export function FloatingBadge({
  icon: Icon,
  position = "top-start",
  tone = "copper",
  size = 52,
  className,
}: FloatingBadgeProps) {
  const pos =
    position === "top-start"
      ? "top-0 start-6 -translate-y-1/2"
      : position === "top-end"
      ? "top-0 end-6 -translate-y-1/2"
      : "top-0 start-1/2 -translate-x-1/2 -translate-y-1/2";

  return (
    <div className={cn("absolute z-10 pointer-events-none", pos, className)}>
      <div className="relative animate-[float_5s_ease-in-out_infinite]" style={{ width: size, height: size }}>
        {/* Pulse ring */}
        <span
          className="absolute inset-0 rounded-full animate-[pulseRing_2.6s_cubic-bezier(0.4,0,0.2,1)_infinite]"
          style={{ backgroundColor: ringColor[tone] }}
        />
        {/* Badge */}
        <div
          className={cn(
            "relative w-full h-full rounded-full flex items-center justify-center",
            "shadow-[var(--shadow-md)] ring-4 ring-cream",
            toneStyles[tone]
          )}
        >
          <Icon size={size * 0.42} strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}
