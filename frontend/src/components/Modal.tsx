import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { EASE } from "../animations/variants";
import { cn } from "../lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Premium, smoothly animated centered modal with a blurred backdrop.
 * RTL-first, closes on backdrop click or Escape. Locks body scroll while open.
 */
export function Modal({ open, onClose, title, subtitle, children, className }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-6" dir="rtl">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            className="absolute inset-0 bg-espresso/45 backdrop-blur-md"
          />

          {/* Panel */}
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.4, ease: EASE }}
            className={cn(
              "relative w-full max-w-lg max-h-[88vh] overflow-hidden flex flex-col",
              "bg-card rounded-3xl border border-line shadow-[var(--shadow-xl)]",
              className
            )}
          >
            {/* Header */}
            <div className="relative shrink-0 px-6 pt-6 pb-5 border-b border-line bg-cream-deep/60">
              <div className="pointer-events-none absolute -top-10 -start-6 w-40 h-40 rounded-full bg-copper/10 blur-3xl" />
              <button
                onClick={onClose}
                aria-label="إغلاق"
                className="absolute top-5 start-5 z-10 w-9 h-9 rounded-xl bg-card border border-line flex items-center justify-center text-ink-soft hover:text-copper hover:border-copper/40 transition-colors"
              >
                <X size={18} />
              </button>
              {/* The button sits at the logical START (right edge in RTL), so clearance must be
                  reserved on that SAME side (ps-*) -- not pe-* (the opposite/left edge), which
                  left long titles running directly under the button (Part 15). */}
              {title && (
                <h3 className="relative text-lg font-bold text-ink ps-12 leading-snug">{title}</h3>
              )}
              {subtitle && <p className="relative text-sm text-ink-soft mt-1 ps-12">{subtitle}</p>}
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto scroll-warm px-6 py-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
