import { motion } from "motion/react";

/** A restrained 4-point star used as a decorative accent near headlines. */
export function Sparkle({
  size = 28,
  color = "var(--copper)",
  className = "",
  delay = 0,
  spin = false,
}: {
  size?: number;
  color?: string;
  className?: string;
  delay?: number;
  spin?: boolean;
}) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
      initial={{ scale: 0, opacity: 0, rotate: -30 }}
      animate={{
        scale: 1,
        opacity: 1,
        rotate: spin ? [0, 15, 0] : 0,
      }}
      transition={{
        scale: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.6, delay },
        rotate: spin ? { duration: 4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.6, delay },
      }}
    >
      <path
        d="M12 0 C12.8 6.5 17.5 11.2 24 12 C17.5 12.8 12.8 17.5 12 24 C11.2 17.5 6.5 12.8 0 12 C6.5 11.2 11.2 6.5 12 0 Z"
        fill={color}
      />
    </motion.svg>
  );
}
