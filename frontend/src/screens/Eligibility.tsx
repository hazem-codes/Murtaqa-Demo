import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Check,
  TrendingUp,
  Clock,
  Sparkles,
  Info,
  ArrowRight,
  RotateCcw,
  ShieldCheck,
  Target,
  Wallet,
  Route,
  X,
  Plus,
  ChevronDown,
  Zap,
  ListChecks,
  CheckCircle2,
  XCircle,
  Edit3,
  FlaskConical,
  PartyPopper,
} from "lucide-react";
import {
  type DifficultyKey,
  type EligibilityPath,
  type RoadmapStep,
} from "../lib/data";
import { api, type SamaTest } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useSelectedAccount } from "../lib/accountStore";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { AskAdvisorButton } from "../components/AskAdvisorButton";
import { CountUp } from "../components/CountUp";
import { EligibilityRing } from "../components/EligibilityRing";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { Stagger, StaggerItem } from "../components/Stagger";
import { SectionLoading, SectionError } from "../components/AsyncStates";
import { fadeUp, inView, EASE } from "../animations/variants";
import { cn, formatSAR, formatNumber } from "../lib/utils";

/** Static Jargon Translator explanations for the non-ratio metric tiles. */
const RATE_TIP =
  "النسبة السنوية التي يقتطعها البنك كربح على التمويل. خفض هذه النسبة يقلل من القسط الشهري.";
const AVAILABLE_TIP =
  "أقصى مبلغ تمويل شخصي أو عقاري يمكنك الحصول عليه الآن بناءً على التزاماتك الحالية وقواعد البنك المركزي.";

/** Jargon Translator: a subtle 'i' that opens a plain-Arabic, number-grounded explanation. */
function MetricInfo({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="تفسير"
        className="w-4 h-4 rounded-full bg-white/15 text-white/80 text-[10px] font-bold flex items-center justify-center hover:bg-white/25 transition-colors"
      >
        i
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              transition={{ duration: 0.18, ease: EASE }}
              className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-30 w-60 max-w-[calc(100vw-3rem)] rounded-2xl bg-card border border-line p-3.5 shadow-[var(--shadow-xl)] text-right"
            >
              <p className="text-[11px] text-ink leading-relaxed">{text}</p>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </span>
  );
}

