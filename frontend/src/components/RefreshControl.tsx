import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { RefreshCw, CheckCircle2 } from "lucide-react";
import { cn } from "../lib/utils";

/** Circular refresh action that sits next to a PageHeader's meta chip. */
export function RefreshButton({
  onClick,
  spinning = false,
}: {
  onClick: () => void;
  spinning?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label="تحديث البيانات"
      className={cn(
        "w-9 h-9 rounded-full bg-card border border-line shadow-[var(--shadow-sm)]",
        "flex items-center justify-center text-ink-soft hover:text-copper hover:border-copper/30 transition-colors"
      )}
    >
      <RefreshCw size={16} className={spinning ? "animate-spin" : undefined} />
    </button>
  );
}

/** Lightweight bottom-center confirmation toast. */
export function Toast({ show, label }: { show: boolean; label: string }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.97 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-6 inset-x-0 z-[70] flex justify-center pointer-events-none"
        >
          <span className="inline-flex items-center gap-2 bg-espresso text-white text-sm font-medium ps-3 pe-5 py-2.5 rounded-full shadow-[var(--shadow-xl)]">
            <span className="w-6 h-6 rounded-full bg-positive/20 flex items-center justify-center">
              <CheckCircle2 size={14} className="text-positive" />
            </span>
            {label}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Refresh state helper: call `refresh(fn)` with the data re-fetch trigger;
 * it spins while the mock/API latency elapses, then confirms with a toast.
 */
export function useRefresh() {
  const [spinning, setSpinning] = useState(false);
  const [toast, setToast] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback((trigger: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    setSpinning(true);
    trigger();
    timer.current = setTimeout(() => {
      setSpinning(false);
      setToast(true);
      timer.current = setTimeout(() => setToast(false), 2200);
    }, 700);
  }, []);

  return { spinning, toast, refresh };
}
