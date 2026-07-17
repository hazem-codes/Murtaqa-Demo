import { motion, type HTMLMotionProps } from "motion/react";
import { cn } from "../lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "dark";
type Size = "sm" | "md" | "lg";

type ButtonProps = HTMLMotionProps<"button"> & {
  variant?: Variant;
  size?: Size;
};

const variants: Record<Variant, string> = {
  primary:
    "bg-copper text-white shadow-[var(--shadow-sm)] hover:bg-copper-dark hover:shadow-[var(--shadow-md)]",
  secondary:
    "bg-copper-tint text-copper-dark hover:bg-[#ecdfd0] border border-copper/15",
  ghost:
    "bg-transparent text-copper border border-copper/30 hover:bg-copper-tint",
  dark:
    "bg-espresso text-white hover:bg-espresso-2 shadow-[var(--shadow-sm)]",
};

const sizes: Record<Size, string> = {
  sm: "text-sm px-5 py-2 rounded-full gap-1.5",
  md: "text-sm px-6 py-3 rounded-full gap-2",
  lg: "text-base px-8 py-4 rounded-full gap-2.5",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <motion.button
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.15 }}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors duration-200 select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </motion.button>
  );
}
