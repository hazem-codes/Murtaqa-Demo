import type { Variants, Transition } from "motion/react";

/** Calm, premium easing — used everywhere for a cohesive feel. */
export const EASE = [0.22, 1, 0.36, 1] as const;
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const spring: Transition = { type: "spring", stiffness: 260, damping: 26, mass: 0.9 };

/** Section / card entrance: gentle rise + fade. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: EASE },
  },
};

/** Parent container that reveals its children one after another. */
export const staggerContainer = (stagger = 0.08, delayChildren = 0.05): Variants => ({
  hidden: {},
  show: {
    transition: { staggerChildren: stagger, delayChildren },
  },
});

/** Child item for staggered lists (transactions, chips, path cards). */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/** Slide-in from the trailing (right in RTL) edge — for chat bubbles / side items. */
export const slideInEnd: Variants = {
  hidden: { opacity: 0, x: 24 },
  show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: EASE } },
};

export const slideInStart: Variants = {
  hidden: { opacity: 0, x: -24 },
  show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: EASE } },
};

/** Standard viewport trigger config: animate once when ~25% in view. */
export const inView = { once: true, amount: 0.25 } as const;
