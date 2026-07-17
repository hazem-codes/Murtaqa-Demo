import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Info,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { BusinessPath, DifficultyKey, ReadinessCriterion } from "../lib/data";
import type { GapInfo } from "../lib/api";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useSelectedAccount } from "../lib/accountStore";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { EligibilityRing } from "../components/EligibilityRing";
import { SectionLoading, SectionError, Skeleton } from "../components/AsyncStates";
import { Stagger, StaggerItem } from "../components/Stagger";
import { fadeUp, inView, EASE } from "../animations/variants";
import { cn, formatSAR, formatNumber } from "../lib/utils";

const difficultyStyle: Record<DifficultyKey, string> = {
  سهل: "bg-positive-bg text-positive",
  متوسط: "bg-warn-bg text-warn",
  صعب: "bg-negative-bg text-negative",
};

const statusMeta: Record<
  ReadinessCriterion["status"],
  { icon: typeof CheckCircle2; cls: string; chip: string; word: string }
> = {
  pass: { icon: CheckCircle2, cls: "text-positive", chip: "bg-positive-bg text-positive", word: "محقق" },
  watch: { icon: AlertTriangle, cls: "text-warn", chip: "bg-warn-bg text-warn", word: "تحت المراقبة" },
  fail: { icon: AlertTriangle, cls: "text-negative", chip: "bg-negative-bg text-negative", word: "غير محقق" },
};

/* ── Derive modal content from an SME path's real fields (steps/effect) ─────── */
function pathPros(path: BusinessPath): string[] {
  return [
    path.effect,
    "يقوّي التدفق النقدي ويقلّل خطر شهر سالب متوقع",
    "يرفع جاهزية منشأتك للتمويل نحو المستوى الممتاز",
  ];
}

function pathCons(path: BusinessPath): string[] {
  const text = path.steps.join(" ");
  const cons: string[] = [];
  if (["مورد", "تسوية", "دفع"].some((k) => text.includes(k)))
    cons.push("يتطلب التفاوض مع الموردين على إعادة جدولة الدفعات");
  if (["تحصيل", "فوترة", "عميل", "عملاء", "خصم"].some((k) => text.includes(k)))
    cons.push("يعتمد على التزام العملاء بالسداد المبكر");
  if (["احتياطي", "تحويل", "تجنيب"].some((k) => text.includes(k)))
    cons.push("يتطلب تجنيب جزء من السيولة الشهرية بانتظام");
  cons.push("يحتاج انضباطاً في التنفيذ خلال المدة المحددة");
  return cons.slice(0, 3);
}

interface SmeTimelineStep {
  phase: string;
  detail: string;
}

function pathTimeline(path: BusinessPath): SmeTimelineStep[] {
  return path.steps.map((step, i) => ({ phase: `الخطوة ${i + 1}`, detail: step }));
}

/* ══════════════════════════════════════════════════════════════════════════
   ACTIVE-PLAN WIDGETS (all driven by real gap numbers from the SME engine)
   ══════════════════════════════════════════════════════════════════════════ */

