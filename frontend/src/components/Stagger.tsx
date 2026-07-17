import { motion, type HTMLMotionProps } from "motion/react";
import { staggerContainer, staggerItem, inView } from "../animations/variants";
import { cn } from "../lib/utils";

type StaggerProps = HTMLMotionProps<"div"> & {
  stagger?: number;
  delayChildren?: number;
  /** Trigger on scroll into view instead of immediately on mount. */
  onView?: boolean;
};

/** Wraps a list so children reveal one after another. */
export function Stagger({
  children,
  className,
  stagger = 0.08,
  delayChildren = 0.05,
  onView = true,
  ...props
}: StaggerProps) {
  return (
    <motion.div
      variants={staggerContainer(stagger, delayChildren)}
      initial="hidden"
      {...(onView
        ? { whileInView: "show", viewport: inView }
        : { animate: "show" })}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** A single staggered child (fade + slide up). */
export function StaggerItem({ children, className, ...props }: HTMLMotionProps<"div">) {
  return (
    <motion.div variants={staggerItem} className={cn(className)} {...props}>
      {children}
    </motion.div>
  );
}
