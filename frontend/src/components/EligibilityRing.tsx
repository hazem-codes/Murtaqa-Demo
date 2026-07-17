import { useRef } from "react";
import { motion, useInView } from "motion/react";
import { CountUp } from "./CountUp";
import { EASE } from "../animations/variants";

interface EligibilityRingProps {
  percentage: number;
  size?: number;
  label?: string;
  /** Show the tier word (ممتاز / جيدة / تحتاج تحسين) under the number. */
  showTier?: boolean;
  /** Style for dark (espresso) surfaces: light track, white number, gold arc. */
  onDark?: boolean;
}

function tierOf(p: number) {
  if (p >= 80) return { word: "ممتازة", color: "var(--positive)" };
  if (p >= 65) return { word: "جيدة", color: "var(--copper)" };
  if (p >= 50) return { word: "مقبولة", color: "var(--warn)" };
  return { word: "تحتاج تحسين", color: "var(--negative)" };
}

/**
 * Self-drawing circular gauge for the financing-eligibility score.
 * The arc draws from 0 to its value when scrolled into view, while the
 * center percentage counts up in sync.
 */
export function EligibilityRing({
  percentage,
  size = 180,
  label = "أهليتك الحالية",
  showTier = false,
  onDark = false,
}: EligibilityRingProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const stroke = Math.max(10, size * 0.075);
  const radius = (size - stroke * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const tier = tierOf(percentage);
  const gradId = `ring-grad-${size}-${onDark ? "dark" : "light"}`;

  return (
    <div
      ref={ref}
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={onDark ? "#E7CBA0" : "var(--copper-light)"} />
            <stop offset="100%" stopColor={onDark ? "var(--gold)" : tier.color} />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={onDark ? "rgba(255,255,255,0.12)" : "var(--cream-deep)"}
          strokeWidth={stroke}
        />
        {/* Progress — self-drawing */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={
            inView
              ? { strokeDashoffset: circumference - (percentage / 100) * circumference }
              : {}
          }
          transition={{ duration: 1.5, ease: EASE }}
        />
      </svg>

      <div className="absolute flex flex-col items-center">
        <CountUp
          value={percentage}
          suffix="٪"
          duration={1.5}
          className={onDark ? "text-4xl font-bold text-white" : "text-4xl font-bold text-ink"}
        />
        {showTier ? (
          <span
            className="text-xs font-semibold mt-1"
            style={{ color: onDark ? "var(--gold)" : tier.color }}
          >
            {tier.word}
          </span>
        ) : (
          <span className={onDark ? "text-xs text-white/60 mt-1" : "text-xs text-ink-soft mt-1"}>
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
