import { cn } from "../lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  /** Use light colors for dark surfaces (sidebar). */
  onDark?: boolean;
  showTagline?: boolean;
}

const chip = {
  sm: "text-base px-2.5 py-0.5 rounded-lg",
  md: "text-xl px-3.5 py-1 rounded-xl",
  lg: "text-3xl px-5 py-2 rounded-2xl",
};
const tagSize = { sm: "text-[10px]", md: "text-xs", lg: "text-sm" };

/**
 * Murtaqa wordmark set on a solid brand-colored chip (STC-style solid lockup)
 * — copper chip on light surfaces, warm gold chip on dark surfaces.
 */
export function Logo({ size = "md", onDark = false, showTagline = true }: LogoProps) {
  return (
    <div className="flex flex-col items-start leading-none">
      <span
        className={cn(
          "inline-flex items-center font-bold tracking-tight shadow-[var(--shadow-sm)]",
          chip[size]
        )}
        style={{
          background: onDark ? "var(--gold)" : "var(--copper)",
          color: onDark ? "var(--espresso)" : "#fff",
        }}
      >
        مُرتقى
      </span>
      {showTagline && (
        <span
          className={cn("font-light mt-1.5 ps-0.5", tagSize[size])}
          style={{ color: onDark ? "rgba(255,255,255,0.5)" : "var(--ink-soft)" }}
        >
          مرشدك المالي
        </span>
      )}
    </div>
  );
}