/** Formats a 0–1 ratio as a percent string, dropping a trailing ".00" but keeping e.g. "33.33". */
function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(2).replace(/\.00$/, "")}٪`;
}

/**
 * One of SAMA's 3 parallel tests, shown as an independent card with its own cap/ratio/pass-fail/
 * overage — never folded into a combined tile. T2 (non-mortgage obligations vs the 45% baseline)
 * shares its numerator with T1 against a strictly looser cap, so it is mathematically incapable of
 * rejecting a customer on its own in this dataset; that is stated honestly on its own card rather
 * than implied by hiding it.
 */
function SamaGateCard({
  test,
  allTests,
  installmentSar,
}: {
  test: SamaTest;
  allTests: SamaTest[];
  /** Part 8 — the requested loan's real monthly installment, which is what this test's numerator
      actually counts (never the raw requested amount shown elsewhere on the page). */
  installmentSar?: number;
}) {
  const salaryTest = allTests.find((t) => t.id === "salary_dbr");
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 flex flex-col gap-2",
        test.passed ? "bg-positive-bg border-[#CDE6D6]" : "bg-negative-bg border-[#F0C9C9]"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-ink-soft leading-snug">{test.label}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          <AskAdvisorButton
            tone="dark"
            draft={`لماذا نسبتي في اختبار "${test.label}" هي ${pct(test.calculatedRatio)} مقابل حد ${pct(test.allowedLimit)}؟`}
          />
          {test.passed ? (
            <CheckCircle2 size={16} className="text-positive shrink-0" />
          ) : (
            <XCircle size={16} className="text-negative shrink-0" />
          )}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn("text-xl font-bold tnum", test.passed ? "text-positive" : "text-negative")}>
          {pct(test.calculatedRatio)}
        </span>
        <span className="text-xs text-ink-soft">من حد {pct(test.allowedLimit)}</span>
      </div>
      {!test.passed && test.overageSar > 0 && (
        <div className="text-[11px] text-negative/80">
          يلزم تخفيض ~{formatSAR(test.overageSar)} شهرياً لعبور هذا الاختبار
        </div>
      )}
      {!test.binding && (
        <div className="text-[11px] text-ink-soft leading-relaxed bg-white/50 rounded-lg px-2.5 py-1.5 mt-1">
          محكوم رياضياً باختبار نسبة الراتب{salaryTest ? ` (سقفه ${pct(salaryTest.allowedLimit)} أضيق من ${pct(test.allowedLimit)})` : ""}
          — لا يمكن أن يرفض هذا الاختبار عميلاً بمفرده ضمن البيانات الحالية.
        </div>
      )}
      {/* Part 8 — clarify the numerator is the loan's MONTHLY INSTALLMENT, not the requested amount. */}
      {installmentSar != null && installmentSar > 0 && (
        <div className="text-[11px] text-ink-soft leading-relaxed bg-white/50 rounded-lg px-2.5 py-1.5">
          مبلغ التمويل المطلوب المعروض أعلى الصفحة <span className="font-semibold">ليس</span> ما يُحتسب
          هنا؛ هذا الاختبار يحتسب <span className="font-semibold">القسط الشهري التقديري</span> لهذا
          التمويل (الناتج من المبلغ + المدة + معدل الفائدة) وقدره{" "}
          <span className="font-semibold tnum">{formatSAR(installmentSar)}</span> شهرياً.
        </div>
      )}
    </div>
  );
}

/** All 3 SAMA gates as independent cards (never folded into 2). */
function SamaGatesSection({
  testResults,
  installmentSar,
}: {
  testResults: SamaTest[];
  installmentSar?: number;
}) {
  if (testResults.length !== 3) return null;
  return (
    <Card reveal={false} className="p-5 md:p-6">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={16} className="text-copper" />
        <h3 className="text-sm font-bold text-ink">اختبارات ساما الثلاثة</h3>
      </div>
      <p className="text-xs text-ink-soft mb-4 leading-relaxed">
        قواعد ساما الرسمية تُفحص هنا كثلاثة اختبارات مستقلة، لكل واحد سقفه ونسبته الخاصة.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {testResults.map((t) => (
          <SamaGateCard key={t.id} test={t} allTests={testResults} installmentSar={installmentSar} />
        ))}
      </div>
    </Card>
  );
}

const difficultyStyle: Record<DifficultyKey, string> = {
  سهل: "bg-positive-bg text-positive",
  متوسط: "bg-warn-bg text-warn",
  صعب: "bg-negative-bg text-negative",
};

/* Metric value tones on the dark overview stage. */
const toneStyle: Record<string, string> = {
  warn: "text-gold",
  neutral: "text-white",
};

/* ── Glowing matte-gold ring for the activated plan (shows target DBR) ─────── */
function ActivePlanRing({
  targetDbr,
  targetEligibility,
  currentDbr,
}: {
  targetDbr: number;
  targetEligibility: number;
  currentDbr: number;
}) {
  const size = 208;
  const stroke = 16;
  const radius = (size - stroke * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const fill = targetEligibility / 100;

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      {/* Soft gold glow behind the ring */}
      <motion.span
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: EASE }}
        className="absolute inset-3 rounded-full bg-gold/30 blur-2xl"
      />
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id="dbr-gold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#E7CBA0" />
            <stop offset="100%" stopColor="var(--gold)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--cream-deep)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#dbr-gold)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - fill * circumference }}
          transition={{ duration: 1.4, ease: EASE }}
          style={{ filter: "drop-shadow(0 0 8px rgba(216,185,145,0.75))" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-[11px] text-ink-soft mb-0.5">الالتزام المستهدف</span>
        <CountUp value={targetDbr} suffix="٪" duration={1.4} className="text-4xl font-bold text-ink tnum" />
        <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-positive">
          <TrendingUp size={12} className="rotate-180" />
          من {currentDbr}٪
        </span>
      </div>
    </div>
  );
}

/* ── Vertical month-by-month stepper (shared by modal + active plan) ───────── */
function TimelineStepper({
  path,
  animated = false,
  advisor = false,
}: {
  path: EligibilityPath;
  animated?: boolean;
  /** Show the smart-advisor "لماذا؟" chip + info popover on each step. */
  advisor?: boolean;
}) {
  const [openStep, setOpenStep] = useState<number | null>(null);

  return (
    <div className="relative">
      {path.timeline.map((step, i) => (
        <motion.div
          key={i}
          initial={animated ? { opacity: 0, x: 16 } : false}
          animate={animated ? { opacity: 1, x: 0 } : undefined}
          transition={animated ? { delay: 0.15 + i * 0.12, duration: 0.5, ease: EASE } : undefined}
          className="relative flex gap-4 pb-6 last:pb-0"
        >
          {/* connector */}
          {i < path.timeline.length - 1 && (
            <span className="absolute top-9 start-[15px] w-px h-[calc(100%-20px)] bg-line" />
          )}
          <div className="relative z-10 w-8 h-8 rounded-full bg-espresso text-gold text-xs font-bold flex items-center justify-center shrink-0 shadow-[var(--shadow-sm)]">
            {i + 1}
          </div>
          <div className="relative flex-1 pt-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-copper bg-copper-tint px-2 py-0.5 rounded-full">
                {step.month}
              </span>
              <h5 className="text-sm font-bold text-ink">{step.title}</h5>
              {advisor && (
                <span className="relative inline-flex">
                  <button
                    onClick={() => setOpenStep(openStep === i ? null : i)}
                    aria-label="المستشار الذكي — لماذا تساعدك هذه الخطوة؟"
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors",
                      openStep === i
                        ? "bg-espresso text-gold"
                        : "bg-gold/15 text-copper hover:bg-gold/25"
                    )}
                  >
                    <Sparkles size={11} /> لماذا؟
                  </button>

                  <AnimatePresence>
                    {openStep === i && (
                      <>
                        {/* click-away layer */}
                        <div className="fixed inset-0 z-20" onClick={() => setOpenStep(null)} />
                        {/* Popover opens to the LEFT of the chip, caret pointing at it */}
                        <div className="absolute top-1/2 right-full mr-3 -translate-y-1/2 z-30">
                          <motion.div
                            initial={{ opacity: 0, x: 8, scale: 0.97 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 8, scale: 0.97 }}
                            transition={{ duration: 0.2, ease: EASE }}
                            className="relative w-64 max-w-[calc(100vw-3rem)] rounded-2xl bg-espresso border border-white/10 p-4 shadow-[var(--shadow-xl)]"
                          >
                            {/* caret pointing right toward the chip */}
                            <span className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 rotate-45 bg-espresso border-t border-r border-white/10" />
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-6 h-6 rounded-lg bg-gold/15 flex items-center justify-center shrink-0">
                                <Sparkles size={12} className="text-gold" />
                              </div>
                              <span className="text-xs font-bold text-white">لماذا تساعدك هذه الخطوة؟</span>
                            </div>
                            <p className="text-xs text-white/75 leading-relaxed">{step.advice}</p>
                            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 ps-1.5 pe-2.5 py-1">
                              <ShieldCheck size={11} className="text-gold shrink-0" />
                              <span className="text-[10px] font-medium text-white/85">من المستشار الذكي ALLaM</span>
                            </div>
                          </motion.div>
                        </div>
                      </>
                    )}
                  </AnimatePresence>
                </span>
              )}
            </div>
            <p className="text-xs text-ink-soft leading-relaxed mt-1.5">{step.detail}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function EffortBadge({ level }: { level: string }) {
  const tone =
    level === "سهل"
      ? "bg-positive-bg text-positive"
      : level === "عالٍ"
        ? "bg-negative-bg text-negative"
        : "bg-copper-tint text-copper-dark";
  return (
    <span className={cn("inline-flex items-center rounded-full text-[10px] font-bold px-2 py-0.5 shrink-0", tone)}>
      {level}
    </span>
  );
}

function StepDetail({
  icon: Icon,
  label,
  text,
  tone,
}: {
  icon: typeof Route;
  label: string;
  text: string;
  tone?: "gold" | "warn";
}) {
  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1.5 text-[11px] font-bold mb-1",
          tone === "gold" ? "text-copper" : tone === "warn" ? "text-negative" : "text-ink-soft"
        )}
      >
        <Icon size={13} /> {label}
      </div>
      <p className="text-xs text-ink-soft leading-relaxed whitespace-pre-line">{text}</p>
    </div>
  );
}

/* ── Rich collapsible step accordion (the "Execution Plan" — action mode): financial impact /
   effort / checklist / execution / delay cost, with a completion toggle wired to the roadmap store. ── */
function StepAccordion({
  steps,
  done,
  onToggle,
}: {
  steps: RoadmapStep[];
  done?: Set<number>;
  onToggle?: (stepNumber: number) => void;
}) {
  const [open, setOpen] = useState<number | null>(0); // first step expanded by default
  // Part 9 — purely cosmetic micro-feedback: briefly pulse the step just marked done. No time
  // simulation, just a momentary visual confirmation that clears itself.
  const [pulseStep, setPulseStep] = useState<number | null>(null);
  const checkable = !!onToggle;
  const handleToggle = (stepNumber: number, wasDone: boolean) => {
    onToggle?.(stepNumber);
    if (!wasDone) {
      setPulseStep(stepNumber);
      window.setTimeout(() => setPulseStep((p) => (p === stepNumber ? null : p)), 800);
    }
  };
  return (
    <div className="space-y-2.5">
      {steps.map((step, i) => {
        const isOpen = open === i;
        const isDone = done?.has(step.step_number) ?? false;
        return (
          <div key={step.step_number} className="rounded-2xl border border-line bg-card overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              {/* Plain step-number/done indicator — display only, not a control (Part: step-completion
                  clarity fix). The actual completion action is the explicit labeled button below. */}
              <span
                className={cn(
                  "relative w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0",
                  isDone ? "bg-positive text-white" : "bg-espresso text-gold"
                )}
              >
                {isDone ? <Check size={14} /> : step.step_number}
                <AnimatePresence>
                  {pulseStep === step.step_number && (
                    <motion.span
                      initial={{ scale: 0.6, opacity: 0.8 }}
                      animate={{ scale: 2.4, opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.75, ease: "easeOut" }}
                      className="absolute inset-0 rounded-full bg-positive pointer-events-none"
                    />
                  )}
                </AnimatePresence>
              </span>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex-1 min-w-0 flex items-center gap-3 text-start"
              >
                <span
                  className={cn(
                    "flex-1 min-w-0 text-sm font-semibold text-ink",
                    isDone && "line-through text-ink-soft"
                  )}
                >
                  {step.title}
                </span>
                {step.effort && <EffortBadge level={step.effort} />}
                <ChevronDown
                  size={16}
                  className={cn("text-ink-soft transition-transform shrink-0", isOpen && "rotate-180")}
                />
              </button>
              <AskAdvisorButton tone="dark" draft={`اشرح لي خطوة "${step.title}" وكيف أنفّذها بالضبط؟`} />
            </div>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-3 space-y-3 border-t border-line">
                    <div className="flex flex-wrap gap-2">
                      {step.impactSar != null && step.impactSar > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-positive-bg text-positive text-xs font-bold px-2.5 py-1.5">
                          <TrendingUp size={13} /> الأثر المالي: {formatSAR(step.impactSar)}/شهر
                        </span>
                      )}
                      {step.execution && (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-copper-tint text-copper-dark text-xs font-semibold px-2.5 py-1.5">
                          <Zap size={13} /> {step.execution}
                        </span>
                      )}
                    </div>
                    {step.how_to && <StepDetail icon={Route} label="طريقة التنفيذ" text={step.how_to} />}
                    {step.checklist && step.checklist.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-ink-soft mb-1.5">
                          <ListChecks size={13} /> قائمة التحقق
                        </div>
                        <ul className="space-y-1">
                          {step.checklist.map((c, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-xs text-ink leading-relaxed">
                              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-copper shrink-0" />
                              <span>{c}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {step.reason && <StepDetail icon={Sparkles} label="لماذا تساعدك" text={step.reason} tone="gold" />}
                    {step.costOfDelay && (
                      <StepDetail icon={Clock} label="تكلفة التأخير" text={step.costOfDelay} tone="warn" />
                    )}
                    {/* Explicit, clearly-labeled completion action — replaces the old unclear
                        number/icon-only toggle as the actual control for marking a step done. */}
                    {checkable && (
                      <button
                        type="button"
                        onClick={() => handleToggle(step.step_number, isDone)}
                        className={cn(
                          "w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors",
                          isDone
                            ? "bg-positive-bg text-positive border border-positive/30 hover:bg-positive-bg/70"
                            : "bg-espresso text-gold hover:bg-espresso/90"
                        )}
                      >
                        {isDone ? (
                          <>
                            <RotateCcw size={15} /> تراجع عن الإتمام
                          </>
                        ) : (
                          <>
                            <Check size={15} /> أتممت هذه الخطوة
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

export function Eligibility() {
  const [detailsPath, setDetailsPath] = useState<EligibilityPath | null>(null);
  const [confirmPath, setConfirmPath] = useState<EligibilityPath | null>(null);
  const [activePath, setActivePath] = useState<EligibilityPath | null>(null);
  // Completed roadmap step_numbers — restored from the persisted store, written through on toggle.
  const [doneSteps, setDoneSteps] = useState<Set<number>>(new Set());
  const [requestCta, setRequestCta] = useState(false);
  // Part 9 — full-plan completion celebration. Fires once per activation (tracked by plan id, not
  // re-shown on every render while all steps stay done); a pure visual state, no new computation —
  // reuses the plan's already-computed targetDbr/targetAmount/targetEligibility.
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const celebratedPathId = useRef<number | null>(null);
  // Only pop the celebration modal for a completion that happens THIS session (a real toggle click),
  // never on a restore from persisted state (account switch / page reload) — otherwise it would fire
  // every time an already-completed plan is loaded. The achieved-state banner below (allStepsDone)
  // is NOT gated by this ref, so it always reflects reality regardless of how completion was reached.
  const justCompletedRef = useRef(false);
  // What-If "Liability Manager": a list of USER-ADDED monthly items. Recalc runs only on add/remove
  // (discrete events), never on keystroke. Part 16 — SAMA only counts actual credit/debt obligations
  // toward DBR (loan/auto-finance/card-min/other-financing installments); rent, utilities, internet,
  // subscriptions etc. are personal expenses and must NEVER feed the ratio recompute. Only "credit"
  // items are summed into extra_liability; "expense" items are stored/shown separately and are purely
  // behavioral/informational.
  const [liabilities, setLiabilities] = useState<
    { id: number; name: string; amount: number; category: "credit" | "expense" }[]
  >([]);
  const [liabName, setLiabName] = useState("");
  const [liabAmount, setLiabAmount] = useState("");
  const [liabCategory, setLiabCategory] = useState<"credit" | "expense">("credit");
  const creditLiabilities = liabilities.filter((l) => l.category === "credit");
  const expenseLiabilities = liabilities.filter((l) => l.category === "expense");
  // Only credit obligations feed the SAMA recompute -- personal expenses never do.
  const totalExtra = creditLiabilities.reduce((sum, l) => sum + l.amount, 0);
  // Part 5 — a THIS-PAGE-ONLY demo override of the real requested amount (never persisted; reset
  // on account switch below). null = use the real on-record amount.
  const [amountOverride, setAmountOverride] = useState<number | null>(null);
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const account = useSelectedAccount("individuals");
  useEffect(() => {
    setAmountOverride(null);
    setEditingAmount(false);
  }, [account]);
  const { state, retry } = useApi(
    () => api.getEligibility(totalExtra, amountOverride ?? 0),
    [account, totalExtra, amountOverride]
  );

  const addLiability = () => {
    const amount = Math.max(0, Number(liabAmount) || 0);
    if (amount <= 0) return;
    setLiabilities((prev) => [
      ...prev,
      {
        id: Date.now(),
        name: liabName.trim() || (liabCategory === "credit" ? "التزام ائتماني" : "مصروف شخصي"),
        amount,
        category: liabCategory,
      },
    ]);
    setLiabName("");
    setLiabAmount("");
  };
  const removeLiability = (id: number) => setLiabilities((prev) => prev.filter((l) => l.id !== id));
  // The narration is fetched SEPARATELY so the numbers render instantly. The demo persona's is
  // pre-baked (~0.3s); any other browsed account needs a live ALLaM call (~30-60s), which must
  // never block this screen.
  const { state: advisorState } = useApi(api.getAdvisorNarration, [account]);
  // Part 3: the persisted roadmap for this account (which plan is active + which steps are done).
  const { state: roadmapState } = useApi(api.getIndividualsRoadmap, [account]);

  // A switch of account forgets the previous plan until the store is re-read for the new one.
  const restoredForAccount = useRef<string | null>(null);
  useEffect(() => {
    restoredForAccount.current = null;
    setActivePath(null);
    setDoneSteps(new Set());
    setLiabilities([]);
    setLiabName("");
    setLiabAmount("");
    celebratedPathId.current = null;
    justCompletedRef.current = false;
    setShowCompletionModal(false);
  }, [account]);

  // Restore the activated plan + completion once BOTH the paths and the stored progress arrive.
  useEffect(() => {
    if (state.status !== "ready" || roadmapState.status !== "ready") return;
    if (restoredForAccount.current === account) return;
    restoredForAccount.current = account;
    const progress = roadmapState.data.progress;
    if (!progress) return;
    const match = state.data.paths.find((p) => p.id === progress.plan.id);
    if (match) {
      setActivePath(match);
      setDoneSteps(new Set(progress.completedSteps));
    }
  }, [state, roadmapState, account]);

  const activate = (path: EligibilityPath) => {
    setActivePath(path);
    setDoneSteps(new Set());
    setConfirmPath(null);
    setDetailsPath(null);
    celebratedPathId.current = null;
    justCompletedRef.current = false;
    setShowCompletionModal(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    // Persist the activation (snapshot frozen server-side). UI stays responsive if it fails.
    void api.activateIndividualsRoadmap(path.id).catch(() => {});
  };

  const toggleStep = (stepNumber: number) => {
    const done = !doneSteps.has(stepNumber);
    setDoneSteps((prev) => {
      const next = new Set(prev);
      done ? next.add(stepNumber) : next.delete(stepNumber);
      const total = activePath?.roadmap?.length ?? activePath?.timeline.length ?? 0;
      if (done && total > 0 && next.size === total) justCompletedRef.current = true;
      return next;
    });
    void api.setIndividualsRoadmapStep(stepNumber, done).catch(() => {});
  };

  const deactivate = () => {
    setActivePath(null);
    setDoneSteps(new Set());
    celebratedPathId.current = null;
    justCompletedRef.current = false;
    setShowCompletionModal(false);
    void api.clearIndividualsRoadmap().catch(() => {});
  };

  // Part 9 — detect full-plan completion and celebrate ONCE per activation (tracked by plan id via
  // the ref, so toggling a step back off then on again doesn't re-trigger the modal).
  useEffect(() => {
    if (!activePath) return;
    const total = activePath.roadmap?.length ?? activePath.timeline.length;
    if (
      total > 0 &&
      doneSteps.size === total &&
      justCompletedRef.current &&
      celebratedPathId.current !== activePath.id
    ) {
      celebratedPathId.current = activePath.id;
      justCompletedRef.current = false;
      setShowCompletionModal(true);
    }
  }, [activePath, doneSteps]);

  if (state.status === "loading")
    return (
      <div className="px-5 md:px-8 py-10 max-w-6xl mx-auto" dir="rtl">
        <SectionLoading height={320} />
      </div>
    );
  if (state.status === "error")
    return (
      <div className="px-5 md:px-8 py-10 max-w-6xl mx-auto" dir="rtl">
        <SectionError onRetry={retry} message={state.error} />
      </div>
    );

  const { scores, metrics, currentDbr, currentAvailable, paths, eligible } = state.data;
  // The 3 parallel SAMA tests (T1 salary DBR, T2 non-mortgage/45% — mathematically dominated by
  // T1, see its card note — T3 total incl. mortgage). Rendered as 3 independent cards below.
  const testResults = state.data.testResults ?? [];
  // Real SAMA salary cap as a % (33.33 employee / 25 retiree) — never hardcoded.
  const salaryCapPct =
    state.data.grossSalary && state.data.salaryCapSar
      ? Math.round((state.data.salaryCapSar / state.data.grossSalary) * 10000) / 100
      : 33.33;
  // Real SAR/month the persona must shed (max binding-test overage) — drives the impact hint.
  const shedTarget = Math.max(
    0,
    ...testResults
      .filter((t) => t.binding && !t.passed)
      .map((t) => t.overageSar)
  );
  // Non-requester (no financing application on record): show a forward estimate + "قدم طلبك" CTA.
  const hasRequest = state.data.hasActiveRequest ?? true;
  const indicativeRate = state.data.indicativeRate;
  // The paths are "increase your ceiling" projections whenever the customer is already within
  // bounds (an eligible requester, or any non-requester); otherwise they fix ineligibility.
  const pathsAreIncrease = eligible || !hasRequest;
  // Jargon Translator tooltips — built from the real SAR figures the payload now carries.
  const { grossSalary, salaryCapSar, totalCapSar, salaryObligationsSar, totalObligationsSar } =
    state.data;
  const salaryTip =
    grossSalary != null && salaryCapSar != null && salaryObligationsSar != null
      ? `نسبة الاستقطاع (DBR) تعني أن راتبك ${formatNumber(grossSalary)} ريال، وقواعد ساما تمنع أقساطك (بدون العقار) من تجاوز ${formatNumber(salaryCapSar)} ريال شهرياً. أنت تسدد حالياً ${formatNumber(salaryObligationsSar)} ريال.`
      : null;
  const totalTip =
    grossSalary != null && totalCapSar != null && totalObligationsSar != null
      ? `إجمالي التزاماتك (شاملاً العقار) يجب ألا يتجاوز ${formatNumber(totalCapSar)} ريال من راتبك ${formatNumber(grossSalary)}. أنت تسدد حالياً ${formatNumber(totalObligationsSar)} ريال.`
      : null;
  // Prefer whatever the eligibility payload already carried (pre-baked); otherwise use the
  // lazily-fetched one. `advisorPending` drives the "generating…" state for browsed accounts.
  const advisorNarration =
    state.data.advisorNarration ??
    (advisorState.status === "ready" ? advisorState.data.narration : null);
  const advisorPending = !advisorNarration && advisorState.status === "loading";
  const topAmount = paths.reduce((max, p) => Math.max(max, p.targetAmount ?? 0), currentAvailable);
  // Real roadmap length drives the progress "step 0 of N" (was hardcoded to the 1-item timeline).
  const activeStepCount = activePath ? activePath.roadmap?.length ?? activePath.timeline.length : 0;
  // Persisted completion drives the progress strip (was a hardcoded 0 / empty bar).
  const doneCount = doneSteps.size;
  const activePct = activeStepCount ? Math.round((doneCount / activeStepCount) * 100) : 0;
  const allStepsDone = activeStepCount > 0 && doneCount === activeStepCount;

  return (
    <div className="px-5 md:px-8 py-6 md:py-8 max-w-6xl mx-auto space-y-6" dir="rtl">
      {/* Heading */}
      <PageHeader
        eyebrow="مسارك نحو أهلية أفضل"
        title="الأهلية والمسارات الذكية"
        subtitle={
          activePath
            ? "مسارك مفعّل — تابع خطواتك الشهرية للوصول إلى هدفك."
            : "ثلاثة مسارات واقعية من أرقامك أنت — اختر ما يناسب حياتك"
        }
        end={
          <AnimatePresence>
            {activePath && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={deactivate}
                className="shrink-0 flex items-center gap-2 text-sm font-medium text-ink-soft hover:text-copper border border-line hover:border-copper/40 bg-card rounded-full px-4 py-2 transition-colors shadow-[var(--shadow-sm)]"
              >
                <RotateCcw size={15} />
                تغيير المسار
              </motion.button>
            )}
          </AnimatePresence>
        }
      />

      {/* Part 5 — the real requested amount, always shown as-is, plus an on-this-page-only demo
          override. Only meaningful for requesters (non-requesters have no application on record). */}
      {hasRequest && state.data.requestedAmount != null && (
        <Card reveal={false} className="p-4 md:p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-copper-tint text-copper flex items-center justify-center shrink-0">
              <Wallet size={16} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-ink-soft">المبلغ الذي طلبته سابقاً</span>
                <AskAdvisorButton
                  tone="dark"
                  draft={`أخبرني أكثر عن مبلغ التمويل الذي طلبته سابقاً (${formatSAR(state.data.requestedAmount)}) وأثره على أهليتي.`}
                />
              </div>
              <div className="text-base font-bold text-ink tnum">{formatSAR(state.data.requestedAmount)}</div>
            </div>
          </div>
          {!editingAmount ? (
            <button
              onClick={() => {
                setAmountInput(String(amountOverride ?? state.data.requestedAmount));
                setEditingAmount(true);
              }}
              className="text-xs font-semibold text-copper hover:text-copper-dark flex items-center gap-1.5"
            >
              <Edit3 size={14} /> تعديل لأغراض العرض
            </button>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="number"
                min={1}
                step={1000}
                inputMode="numeric"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                autoFocus
                className="w-36 rounded-xl border border-line bg-card px-3 py-1.5 text-sm text-ink tnum focus:outline-none focus:border-copper/60"
              />
              <Button
                size="sm"
                onClick={() => {
                  const v = Math.round(Number(amountInput));
                  setAmountOverride(v > 0 ? v : null);
                  setEditingAmount(false);
                }}
              >
                تطبيق
              </Button>
              <button
                onClick={() => setEditingAmount(false)}
                className="text-xs text-ink-soft hover:text-ink px-2"
              >
                إلغاء
              </button>
              {amountOverride != null && (
                <button
                  onClick={() => {
                    setAmountOverride(null);
                    setEditingAmount(false);
                  }}
                  className="text-xs text-negative hover:text-negative/80 px-2"
                >
                  إعادة الأصلي
                </button>
              )}
            </div>
          )}
        </Card>
      )}
      {state.data.requestedAmountOverridden && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-gold/15 border border-gold/40 px-4 py-3 text-xs text-copper-dark leading-relaxed">
          <FlaskConical size={15} className="shrink-0 mt-0.5" />
          <span>
            هذا تعديل لأغراض العرض/المحاكاة فقط على هذه الصفحة — لا يغيّر طلبك أو بياناتك الفعلية
            المخزّنة (تبقى {formatSAR(state.data.requestedAmount ?? 0)}). كل الأرقام والمسارات أدناه
            محسوبة على المبلغ المعدَّل بشكل مؤقت.
          </span>
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* ══════════════ CHOICE STATE ══════════════ */}
        {!activePath ? (
          <motion.div
            key="choice"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="space-y-6"
          >
            {hasRequest && (
              <h2 className="text-ink font-bold text-lg md:text-xl">تحليل أهليتك عند طلب هذا التمويل:</h2>
            )}

            {/* Overview — dark hero stage. No overflow-hidden on the Card itself, so the description
                text is never clipped and the card grows to fit it; the decorative glows are clipped
                by an inner layer instead. */}
            <Card className="relative bg-espresso border-espresso p-6 md:p-8 flex flex-col md:flex-row items-center gap-8">
              <div className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden">
                <div className="absolute -top-20 -start-16 w-72 h-72 rounded-full bg-copper/25 blur-3xl" />
                <div className="absolute -bottom-24 -end-16 w-72 h-72 rounded-full bg-gold/12 blur-3xl" />
              </div>
              <div className="relative shrink-0">
                <EligibilityRing percentage={scores.personal} size={200} showTier onDark />
              </div>
              <div className="relative flex-1 w-full min-w-0">
                <h3 className="text-xl md:text-2xl font-bold text-white mb-2">
                  {!hasRequest
                    ? "تقدير أهليتك التمويلية"
                    : eligible
                    ? "أهليتك الحالية: جيدة"
                    : "أهليتك الحالية: تحتاج إلى تحسين"}
                </h3>
                <p className="text-white/65 text-sm leading-relaxed mb-6 whitespace-normal break-words">
                  {!hasRequest ? (
                    <>
                      لم تتقدم بطلب تمويل بعد. وفق التزاماتك الحالية وقواعد ساما، أقصى مبلغ يمكنك
                      طلبه لو تقدمت هو{" "}
                      <span className="font-bold text-gold tnum">{formatSAR(currentAvailable)}</span>
                      {indicativeRate != null ? <> (تقدير عند معدل فائدة {indicativeRate}٪)</> : null}.
                      استعرض مسارات رفع سقفك التالية، أو ابدأ طلبك الآن.
                    </>
                  ) : eligible ? (
                    <>
                      أنت مؤهل حالياً للحصول على{" "}
                      <span className="font-bold text-gold tnum">{formatSAR(currentAvailable)}</span>.
                      استعرض مسارات رفع سقف تمويلك التالية.
                    </>
                  ) : (
                    <>
                      عند احتساب التمويل الذي طلبته، أصبحت نسبة عبء الدين (DBR) الخاصة بك{" "}
                      <span className="font-bold text-gold tnum">{currentDbr}٪</span>، وهي تتجاوز الحد
                      النظامي (<span className="tnum">{salaryCapPct}٪</span>). استعرض مسارات تقليل عبء
                      الدين التالية لرفع سقف تمويلك إلى{" "}
                      <span className="font-bold text-gold tnum">{formatSAR(topAmount)}</span>.
                    </>
                  )}
                </p>
                {!hasRequest && (
                  <div className="mb-6">
                    <Button
                      className="bg-gold text-espresso hover:bg-[#E7CBA0] shadow-none font-semibold"
                      onClick={() => setRequestCta(true)}
                    >
                      <Sparkles size={15} /> قدّم طلبك بمبلغ حتى {formatSAR(currentAvailable)}
                    </Button>
                    {requestCta && (
                      <p className="text-white/55 text-xs mt-2">
                        سنوجّهك لإكمال طلبك لدى البنك المختار (هذه الخطوة قيد الربط).
                      </p>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3">
                  {metrics.map((m, i) => (
                    <div
                      key={m.label}
                      className="bg-white/6 border border-white/10 rounded-2xl p-3.5 text-center"
                    >
                      <div className={cn("text-lg font-bold tnum", toneStyle[m.tone])}>{m.value}</div>
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <span className="text-xs text-white/55 leading-relaxed">{m.label}</span>
                        {i === 0 && salaryTip && <MetricInfo text={salaryTip} />}
                        {i === 1 && totalTip && <MetricInfo text={totalTip} />}
                        {i === 2 && <MetricInfo text={state.data.availableExplanation ?? AVAILABLE_TIP} />}
                        {i === 3 && (
                          <MetricInfo
                            text={
                              hasRequest
                                ? RATE_TIP
                                : "معدل فائدة تقديري متحفّظ (الشريحة الأعلى من معدلات المتقدمين) نستخدمه فقط لتقدير سقفك — وليس معدلاً فعلياً على طلب، إذ لا يوجد طلب بعد."
                            }
                          />
                        )}
                        {(i === 2 || i === 3) && (
                          <AskAdvisorButton draft={`اشرح لي رقم "${m.label}" (${m.value}) وكيف يؤثر على أهليتي.`} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Part 6 — persistent, honest rate-market note (real dataset range, not a live feed). */}
                {state.data.rateRangeLowPct != null && state.data.rateRangeHighPct != null && (
                  <p className="text-[11px] text-white/45 leading-relaxed mt-3">
                    النطاق السائد لمعدلات الفائدة تقريباً {state.data.rateRangeLowPct}٪–{state.data.rateRangeHighPct}٪
                    تقديري حسب البنوك المختلفة. {state.data.rateMarketNote}
                  </p>
                )}
              </div>
            </Card>

            {/* The 3 SAMA gates, independent — see Part 0 investigation: T1/T3 are the two tests
                that can genuinely reject on their own; T2's card explains honestly why it cannot. */}
            <SamaGatesSection testResults={testResults} installmentSar={state.data.newLoanInstallmentSar} />

            {/* Layer 3 — ALLaM advisor narration of the counterfactual */}
            {(advisorNarration || advisorPending) && (
              <Card reveal={false} className="relative overflow-hidden p-5 md:p-6">
                <div className="pointer-events-none absolute -top-10 -end-8 w-40 h-40 rounded-full bg-gold/10 blur-3xl" />
                <div className="relative flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-espresso flex items-center justify-center shrink-0">
                    <Sparkles size={16} className="text-gold" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm font-bold text-ink">قراءة المستشار الذكي</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 text-copper text-[10px] font-semibold px-2 py-0.5">
                        <ShieldCheck size={10} /> ALLaM
                      </span>
                    </div>
                    <p className="text-sm text-ink-soft leading-relaxed whitespace-pre-line">
                      {advisorNarration ?? "جارٍ توليد شرح المستشار لهذا العميل…"}
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* FinTech "Liability Manager" (What-If) — add manual monthly items; recompute on add/remove.
                Part 16: only CREDIT obligations feed the SAMA ratio recompute; personal expenses are
                behavioral/informational only and never touch DBR. */}
            <Card reveal={false} className="p-5 md:p-6">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-copper-tint text-copper flex items-center justify-center shrink-0">
                  <Target size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-ink mb-1">مدير الالتزامات والمصاريف (محاكاة)</div>
                  <p className="text-xs text-ink-soft leading-relaxed mb-3">
                    أضف التزامات ائتمانية أو مصاريف شخصية يدوياً لتجربة أثرها — يُعاد الحساب عند الإضافة أو الحذف.
                  </p>
                  {/* Part 6/16 — persistent, accurate Open Banking (AIS) limitation disclaimer, now
                      explaining the credit-obligation vs personal-expense distinction. */}
                  <p className="text-[11px] text-ink-soft leading-relaxed bg-cream-deep/60 border border-line rounded-xl px-3 py-2.5 mb-4">
                    الخدمات المصرفية المفتوحة (Open Banking / AIS) تكشف فقط حسابات العميل لدى البنك
                    المرتبط حالياً، ولا يمكنها جلب قروض أو التزامات ائتمانية من بنوك أخرى أو طلبات
                    تمويل مقدَّمة في جهات أخرى. <span className="font-semibold">الالتزامات الائتمانية</span> التي
                    تضيفها هنا تُدخل فعلياً في إعادة حساب نسبتك والمسارات المعروضة أدناه لأغراض هذه
                    المحاكاة، وهي بيانات صرّح بها المستخدم وليست مُتحقَّقة عبر المصرفية المفتوحة، ولا
                    تغيّر ملفك أو سجلك الفعلي المخزَّن. <span className="font-semibold">المصاريف الشخصية</span> التي
                    تضيفها لا تدخل في حساب نسبة عبء الدين (DBR) أو أهليتك إطلاقاً — تُستخدم فقط لتحليل
                    سلوكك المالي.
                  </p>
                  <div className="mb-3">
                    <label className="block text-[11px] text-ink-soft mb-1.5">نوع البند</label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setLiabCategory("credit")}
                        className={cn(
                          "flex-1 min-w-[220px] text-start rounded-xl border px-3 py-2 text-xs transition-colors",
                          liabCategory === "credit"
                            ? "bg-copper text-white border-copper"
                            : "bg-card text-ink-soft border-line hover:border-copper/40"
                        )}
                      >
                        <span className="block font-semibold">التزام ائتماني (يؤثر على نسبتك)</span>
                        <span className={cn("block mt-0.5", liabCategory === "credit" ? "text-white/75" : "text-ink-soft")}>
                          قسط سيارة، بطاقة ائتمان، تمويل شخصي آخر، تمويل عقاري
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setLiabCategory("expense")}
                        className={cn(
                          "flex-1 min-w-[220px] text-start rounded-xl border px-3 py-2 text-xs transition-colors",
                          liabCategory === "expense"
                            ? "bg-copper text-white border-copper"
                            : "bg-card text-ink-soft border-line hover:border-copper/40"
                        )}
                      >
                        <span className="block font-semibold">مصروف شخصي (لتحليل سلوكك فقط، لا يؤثر على النسبة)</span>
                        <span className={cn("block mt-0.5", liabCategory === "expense" ? "text-white/75" : "text-ink-soft")}>
                          إيجار، فواتير، إنترنت واشتراكات، مصاريف أخرى
                        </span>
                      </button>
                    </div>
                  </div>
                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="flex-1 min-w-[140px]">
                      <label className="block text-[11px] text-ink-soft mb-1">الاسم</label>
                      <input
                        type="text"
                        value={liabName}
                        onChange={(e) => setLiabName(e.target.value)}
                        placeholder={liabCategory === "credit" ? "مثال: قرض الراجحي" : "مثال: إيجار الشقة"}
                        className="w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink focus:outline-none focus:border-copper/60"
                      />
                    </div>
                    <div className="w-32">
                      <label className="block text-[11px] text-ink-soft mb-1">المبلغ الشهري</label>
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          step={100}
                          inputMode="numeric"
                          value={liabAmount}
                          onChange={(e) => setLiabAmount(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && addLiability()}
                          placeholder="0"
                          className="w-full rounded-xl border border-line bg-card ps-3 pe-9 py-2 text-sm font-semibold text-ink tnum focus:outline-none focus:border-copper/60"
                        />
                        <span className="absolute inset-y-0 end-2 flex items-center text-[10px] text-ink-soft">ر.س</span>
                      </div>
                    </div>
                    <Button size="md" onClick={addLiability} className="shrink-0">
                      <Plus size={15} /> إضافة {liabCategory === "credit" ? "التزام" : "مصروف"}
                    </Button>
                  </div>

                  {creditLiabilities.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="text-[11px] font-bold text-ink-soft">التزاماتك الائتمانية المضافة (تؤثر على نسبتك)</div>
                      {creditLiabilities.map((l) => (
                        <div
                          key={l.id}
                          className="flex items-center justify-between rounded-xl border border-line bg-cream-deep/50 px-3 py-2"
                        >
                          <span className="text-sm text-ink truncate min-w-0">{l.name}</span>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-sm font-bold text-ink tnum">{formatSAR(l.amount)}</span>
                            <button
                              onClick={() => removeLiability(l.id)}
                              aria-label="حذف الالتزام"
                              className="w-6 h-6 rounded-lg bg-negative-bg text-negative flex items-center justify-center hover:opacity-80 transition-opacity"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between px-3 pt-1">
                        <span className="text-xs text-ink-soft">إجمالي الالتزامات الائتمانية المضافة</span>
                        <span className="text-sm font-bold text-copper tnum">{formatSAR(totalExtra)}</span>
                      </div>
                      <p className="text-[11px] text-ink-soft leading-relaxed">
                        ⓘ هذه التزامات <span className="font-semibold">أضفتها يدوياً</span> للمحاكاة فقط (وليست من حسابك
                        عبر المصرفية المفتوحة)، وتدخل في حساب نسبتك أدناه.
                      </p>
                    </div>
                  )}

                  {expenseLiabilities.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="text-[11px] font-bold text-ink-soft">مصاريفك الشخصية المضافة (لا تؤثر على نسبتك)</div>
                      {expenseLiabilities.map((l) => (
                        <div
                          key={l.id}
                          className="flex items-center justify-between rounded-xl border border-line bg-cream-deep/30 px-3 py-2"
                        >
                          <span className="text-sm text-ink truncate min-w-0">{l.name}</span>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-sm font-bold text-ink-soft tnum">{formatSAR(l.amount)}</span>
                            <button
                              onClick={() => removeLiability(l.id)}
                              aria-label="حذف المصروف"
                              className="w-6 h-6 rounded-lg bg-negative-bg text-negative flex items-center justify-center hover:opacity-80 transition-opacity"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                      <p className="text-[11px] text-ink-soft leading-relaxed">
                        ⓘ هذه مصاريف <span className="font-semibold">لتحليل سلوكك المالي فقط</span> — لا تدخل في حساب
                        نسبة عبء الدين (DBR) ولا في أي من مسارات الأهلية.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* Paths */}
            <div>
              <motion.h3
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={inView}
                className="font-bold text-ink text-lg mb-1"
              >
                {pathsAreIncrease ? "مسارات زيادة سقف التمويل" : "مسارات تحسين الأهلية وزيادة التمويل"}
              </motion.h3>
              <p className="text-ink-soft text-sm mb-3">
                {pathsAreIncrease
                  ? "كل مسار يخفّض التزاماتك ويرفع أقصى مبلغ يمكنك طلبه — استعرض التفاصيل ثم فعّل الأنسب لك."
                  : "كل مسار يخفض نسبة عبء الدين (DBR) ويرفع سقف تمويلك — استعرض التفاصيل ثم فعّل الأنسب لك."}
              </p>
              {state.data.disclaimer && (
                <p className="text-[11px] text-ink-soft bg-cream-deep/60 border border-line rounded-xl px-3 py-2 mb-5 leading-relaxed">
                  ⓘ {state.data.disclaimer}
                </p>
              )}

              {/* Part 11 — makes the override's effect visible even when a path's headline target
                  amount happens to land on the same real ceiling regardless of starting amount. */}
              {state.data.requestedAmountOverridden && (
                <div className="flex items-center gap-2.5 rounded-xl bg-gold/15 border border-gold/40 px-4 py-2.5 mb-5">
                  <FlaskConical size={15} className="text-copper shrink-0" />
                  <span className="text-xs text-copper-dark leading-relaxed">
                    المسارات أدناه <span className="font-semibold">محدَّثة بحسب المبلغ الافتراضي</span> الذي
                    أدخلته — نسبتك الآن أصبحت <span className="font-semibold tnum">{currentDbr}٪</span>.
                  </span>
                </div>
              )}

              {paths.length === 0 && (
                <p className="text-ink-soft text-sm bg-cream-deep rounded-2xl p-5">
                  لا توجد مسارات إضافية مقترحة حالياً — وضعك ضمن حدود ساما، ويمكنك التقدم بطلبك متى شئت.
                </p>
              )}

              <Stagger className="grid md:grid-cols-3 gap-5" stagger={0.1}>
                {paths.map((path, idx) => (
                  <StaggerItem key={path.id}>
                    <motion.div
                      whileHover={{ y: -4 }}
                      transition={{ duration: 0.25 }}
                      className={cn(
                        "relative h-full flex flex-col bg-card rounded-3xl p-6 border-2 transition-colors duration-300",
                        idx === 0
                          ? "border-copper/50 shadow-[var(--shadow-lg)]"
                          : "border-line hover:border-copper/40 shadow-[var(--shadow-sm)]"
                      )}
                    >
                      {idx === 0 && (
                        <span className="absolute -top-3.5 start-6 z-10 inline-flex items-center gap-1.5 bg-gold text-espresso text-xs font-bold px-3.5 py-1.5 rounded-full shadow-[var(--shadow-md)]">
                          <Sparkles size={12} /> يوصي به المستشار
                        </span>
                      )}
                      {state.data.requestedAmountOverridden && (
                        <span
                          className={cn(
                            "absolute -top-3.5 z-10 inline-flex items-center gap-1.5 bg-copper text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-[var(--shadow-md)]",
                            idx === 0 ? "end-6" : "start-6"
                          )}
                        >
                          <FlaskConical size={11} /> محدَّث بحسب المبلغ الافتراضي
                        </span>
                      )}
                      {/* Header */}
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 rounded-2xl bg-espresso text-gold font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-bold text-ink leading-snug">{path.title}</h4>
                            <AskAdvisorButton tone="dark" draft={`اشرح لي مسار "${path.title}" وهل يناسب وضعي؟`} />
                          </div>
                          <p className="text-xs text-ink-soft mt-1 leading-relaxed">{path.summary}</p>
                        </div>
                      </div>
                      {path.combinationBenefit && (
                        <span className="mb-3 -mt-1 inline-flex items-center gap-1.5 self-start rounded-full bg-copper-tint text-copper-dark text-[11px] font-semibold px-2.5 py-1">
                          <Sparkles size={11} /> منفعة الدمج — يجمع أكثر من إجراء
                        </span>
                      )}

                      {/* Badges — non-actionable info lives OUTSIDE the stepper */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        <span
                          className={cn(
                            "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                            path.kind === "conditional"
                              ? "bg-gold/15 text-copper-dark"
                              : "bg-positive-bg text-positive"
                          )}
                        >
                          {path.kind === "conditional" ? "مسار إرشادي" : "أرقام محسوبة"}
                        </span>
                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", difficultyStyle[path.difficulty])}>
                          {path.difficulty}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-cream-deep text-ink-soft inline-flex items-center gap-1">
                          <Clock size={11} /> {path.duration}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-cream-deep text-ink-soft">
                          {path.cashRequired ? "يتطلب سيولة" : "بلا نقد"}
                        </span>
                      </div>

                      {/* Outcome — the "what changes", as a badge (not a stepper step) */}
                      {path.outcome && (
                        <div className="mb-4 rounded-xl bg-positive-bg/50 border border-positive/20 px-3.5 py-2 flex items-center gap-1.5">
                          <TrendingUp size={13} className="text-positive shrink-0" />
                          <span className="text-[11px] text-ink leading-relaxed">{path.outcome}</span>
                        </div>
                      )}

                      {/* Steps as a connected path */}
                      <div className="relative ps-1 mb-5">
                        {path.steps.map((step, i) => (
                          <div key={i} className="relative flex gap-3 pb-4 last:pb-0">
                            {i < path.steps.length - 1 && (
                              <span className="absolute top-6 start-[11px] w-px h-[calc(100%-12px)] bg-line" />
                            )}
                            <span className="relative z-10 w-6 h-6 rounded-full bg-copper-tint text-copper text-xs font-bold flex items-center justify-center shrink-0">
                              {i + 1}
                            </span>
                            <span className="text-xs text-ink-soft leading-relaxed pt-0.5">{step}</span>
                          </div>
                        ))}
                      </div>

                      {/* Coffee Index — behavioral nudge (shown only when it realistically applies) */}
                      {path.nudge && (
                        <div className="mb-4 rounded-xl bg-gold/10 border border-gold/25 px-3.5 py-2.5">
                          <p className="text-[11px] text-ink leading-relaxed">{path.nudge}</p>
                        </div>
                      )}

                      {/* Bottom group — pinned to the card base so all cards align */}
                      <div className="mt-auto">
                        {/* Computed strategies: the real resulting ceiling. Conditional ones show no
                            fabricated number — only their honest "ينطبق إذا…" gate. */}
                        {path.kind === "computed" && path.targetAmount != null && (
                          <div className="mb-3 rounded-xl bg-copper-tint/70 border border-copper/15 px-3.5 py-2.5 flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-xs text-ink-soft">
                              <Wallet size={14} className="text-copper" /> سقف التمويل بعد التنفيذ
                            </span>
                            <span className="text-sm font-bold text-copper tnum">{formatSAR(path.targetAmount)}</span>
                          </div>
                        )}
                        {path.ceilingSummary && (
                          <p className="mb-4 -mt-0.5 text-[11px] text-ink-soft leading-relaxed">
                            {path.ceilingSummary}
                          </p>
                        )}
                        {path.conditionalNote && (
                          <div className="mb-4 rounded-xl bg-gold/10 border border-gold/25 px-3.5 py-2.5 flex items-start gap-1.5">
                            <Info size={13} className="text-copper shrink-0 mt-0.5" />
                            <span className="text-[11px] text-ink leading-relaxed">{path.conditionalNote}</span>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="flex-1"
                            onClick={() => setDetailsPath(path)}
                          >
                            <Info size={15} /> التفاصيل
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => setConfirmPath(path)}
                          >
                            <Sparkles size={14} /> تفعيل المسار
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          </motion.div>
        ) : (
          /* ══════════════ ACTIVE-PLAN STATE ══════════════ */
          <motion.div
            key="active"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="space-y-6"
          >
            {/* Hero: gold ring + summary */}
            <Card reveal={false} className="relative overflow-hidden p-6 md:p-8">
              <div className="pointer-events-none absolute -top-16 -start-10 w-64 h-64 rounded-full bg-gold/10 blur-3xl" />
              <div className="relative flex flex-col md:flex-row items-center gap-8">
                {activePath.kind !== "conditional" && activePath.targetDbr != null ? (
                  <ActivePlanRing
                    targetDbr={activePath.targetDbr}
                    targetEligibility={activePath.targetEligibility ?? 0}
                    currentDbr={currentDbr}
                  />
                ) : (
                  <div className="w-32 h-32 rounded-full bg-espresso flex items-center justify-center shrink-0 shadow-[var(--shadow-md)]">
                    <Route size={44} className="text-gold" />
                  </div>
                )}

                <div className="flex-1 w-full">
                  <div className="inline-flex items-center gap-2 bg-positive-bg text-positive text-xs font-semibold px-3 py-1 rounded-full mb-3">
                    <ShieldCheck size={14} /> {allStepsDone ? "الخطة مكتملة 🎉" : "مسار مفعّل"}
                  </div>
                  <h3 className="text-xl font-bold text-ink mb-2">{activePath.title}</h3>
                  <p className="text-ink-soft text-sm leading-relaxed mb-5">
                    {activePath.kind !== "conditional" && activePath.targetDbr != null ? (
                      allStepsDone ? (
                        <>
                          أكملت خطوات هذا المسار — نسبة التزاماتك (محاكاة) انخفضت من {currentDbr}٪ إلى{" "}
                          {activePath.targetDbr}٪
                          {activePath.targetAmount != null && (
                            <>، وأصبح سقف تمويلك المتاح {formatSAR(activePath.targetAmount)}</>
                          )}
                          .
                        </>
                      ) : (
                        <>
                          بإكمال هذا المسار ستنخفض نسبة التزاماتك من {currentDbr}٪ إلى {activePath.targetDbr}٪
                          {activePath.targetAmount != null && (
                            <>، ويصبح سقف تمويلك المتاح {formatSAR(activePath.targetAmount)}</>
                          )}{" "}
                          خلال {activePath.duration}.
                        </>
                      )
                    ) : (
                      <>
                        {activePath.outcome}
                        {activePath.conditionalNote ? ` — ${activePath.conditionalNote}` : ""} (مدة تقديرية: {activePath.duration}).
                      </>
                    )}
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-cream-deep rounded-xl p-3.5 text-center">
                      {activePath.kind !== "conditional" && activePath.targetAmount != null ? (
                        <div className="text-lg font-bold text-copper flex items-center justify-center gap-1 tnum">
                          <Wallet size={15} />
                          {formatSAR(activePath.targetAmount)}
                        </div>
                      ) : (
                        <div className="text-sm font-bold text-copper">مسار إرشادي</div>
                      )}
                      <div className="text-xs text-ink-soft mt-1">
                        {activePath.kind !== "conditional" && activePath.targetAmount != null ? "سقف التمويل الجديد" : "نوع المسار"}
                      </div>
                    </div>
                    <div className="bg-cream-deep rounded-xl p-3.5 text-center">
                      <div className="text-lg font-bold text-positive flex items-center justify-center gap-1">
                        {activePath.kind !== "conditional" && activePath.targetEligibility != null ? (
                          <>
                            <Target size={15} />
                            {activePath.targetEligibility}٪
                          </>
                        ) : (
                          <span className="text-sm">{activePath.difficulty}</span>
                        )}
                      </div>
                      <div className="text-xs text-ink-soft mt-1">
                        {activePath.kind !== "conditional" ? "الأهلية المتوقعة" : "الصعوبة"}
                      </div>
                    </div>
                    <div className="bg-cream-deep rounded-xl p-3.5 text-center">
                      <div className="text-lg font-bold text-ink">{activePath.duration}</div>
                      <div className="text-xs text-ink-soft mt-1">مدة المسار</div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Achieved-state summary (frontend-only simulation) — appears whenever the plan's steps
                are all done, whether that just happened or was restored from a prior session. Always
                driven by allStepsDone (not the celebration-modal ref), so it can never go stale when
                the user navigates away and back. Reuses the plan's already-computed target numbers —
                no new calculation, no backend write. */}
            {allStepsDone && activePath.kind !== "conditional" && activePath.targetDbr != null && (
              <Card
                reveal={false}
                className="relative overflow-hidden border-2 border-positive/30 bg-positive-bg/50 p-5 md:p-6"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-positive text-white flex items-center justify-center shrink-0">
                    <CheckCircle2 size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-positive mb-1">
                      أهليتك بعد تنفيذ المسار (محاكاة) — مؤهل ✓
                    </div>
                    <p className="text-xs text-ink-soft leading-relaxed mb-3">
                      بناءً على إتمامك كل خطوات هذا المسار، هذه أرقامك المتوقعة كما لو تم تنفيذها فعلياً
                      لدى البنك — عرض أمامي فقط، لا تغيّر بياناتك أو طلبك الفعلي المخزَّن.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="bg-card rounded-xl p-3 text-center">
                        <div className="text-lg font-bold text-positive tnum">{activePath.targetDbr}٪</div>
                        <div className="text-[11px] text-ink-soft mt-0.5">نسبة الاستقطاع الجديدة</div>
                      </div>
                      {activePath.targetAmount != null && (
                        <div className="bg-card rounded-xl p-3 text-center">
                          <div className="text-lg font-bold text-copper tnum">{formatSAR(activePath.targetAmount)}</div>
                          <div className="text-[11px] text-ink-soft mt-0.5">سقف التمويل الجديد</div>
                        </div>
                      )}
                      {activePath.targetEligibility != null && (
                        <div className="bg-card rounded-xl p-3 text-center">
                          <div className="text-lg font-bold text-ink tnum">{activePath.targetEligibility}٪</div>
                          <div className="text-[11px] text-ink-soft mt-0.5">الأهلية المتوقعة</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Progress strip */}
            <Card reveal={false} className="relative overflow-hidden bg-espresso border-espresso p-5">
              <div className="pointer-events-none absolute -bottom-12 -end-8 w-56 h-56 rounded-full bg-gold/20 blur-3xl" />
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white font-semibold text-sm flex items-center gap-2">
                    <Sparkles size={16} className="text-gold" /> تقدّم الخطة
                  </span>
                  <span className="text-white/50 text-xs">
                    {doneCount === activeStepCount && activeStepCount > 0
                      ? "اكتملت كل الخطوات 🎉"
                      : `الخطوة ${doneCount} من ${activeStepCount} — ${doneCount === 0 ? "ابدأ بالخطوة الأولى" : "واصل التقدّم"}`}
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  {/* Persisted progress (survives reload/restart) drives the fill. */}
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-l from-gold to-[#E7CBA0]"
                    initial={false}
                    animate={{ width: `${activePct}%` }}
                    transition={{ duration: 0.5, ease: EASE }}
                  />
                </div>
              </div>
            </Card>

            {/* Coffee Index nudge — kept in view above the plan timeline */}
            {activePath.nudge && (
              <div className="rounded-2xl bg-gold/10 border border-gold/25 px-4 py-3">
                <p className="text-xs text-ink leading-relaxed">{activePath.nudge}</p>
              </div>
            )}

            {/* Execution Plan (Action Mode) — the rich accordion: financial impact, effort, checklist,
                execution status, cost of delay, plus the real Before→After DBR and pros/cons. */}
            <Card reveal={false} className="p-6 md:p-8">
              <h3 className="font-bold text-ink text-lg mb-1">خطوات تنفيذ المسار</h3>
              <p className="text-ink-soft text-sm mb-5">
                خطواتك العملية بالترتيب مع الأثر المالي والجهد وقائمة التحقق لكل خطوة — علّم كل خطوة عند إتمامها.
              </p>

              {/* Before → After DBR (real for computed; target for conditional) */}
              <div
                className={cn(
                  "rounded-2xl border p-4 mb-5 transition-colors",
                  allStepsDone ? "border-positive/30 bg-positive-bg/60" : "border-line bg-cream-deep/50"
                )}
              >
                <div className="text-xs font-bold text-ink-soft mb-3">الأثر على نسبة الاستقطاع (DBR)</div>
                <div className="flex items-center justify-center gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-negative tnum">{currentDbr}٪</div>
                    <div className="text-[11px] text-ink-soft mt-0.5">
                      {allStepsDone ? "قبل المسار" : "الآن"}
                    </div>
                  </div>
                  <span className="text-ink-soft text-lg">←</span>
                  {activePath.kind === "computed" && activePath.targetDbr != null ? (
                    <div className="text-center">
                      <div className="text-2xl font-bold text-positive tnum flex items-center gap-1.5 justify-center">
                        {activePath.targetDbr}٪ {allStepsDone && <Check size={16} className="text-positive" />}
                      </div>
                      <div className="text-[11px] text-ink-soft mt-0.5">
                        {allStepsDone ? "✅ تم تحقيق الهدف" : "بعد التنفيذ"}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-2xl font-bold text-copper tnum">≤ {salaryCapPct}٪</div>
                      <div className="text-[11px] text-ink-soft mt-0.5">الهدف</div>
                    </div>
                  )}
                </div>
                <div className="text-[11px] text-ink-soft text-center mt-3 leading-relaxed">
                  {activePath.kind === "computed"
                    ? `الحد النظامي ${salaryCapPct}٪`
                    : shedTarget > 0
                    ? `يلزم تحرير ~${formatSAR(shedTarget)} من استقطاعك الشهري للوصول إلى الحد (${salaryCapPct}٪)`
                    : `الحد النظامي ${salaryCapPct}٪`}
                </div>
              </div>

              {activePath.roadmap && activePath.roadmap.length > 0 ? (
                <StepAccordion steps={activePath.roadmap} done={doneSteps} onToggle={toggleStep} />
              ) : (
                <TimelineStepper path={activePath} animated advisor />
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════ DETAILS MODAL ══════════════ */}
      <Modal
        open={detailsPath !== null}
        onClose={() => setDetailsPath(null)}
        title={detailsPath?.title}
        subtitle={detailsPath?.summary}
      >
        {detailsPath && (
          <div className="space-y-6">
            {/* Preview (teaser) — clean, text-focused: WHY this path + HOW it works. No rich data. */}
            <div>
              <div className="flex items-center gap-1.5 text-sm font-bold text-ink mb-2">
                <Sparkles size={15} className="text-copper" /> لماذا هذا المسار؟
              </div>
              <p className="text-sm text-ink-soft leading-relaxed">
                {detailsPath.outcome}
                {detailsPath.conditionalNote ? ` — ${detailsPath.conditionalNote}` : ""}
              </p>
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-sm font-bold text-ink mb-2.5">
                <Route size={15} className="text-copper" /> كيف يعمل؟
              </div>
              <ul className="space-y-2.5">
                {(detailsPath.roadmap && detailsPath.roadmap.length > 0
                  ? detailsPath.roadmap.map((s) => s.title)
                  : detailsPath.steps
                ).map((t, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-ink-soft leading-relaxed">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-cream-deep text-copper text-[11px] font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Tradeoffs — الإيجابيات والسلبيات (part of the executive summary: is it good for me?) */}
            {((detailsPath.pros?.length ?? 0) > 0 || (detailsPath.cons?.length ?? 0) > 0) && (
              <div className="grid sm:grid-cols-2 gap-4">
                {(detailsPath.pros?.length ?? 0) > 0 && (
                  <div className="rounded-2xl border border-positive/20 bg-positive-bg/50 p-4">
                    <div className="flex items-center gap-1.5 text-sm font-bold text-positive mb-2.5">
                      <Check size={15} /> الإيجابيات
                    </div>
                    <ul className="space-y-2">
                      {detailsPath.pros!.map((p, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-ink leading-relaxed">
                          <Check size={13} className="text-positive shrink-0 mt-0.5" />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(detailsPath.cons?.length ?? 0) > 0 && (
                  <div className="rounded-2xl border border-negative/20 bg-negative-bg/50 p-4">
                    <div className="flex items-center gap-1.5 text-sm font-bold text-negative mb-2.5">
                      <X size={15} /> السلبيات
                    </div>
                    <ul className="space-y-2">
                      {detailsPath.cons!.map((c, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-ink leading-relaxed">
                          <X size={13} className="text-negative shrink-0 mt-0.5" />
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <p className="text-[11px] text-ink-soft bg-cream-deep/60 rounded-xl px-3 py-2 leading-relaxed">
              فعّل المسار للاطّلاع على خطة التنفيذ الكاملة: الأثر المالي لكل خطوة، ومستوى الجهد، وقائمة التحقق، وطريقة التنفيذ.
            </p>

            {/* CTA */}
            <div className="flex items-center gap-3 pt-1">
              <Button variant="secondary" size="md" className="flex-1" onClick={() => setDetailsPath(null)}>
                إغلاق
              </Button>
              <Button
                size="md"
                className="flex-1"
                onClick={() => {
                  setConfirmPath(detailsPath);
                  setDetailsPath(null);
                }}
              >
                <Sparkles size={15} /> تفعيل المسار
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ══════════════ CONFIRM MODAL ══════════════ */}
      <Modal
        open={confirmPath !== null}
        onClose={() => setConfirmPath(null)}
        className="max-w-md"
        title="تأكيد تفعيل المسار"
      >
        {confirmPath && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-cream-deep p-5 text-center">
              <div className="w-12 h-12 rounded-2xl bg-espresso text-gold flex items-center justify-center mx-auto mb-3">
                <Sparkles size={22} />
              </div>
              <h4 className="font-bold text-ink">{confirmPath.title}</h4>
              <p className="text-xs text-ink-soft mt-2 leading-relaxed">
                سيتم تفعيل هذا المسار وعرض خطته الزمنية، وستنخفض نسبة التزاماتك المستهدفة إلى{" "}
                <span className="font-bold text-copper">{confirmPath.targetDbr}٪</span> خلال {confirmPath.duration}.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="md" className="flex-1" onClick={() => setConfirmPath(null)}>
                إلغاء
              </Button>
              <Button size="md" className="flex-1" onClick={() => activate(confirmPath)}>
                تأكيد التفعيل <ArrowRight size={15} className="rotate-180" />
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ══════════════ COMPLETION CELEBRATION MODAL (Part 9) ══════════════ */}
      <Modal
        open={showCompletionModal}
        onClose={() => setShowCompletionModal(false)}
        className="max-w-md"
        title="أكملت مسارك! 🎉"
      >
        {activePath && (
          <div className="space-y-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-positive-bg text-positive flex items-center justify-center mx-auto">
              <PartyPopper size={26} />
            </div>
            <p className="text-sm text-ink-soft leading-relaxed">
              أنجزت كل خطوات مسار «{activePath.title}». بناءً على الأرقام المحسوبة مسبقاً لهذا المسار،
              هذه أرقامك المتوقعة بعد تنفيذ الخطوات فعلياً لدى البنك:
            </p>
            <div className="grid grid-cols-2 gap-3">
              {activePath.targetDbr != null && (
                <div className="bg-cream-deep rounded-xl p-3.5">
                  <div className="text-xl font-bold text-positive tnum">{activePath.targetDbr}٪</div>
                  <div className="text-[11px] text-ink-soft mt-1">نسبة الاستقطاع المتوقعة</div>
                </div>
              )}
              {activePath.targetAmount != null && (
                <div className="bg-cream-deep rounded-xl p-3.5">
                  <div className="text-xl font-bold text-copper tnum">{formatSAR(activePath.targetAmount)}</div>
                  <div className="text-[11px] text-ink-soft mt-1">سقف التمويل المتوقع</div>
                </div>
              )}
            </div>
            <p className="text-[11px] text-ink-soft leading-relaxed">
              هذه أرقام محسوبة مسبقاً لهذا المسار وليست إعادة حساب حيّة جديدة — أرقامك الفعلية لدى
              البنك تتحدّث بعد تنفيذ الخطوات هناك.
            </p>
            <Button className="w-full" onClick={() => setShowCompletionModal(false)}>
              تم
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
