import { motion } from "motion/react";
import { fadeUp } from "../animations/variants";

interface PageHeaderProps {
  /** Small kicker chip above the title, e.g. "نظرة عامة". */
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: string;
  /** Optional element on the end side (date chip, action button…). */
  end?: React.ReactNode;
}

/**
 * Editorial page opener for authenticated screens: eyebrow chip, large title,
 * quiet subtitle, and an optional end-side meta slot. Gives every screen a
 * deliberate focal start instead of a plain small heading.
 */
export function PageHeader({ eyebrow, title, subtitle, end }: PageHeaderProps) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={fadeUp}
      className="flex flex-wrap items-end justify-between gap-4"
    >
      <div>
        {eyebrow && (
          <span className="inline-flex items-center text-xs font-semibold text-copper bg-copper-tint/80 border border-copper/10 rounded-full px-3.5 py-1 mb-3">
            {eyebrow}
          </span>
        )}
        <h2 className="text-2xl md:text-[2.1rem] font-bold text-ink leading-snug">{title}</h2>
        {subtitle && <p className="text-ink-soft text-sm md:text-base mt-1.5">{subtitle}</p>}
      </div>
      {end && <div className="shrink-0 pb-1">{end}</div>}
    </motion.div>
  );
}
