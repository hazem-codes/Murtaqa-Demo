import { forwardRef } from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { cn } from "../lib/utils";
import { fadeUp, inView } from "../animations/variants";

type CardProps = HTMLMotionProps<"div"> & {
  /** Add a hover lift interaction. */
  interactive?: boolean;
  /** Reveal with fade-up when scrolled into view. */
  reveal?: boolean;
};

/**
 * The base surface of the whole app: warm white, hairline border,
 * soft copper-tinted elevation. Optionally reveals on scroll and lifts on hover.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, interactive = false, reveal = true, children, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        variants={reveal ? fadeUp : undefined}
        initial={reveal ? "hidden" : undefined}
        whileInView={reveal ? "show" : undefined}
        viewport={reveal ? inView : undefined}
        whileHover={
          interactive
            ? { y: -4, boxShadow: "var(--shadow-lg)", transition: { duration: 0.25 } }
            : undefined
        }
        className={cn(
          "relative rounded-2xl bg-card border border-line",
          "shadow-[var(--shadow-sm)]",
          interactive && "cursor-pointer",
          className
        )}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);
Card.displayName = "Card";
