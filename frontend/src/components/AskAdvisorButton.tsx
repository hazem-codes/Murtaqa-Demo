import { MessageCircleQuestion } from "lucide-react";
import { askAdvisor } from "../lib/chatHandoff";
import { cn } from "../lib/utils";

/**
 * A small "Ask the Advisor" handoff icon (Part 7). Sits next to a sensitive/consequential figure
 * (a SAMA ratio, a rate, a loan amount, a strategy/roadmap step) and opens the existing chat with
 * a pre-filled, editable draft question referencing that specific figure — never auto-sent.
 */
export function AskAdvisorButton({
  draft,
  className,
  tone = "light",
}: {
  draft: string;
  className?: string;
  /** "light" for dark/espresso surfaces, "dark" for light card surfaces. */
  tone?: "light" | "dark";
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        askAdvisor(draft);
      }}
      aria-label="اسأل المستشار عن هذا"
      title="اسأل المستشار عن هذا"
      className={cn(
        "inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0 transition-colors",
        tone === "light"
          ? "bg-white/15 text-white/80 hover:bg-white/25"
          : "bg-copper-tint text-copper hover:bg-copper/20",
        className
      )}
    >
      <MessageCircleQuestion size={12} />
    </button>
  );
}
