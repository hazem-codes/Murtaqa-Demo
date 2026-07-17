import { useEffect, useRef, useState } from "react";
import { useInView, useMotionValue, animate } from "motion/react";
import { EASE } from "../animations/variants";

interface CountUpProps {
  value: number;
  /** Digits after the decimal point. */
  decimals?: number;
  duration?: number;
  delay?: number;
  prefix?: string;
  suffix?: string;
  /** Group thousands with commas. */
  grouping?: boolean;
  className?: string;
}

/**
 * Animates a number from 0 → value the first time it scrolls into view.
 * Used for every financial figure so cards "come alive" on entrance.
 */
export function CountUp({
  value,
  decimals = 0,
  duration = 1.4,
  delay = 0,
  prefix = "",
  suffix = "",
  grouping = true,
  className,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, value, {
      duration,
      delay,
      ease: EASE,
      onUpdate: (v) => {
        const formatted = grouping
          ? v.toLocaleString("en-US", {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })
          : v.toFixed(decimals);
        setDisplay(formatted);
      },
    });
    return () => controls.stop();
  }, [inView, value, duration, delay, decimals, grouping, mv]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      <span className="tnum">{display}</span>
      {suffix}
    </span>
  );
}