/** Widget 1 — Cashflow tracker: cash on hand vs. the cost of surviving the gap. */
function CashflowTracker({ gap }: { gap: GapInfo }) {
  const cash = gap.cashBalance;
  const settlement = gap.settlementAmount;
  const reserveAfter = cash - settlement;
  const gapPct = cash > 0 ? Math.min(100, Math.round((settlement / cash) * 100)) : 0;
  const covered = cash >= settlement;

  return (
    <Card reveal={false} className="p-6">
      <div className="flex items-center justify-between mb-4">
        <span className="flex items-center gap-2 font-bold text-ink text-sm">
          <Wallet size={17} className="text-copper" /> مؤشر السيولة النقدية
        </span>
        <span
          className={cn(
            "text-[11px] font-bold px-2.5 py-1 rounded-full",
            covered ? "bg-positive-bg text-positive" : "bg-negative-bg text-negative"
          )}
        >
          {covered ? "سيولتك تكفي" : "سيولة غير كافية"}
        </span>
      </div>

      <div className="mb-1 text-3xl font-bold text-ink tnum">{formatSAR(cash)}</div>
      <div className="text-xs text-ink-soft mb-5">السيولة المتاحة حالياً</div>

      {/* Segmented bar: red = gap cost, green = what remains */}
      <div className="h-3 w-full rounded-full overflow-hidden flex bg-cream-deep mb-3">
        <motion.div
          className="h-full bg-negative/70"
          initial={{ width: 0 }}
          animate={{ width: `${gapPct}%` }}
          transition={{ duration: 1, ease: EASE }}
        />
        <motion.div
          className="h-full bg-positive/70"
          initial={{ width: 0 }}
          animate={{ width: `${100 - gapPct}%` }}
          transition={{ duration: 1, ease: EASE, delay: 0.15 }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-negative-bg/50 border border-negative/15 p-3">
          <div className="text-sm font-bold text-negative tnum">−{formatNumber(settlement)}</div>
          <div className="text-[11px] text-ink-soft mt-0.5">تكلفة فجوة {gap.monthLabel}</div>
        </div>
        <div className="rounded-xl bg-positive-bg/50 border border-positive/15 p-3">
          <div className="text-sm font-bold text-positive tnum">{formatNumber(reserveAfter)}</div>
          <div className="text-[11px] text-ink-soft mt-0.5">المتبقي بعد الفجوة</div>
        </div>
      </div>
    </Card>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Widget 2 — Countdown to the gap month (clamps at zero, ticks live). */
function GapCountdown({ gap }: { gap: GapInfo }) {
  const target = useMemo(() => {
    if (!gap.month) return null;
    const [y, m] = gap.month.split("-").map(Number);
    return new Date(y, m - 1, 1).getTime();
  }, [gap.month]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = target ? Math.max(0, target - now) : 0;
  const reached = target === null || diff <= 0;
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);

  const units = [
    { v: days, label: "يوم" },
    { v: hours, label: "ساعة" },
    { v: minutes, label: "دقيقة" },
    { v: seconds, label: "ثانية" },
  ];

  return (
    <Card reveal={false} className="relative overflow-hidden bg-espresso border-espresso p-6">
      <div className="pointer-events-none absolute -top-12 -end-8 w-44 h-44 rounded-full bg-gold/15 blur-3xl" />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <span className="flex items-center gap-2 font-bold text-white text-sm">
            <CalendarClock size={17} className="text-gold" /> عدّاد فجوة {gap.monthLabel}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-white/50">
            <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" /> مباشر
          </span>
        </div>

        {reached ? (
          <div className="py-4 text-center">
            <div className="text-lg font-bold text-gold mb-1">حان موعد الفجوة</div>
            <p className="text-xs text-white/60">تأكد من جاهزية سيولتك لتسوية المورد هذا الشهر.</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {units.map((u) => (
              <div key={u.label} className="rounded-2xl bg-white/6 border border-white/10 p-3 text-center">
                <div className="text-2xl font-bold text-white tnum leading-none">
                  {u.label === "يوم" ? u.v : pad(u.v)}
                </div>
                <div className="text-[10px] text-white/50 mt-1.5">{u.label}</div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-white/60 leading-relaxed mt-4">
          حتى استحقاق تسوية المورد البالغة{" "}
          <span className="font-bold text-gold tnum">{formatNumber(gap.settlementAmount)}</span> ريال.
        </p>
      </div>
    </Card>
  );
}

/** Widget 3 — Gap-mitigation tracker: the activated plan's real steps as a checklist. */
function MitigationTracker({
  path,
  gap,
  done,
  onToggle,
}: {
  path: BusinessPath;
  gap: GapInfo;
  done: Set<number>;
  onToggle: (i: number) => void;
}) {
  const total = path.steps.length;
  const completed = done.size;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  return (
    <Card reveal={false} className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-1">
        <h3 className="flex items-center gap-2 font-bold text-ink text-lg">
          <ShieldCheck size={18} className="text-copper" /> متابعة خطة سدّ الفجوة
        </h3>
        <span className="text-sm font-bold text-copper tnum">
          {completed} / {total}
        </span>
      </div>
      <p className="text-ink-soft text-sm mb-5">
        نفّذ خطوات مسار «{path.title}» لسدّ فجوة{" "}
        <span className="font-bold text-ink tnum">{formatNumber(gap.settlementAmount)}</span> ريال قبل موعدها.
      </p>

      {/* Progress bar */}
      <div className="h-2.5 bg-cream-deep rounded-full overflow-hidden mb-6">
        <motion.div
          className="h-full rounded-full bg-gradient-to-l from-copper to-gold"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: EASE }}
        />
      </div>

      {/* Checklist of the plan's real steps */}
      <div className="space-y-2.5">
        {path.steps.map((step, i) => {
          const isDone = done.has(i);
          return (
            <button
              key={i}
              onClick={() => onToggle(i)}
              className={cn(
                "w-full flex items-start gap-3 text-start rounded-2xl border p-3.5 transition-colors",
                isDone
                  ? "bg-positive-bg/40 border-positive/25"
                  : "bg-card border-line hover:border-copper/40"
              )}
            >
              {isDone ? (
                <CheckCircle2 size={20} className="text-positive shrink-0 mt-0.5" />
              ) : (
                <Circle size={20} className="text-ink-faint shrink-0 mt-0.5" />
              )}
              <span
                className={cn(
                  "text-sm leading-relaxed",
                  isDone ? "text-ink-soft line-through" : "text-ink"
                )}
              >
                {step}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-gold/15 border border-gold/25 ps-2 pe-3 py-1.5">
        <Sparkles size={13} className="text-copper shrink-0" />
        <span className="text-[11px] font-medium text-ink-soft">
          {pct === 100
            ? "أكملت الخطة — منشأتك جاهزة لتجاوز الفجوة بثبات."
            : "كل خطوة تنجزها تقرّبك من تجاوز الفجوة دون شهر سالب."}
        </span>
      </div>
    </Card>
  );
}

/** Skeleton shown on each plan card while ALLaM generates the action plans. */
function PlanCardSkeleton() {
  return (
    <div className="h-full flex flex-col bg-card rounded-3xl p-6 border-2 border-line shadow-[var(--shadow-sm)]">
      <div className="flex items-start gap-3 mb-5">
        <Skeleton className="w-10 h-10 rounded-2xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
        </div>
      </div>
      <div className="space-y-3 mb-5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/6" />
      </div>
      <div className="mt-auto space-y-4">
        <Skeleton className="h-10 w-full rounded-xl" />
        <div className="flex gap-2.5">
          <Skeleton className="h-9 flex-1 rounded-lg" />
          <Skeleton className="h-9 flex-1 rounded-lg" />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-1.5 text-[11px] text-ink-faint">
        <Sparkles size={12} className="text-copper animate-pulse" />
        <span>يولّد المستشار الذكي خططك…</span>
      </div>
    </div>
  );
}

export function BusinessEligibility() {
  const account = useSelectedAccount("business");
  const { state, retry } = useApi(api.getBusinessReadiness, [account]);
  const { state: plansState } = useApi(api.getBusinessPlans, [account]);
  const [detailsPath, setDetailsPath] = useState<BusinessPath | null>(null);
  const [confirmPath, setConfirmPath] = useState<BusinessPath | null>(null);
  const [activePath, setActivePath] = useState<BusinessPath | null>(null);
  // Completed step INDICES (0-based, the checklist's own key). Persisted as 1-based step_numbers.
  const [doneSteps, setDoneSteps] = useState<Set<number>>(new Set());
  // Part 3: the persisted roadmap for this business (which plan is active + which steps are done).
  const { state: roadmapState } = useApi(api.getBusinessRoadmap, [account]);

  const gap = state.status === "ready" ? state.data.gap : null;

  // A switch of account forgets the previous plan until the store is re-read for the new one.
  const restoredForAccount = useRef<string | null>(null);
  useEffect(() => {
    restoredForAccount.current = null;
    setActivePath(null);
    setDoneSteps(new Set());
  }, [account]);

  // Restore the activated plan + completion once BOTH the plans and the stored progress arrive.
  useEffect(() => {
    if (plansState.status !== "ready" || roadmapState.status !== "ready") return;
    if (restoredForAccount.current === account) return;
    restoredForAccount.current = account;
    const progress = roadmapState.data.progress;
    if (!progress) return;
    const match = plansState.data.plans.find((p) => p.id === progress.plan.id);
    if (match) {
      setActivePath(match);
      // Persisted step_numbers are 1-based; the checklist keys steps by 0-based index.
      setDoneSteps(new Set(progress.completedSteps.map((n) => n - 1)));
    }
  }, [plansState, roadmapState, account]);

  const activate = (path: BusinessPath) => {
    setActivePath(path);
    setDoneSteps(new Set());
    setConfirmPath(null);
    setDetailsPath(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    void api.activateBusinessRoadmap(path.id).catch(() => {});
  };

  const toggleStep = (i: number) => {
    const done = !doneSteps.has(i);
    setDoneSteps((prev) => {
      const next = new Set(prev);
      done ? next.add(i) : next.delete(i);
      return next;
    });
    // Persist by 1-based step_number (the server's step identity).
    void api.setBusinessRoadmapStep(i + 1, done).catch(() => {});
  };

  const deactivate = () => {
    setActivePath(null);
    setDoneSteps(new Set());
    void api.clearBusinessRoadmap().catch(() => {});
  };

  return (
    <div className="px-5 md:px-8 py-6 md:py-8 max-w-6xl mx-auto space-y-6" dir="rtl">
      <PageHeader
        eyebrow="قرار من موقع قوة"
        title="جاهزية أعمالك للتمويل"
        subtitle={
          activePath
            ? "مسارك مفعّل — تابع سيولتك والعدّاد وخطوات سدّ الفجوة."
            : "لا نسبة استقطاع هنا — جهات تمويل الأعمال تقرأ صحة تدفقك النقدي واستقراره"
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

      {state.status === "loading" && <SectionLoading height={360} />}
      {state.status === "error" && <SectionError onRetry={retry} />}
      {state.status === "ready" && (
        <AnimatePresence mode="wait">
          {/* ══════════════ SELECTION STATE ══════════════ */}
          {!activePath ? (
            <motion.div
              key="selection"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="space-y-6"
            >
              {/* Readiness hero — dark stage */}
              <Card
                reveal={false}
                className="relative overflow-hidden bg-espresso border-espresso p-6 md:p-8 flex flex-col md:flex-row items-center gap-8"
              >
                <div className="pointer-events-none absolute -top-20 -start-16 w-72 h-72 rounded-full bg-copper/25 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-24 -end-16 w-72 h-72 rounded-full bg-gold/12 blur-3xl" />
                <div className="relative">
                  <EligibilityRing percentage={state.data.score} size={200} label="من 100" onDark />
                </div>
                <div className="relative flex-1 w-full">
                  <span className="inline-flex items-center gap-1.5 bg-white/8 border border-white/15 text-gold text-xs font-bold px-3.5 py-1.5 rounded-full mb-3">
                    {state.data.statusWord}
                  </span>
                  <h3 className="text-xl md:text-2xl font-bold text-white mb-2">
                    منشأتك تحقق معيارين من ثلاثة
                  </h3>
                  <p className="text-white/65 text-sm leading-relaxed mb-6">
                    جاهزية التمويل للأعمال تقوم على ثلاثة معايير: استمرار التدفق النقدي موجباً،
                    واستقرار الإيرادات، وخلوّ الأشهر الستة القادمة من شهر سالب متوقع. عالج المعيار
                    المتبقي — فتتقدم بشروط أفضل.
                  </p>
                  <div className="relative overflow-hidden rounded-2xl bg-gold/10 border border-gold/25 p-4 flex items-start gap-3">
                    <span className="shrink-0 w-9 h-9 rounded-xl bg-gold flex items-center justify-center">
                      <CalendarClock size={17} className="text-espresso" />
                    </span>
                    <div>
                      <div className="text-sm font-bold text-gold mb-1">{state.data.timing.verdict}</div>
                      <p className="text-xs text-white/70 leading-relaxed">{state.data.timing.detail}</p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* The three criteria, in detail */}
              <div>
                <motion.h3
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={inView}
                  className="font-bold text-ink text-lg mb-1"
                >
                  معايير الجاهزية الثلاثة
                </motion.h3>
                <p className="text-ink-soft text-sm mb-5">
                  هذه هي الأسئلة التي تطرحها جهة التمويل على أرقامك — وهذه إجاباتك اليوم.
                </p>
                <Stagger className="grid md:grid-cols-3 gap-5" stagger={0.1}>
                  {state.data.criteria.map((c) => {
                    const meta = statusMeta[c.status];
                    return (
                      <StaggerItem key={c.id}>
                        <div
                          className={cn(
                            "h-full flex flex-col bg-card rounded-3xl p-6 border-2",
                            c.status === "watch"
                              ? "border-warn/40 shadow-[var(--shadow-md)]"
                              : "border-line shadow-[var(--shadow-sm)]"
                          )}
                        >
                          <div className="flex items-center justify-between mb-4">
                            <meta.icon size={22} className={meta.cls} />
                            <span className={cn("text-xs font-bold px-3 py-1 rounded-full", meta.chip)}>
                              {meta.word}
                            </span>
                          </div>
                          <div className="font-bold text-ink leading-snug mb-2">{c.label}</div>
                          <div className="text-sm font-bold text-copper tnum mb-3">{c.value}</div>
                          <p className="text-xs text-ink-soft leading-relaxed mt-auto">{c.detail}</p>
                        </div>
                      </StaggerItem>
                    );
                  })}
                </Stagger>
              </div>

              {/* Preparation paths */}
              <div>
                <motion.h3
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={inView}
                  className="font-bold text-ink text-lg mb-1"
                >
                  خطة الوصول إلى جاهزية ممتازة
                </motion.h3>
                <p className="text-ink-soft text-sm mb-5">
                  ثلاث خطط عملية يولّدها المستشار الذكي من أرقام منشأتك — استعرض التفاصيل ثم فعّل الأنسب لك.
                </p>
                {plansState.status !== "ready" ? (
                  <div className="grid md:grid-cols-3 gap-5">
                    {[0, 1, 2].map((i) => (
                      <PlanCardSkeleton key={i} />
                    ))}
                  </div>
                ) : (
                <Stagger className="grid md:grid-cols-3 gap-5" stagger={0.1}>
                  {plansState.data.plans.map((path, idx) => (
                    <StaggerItem key={path.id}>
                      <motion.div
                        whileHover={{ y: -4 }}
                        transition={{ duration: 0.25 }}
                        onClick={() => setDetailsPath(path)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setDetailsPath(path)}
                        className={cn(
                          "relative h-full flex flex-col bg-card rounded-3xl p-6 border-2 transition-colors duration-300 cursor-pointer",
                          idx === 0
                            ? "border-copper/50 shadow-[var(--shadow-lg)]"
                            : "border-line hover:border-copper/40 shadow-[var(--shadow-sm)]"
                        )}
                      >
                        {idx === 0 && (
                          <span className="absolute -top-3.5 start-6 z-10 inline-flex items-center gap-1.5 bg-gold text-espresso text-xs font-bold px-3.5 py-1.5 rounded-full shadow-[var(--shadow-md)]">
                            <Sparkles size={12} /> ابدأ به هذا الشهر
                          </span>
                        )}
                        <div className="flex items-start gap-3 mb-5">
                          <div className="w-10 h-10 rounded-2xl bg-espresso text-gold font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </div>
                          <div>
                            <h4 className="font-bold text-ink leading-snug">{path.title}</h4>
                            <p className="text-xs text-ink-soft mt-1 leading-relaxed">{path.summary}</p>
                          </div>
                        </div>

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

                        <div className="mt-auto">
                          <div className="mb-4 rounded-xl bg-copper-tint/70 border border-copper/15 px-3.5 py-2.5 flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-xs text-ink-soft">
                              <TrendingUp size={14} className="text-copper" /> الأثر
                            </span>
                            <span className="text-xs font-bold text-copper text-start">{path.effect}</span>
                          </div>
                          <div className="flex items-center justify-between pt-4 border-t border-line">
                            <span
                              className={cn(
                                "text-xs px-2.5 py-1 rounded-full font-medium",
                                difficultyStyle[path.difficulty]
                              )}
                            >
                              {path.difficulty}
                            </span>
                            <span className="flex items-center gap-1 text-xs text-ink-soft">
                              <Clock size={13} /> {path.duration}
                            </span>
                          </div>

                          <div className="flex items-center gap-2.5 mt-4">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="flex-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetailsPath(path);
                              }}
                            >
                              <Info size={15} /> التفاصيل
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmPath(path);
                              }}
                            >
                              <Sparkles size={14} /> تفعيل المسار
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    </StaggerItem>
                  ))}
                </Stagger>
                )}
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
              {/* Hero: activated plan summary */}
              <Card reveal={false} className="relative overflow-hidden p-6 md:p-8">
                <div className="pointer-events-none absolute -top-16 -start-10 w-64 h-64 rounded-full bg-gold/10 blur-3xl" />
                <div className="relative flex flex-col md:flex-row md:items-center gap-6">
                  <div className="flex-1">
                    <div className="inline-flex items-center gap-2 bg-positive-bg text-positive text-xs font-semibold px-3 py-1 rounded-full mb-3">
                      <ShieldCheck size={14} /> مسار مفعّل
                    </div>
                    <h3 className="text-xl font-bold text-ink mb-2">{activePath.title}</h3>
                    <p className="text-ink-soft text-sm leading-relaxed">{activePath.summary}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 md:w-[22rem]">
                    <div className="bg-cream-deep rounded-xl p-3.5 text-center">
                      <div className="text-sm font-bold text-copper">{activePath.duration}</div>
                      <div className="text-[11px] text-ink-soft mt-1">مدة المسار</div>
                    </div>
                    <div className="bg-cream-deep rounded-xl p-3.5 text-center">
                      <span
                        className={cn(
                          "inline-block text-xs font-bold px-2.5 py-0.5 rounded-full",
                          difficultyStyle[activePath.difficulty]
                        )}
                      >
                        {activePath.difficulty}
                      </span>
                      <div className="text-[11px] text-ink-soft mt-1.5">الصعوبة</div>
                    </div>
                    <div className="bg-cream-deep rounded-xl p-3.5 text-center">
                      <div className="text-sm font-bold text-ink">{state.data.score}</div>
                      <div className="text-[11px] text-ink-soft mt-1">الجاهزية</div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Widgets: cashflow tracker + live gap countdown */}
              {gap && (
                <>
                  <div className="grid md:grid-cols-2 gap-5">
                    <CashflowTracker gap={gap} />
                    <GapCountdown gap={gap} />
                  </div>

                  {/* Gap-mitigation tracker (the plan's real steps as a checklist) */}
                  <MitigationTracker path={activePath} gap={gap} done={doneSteps} onToggle={toggleStep} />
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* ══════════════ SME PATH DETAILS MODAL ══════════════ */}
      <Modal
        open={detailsPath !== null}
        onClose={() => setDetailsPath(null)}
        title={detailsPath?.title}
        subtitle={detailsPath?.summary}
      >
        {detailsPath && (
          <div className="space-y-7">
            {/* Headline: expected impact */}
            <div className="relative overflow-hidden rounded-2xl bg-espresso p-5 text-center">
              <div className="pointer-events-none absolute -top-10 -start-8 w-40 h-40 rounded-full bg-gold/15 blur-3xl" />
              <div className="relative">
                <div className="flex items-center justify-center gap-1.5 text-xs text-white/60 mb-1">
                  <TrendingUp size={14} className="text-gold" /> الأثر المتوقع
                </div>
                <div className="text-lg font-bold text-gold leading-relaxed">{detailsPath.effect}</div>
              </div>
            </div>

            {/* Quick meta row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-cream-deep rounded-xl p-3 text-center">
                <div className="text-base font-bold text-ink">{detailsPath.duration}</div>
                <div className="text-[11px] text-ink-soft mt-0.5">المدة</div>
              </div>
              <div className="bg-cream-deep rounded-xl p-3 text-center">
                <span
                  className={cn(
                    "inline-block text-sm font-bold px-3 py-0.5 rounded-full",
                    difficultyStyle[detailsPath.difficulty]
                  )}
                >
                  {detailsPath.difficulty}
                </span>
                <div className="text-[11px] text-ink-soft mt-1">مستوى الصعوبة</div>
              </div>
            </div>

            {/* Pros & Cons */}
            <div>
              <h4 className="text-sm font-bold text-ink mb-3">المميزات والسلبيات</h4>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-positive/20 bg-positive-bg/50 p-4">
                  <div className="flex items-center gap-2 text-positive font-semibold text-sm mb-3">
                    <ThumbsUp size={15} /> المميزات
                  </div>
                  <ul className="space-y-2.5">
                    {(detailsPath.pros ?? pathPros(detailsPath)).map((p, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-ink leading-relaxed">
                        <Check size={14} className="text-positive shrink-0 mt-0.5" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl border border-negative/20 bg-negative-bg/50 p-4">
                  <div className="flex items-center gap-2 text-negative font-semibold text-sm mb-3">
                    <ThumbsDown size={15} /> السلبيات
                  </div>
                  <ul className="space-y-2.5">
                    {(detailsPath.cons ?? pathCons(detailsPath)).map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-ink leading-relaxed">
                        <span className="w-3.5 h-0.5 bg-negative rounded-full shrink-0 mt-2" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Detailed timeline */}
            <div>
              <h4 className="text-sm font-bold text-ink mb-4">الخط الزمني التفصيلي</h4>
              <div className="relative">
                {pathTimeline(detailsPath).map((step, i, arr) => (
                  <div key={i} className="relative flex gap-4 pb-6 last:pb-0">
                    {i < arr.length - 1 && (
                      <span className="absolute top-9 start-[15px] w-px h-[calc(100%-20px)] bg-line" />
                    )}
                    <div className="relative z-10 w-8 h-8 rounded-full bg-espresso text-gold text-xs font-bold flex items-center justify-center shrink-0 shadow-[var(--shadow-sm)]">
                      {i + 1}
                    </div>
                    <div className="relative flex-1 pt-0.5">
                      <span className="text-xs font-semibold text-copper bg-copper-tint px-2 py-0.5 rounded-full">
                        {step.phase}
                      </span>
                      <p className="text-xs text-ink-soft leading-relaxed mt-1.5">{step.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="flex items-center gap-3">
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
                سيتم تفعيل هذا المسار وعرض لوحة متابعة حيّة: مؤشر السيولة النقدية، وعدّاد فجوة{" "}
                {gap?.monthLabel ?? "أغسطس"}، وتتبّع خطوات سدّ الفجوة خطوةً بخطوة.
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
    </div>
  );
}
