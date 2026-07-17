import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  PiggyBank,
  Sparkles,
  Wallet,
  ShieldCheck,
  TrendingDown,
  Loader2,
  Home,
  ShoppingBag,
  Landmark,
  Target,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import {
  api,
  type SavingsPlanResponse,
  type SavingsStrategiesResponse,
  type SavingsAdviceResponse,
  type SavingsStrategy,
} from "../lib/api";
import { useApi } from "../lib/useApi";
import { useSelectedAccount } from "../lib/accountStore";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { SectionLoading, SectionError } from "../components/AsyncStates";
import { EASE } from "../animations/variants";
import { cn, formatSAR, formatNumber } from "../lib/utils";

/* ── Bucket presentation (needs / wants / savings) ─────────────────────────────────────── */
type BucketKey = "needs" | "wants" | "savings";
const BUCKET_META: Record<BucketKey, { label: string; icon: typeof Home; hint: string; accent: string; tint: string }> = {
  needs: {
    label: "الاحتياجات",
    icon: Home,
    hint: "الالتزامات والمصاريف الأساسية (السكن، الفواتير، البقالة، التنقل).",
    accent: "bg-copper",
    tint: "bg-copper-tint text-copper-dark",
  },
  wants: {
    label: "الرغبات",
    icon: ShoppingBag,
    hint: "المصاريف غير الأساسية (المطاعم، الترفيه، التسوق، الاشتراكات).",
    accent: "bg-gold",
    tint: "bg-gold/15 text-copper-dark",
  },
  savings: {
    label: "الادخار",
    icon: Landmark,
    hint: "ما تدّخره شهرياً لأهدافك المستقبلية وطوارئك.",
    accent: "bg-positive",
    tint: "bg-positive-bg text-positive",
  },
};

function BucketCard({
  bucketKey,
  pct,
  target,
  actual,
  index,
}: {
  bucketKey: BucketKey;
  pct: number;
  target: number;
  actual: number;
  index: number;
}) {
  const meta = BUCKET_META[bucketKey];
  const Icon = meta.icon;
  const barWidth = target > 0 ? Math.min(Math.max(actual / target, 0), 1) * 100 : 0;
  const overTarget = actual > target;
  const good = bucketKey === "savings" ? actual >= target : actual <= target;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + index * 0.07, duration: 0.4, ease: EASE }}
    >
      <Card reveal={false} className="p-5 h-full">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", meta.tint)}>
              <Icon size={18} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-ink leading-none">{meta.label}</h4>
              <span className="text-[11px] text-ink-soft tnum">{pct}٪ من الدخل</span>
            </div>
          </div>
          <span
            className={cn(
              "text-[10px] font-semibold rounded-full px-2 py-0.5",
              good ? "bg-positive-bg text-positive" : "bg-gold/15 text-copper-dark"
            )}
          >
            {good ? "ضمن الهدف" : overTarget ? "أعلى من الهدف" : "دون الهدف"}
          </span>
        </div>

        <div className="flex items-end justify-between mb-1">
          <div>
            <div className="text-[11px] text-ink-soft">المبلغ المستهدف</div>
            <div className="text-lg font-bold text-ink tnum">{formatSAR(target)}</div>
          </div>
          <div className="text-end">
            <div className="text-[11px] text-ink-soft">إنفاقك الفعلي</div>
            <div className="text-sm font-semibold text-ink-soft tnum">{formatSAR(actual)}</div>
          </div>
        </div>

        <div className="mt-2 h-2 bg-cream-deep rounded-full overflow-hidden">
          <motion.div
            className={cn("h-full rounded-full", meta.accent)}
            initial={false}
            animate={{ width: `${barWidth}%` }}
            transition={{ duration: 0.5, ease: EASE }}
          />
        </div>
        <p className="text-[11px] text-ink-soft leading-relaxed mt-3">{meta.hint}</p>
      </Card>
    </motion.div>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  tone?: "neutral" | "positive";
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
          tone === "positive" ? "bg-positive-bg text-positive" : "bg-white/10 text-gold"
        )}
      >
        <Icon size={19} />
      </div>
      <div>
        <div className="text-[11px] text-white/55">{label}</div>
        <div className="text-lg font-bold text-white tnum">{value}</div>
      </div>
    </div>
  );
}

const roundTargets = (income: number, s: SavingsStrategy) => ({
  needs: Math.round(income * s.ratios.needs),
  wants: Math.round(income * s.ratios.wants),
  savings: Math.round(income * s.ratios.savings),
});

export function SavingsAdvisor() {
  const account = useSelectedAccount("individuals");
  const { state: stratState, retry: retryStrat } = useApi<SavingsStrategiesResponse>(
    api.getSavingsStrategies,
    []
  );
  const { state: planState, retry: retryPlan } = useApi<SavingsPlanResponse>(
    () => api.getSavingsPlan(),
    [account]
  );

  // Step-1 goal collection state.
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [customGoal, setCustomGoal] = useState("");
  // Step-2 result state.
  const [advice, setAdvice] = useState<SavingsAdviceResponse | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(false);

  // A new account starts the whole flow over.
  useEffect(() => {
    setSelectedGoal(null);
    setCustomGoal("");
    setAdvice(null);
    setSelectedStrategy(null);
    setGenerating(false);
    setGenError(false);
  }, [account]);

  const generate = async () => {
    const goal = (selectedGoal ?? customGoal.trim()) || "";
    if (!goal) return;
    setGenerating(true);
    setGenError(false);
    try {
      const res = await api.getSavingsAdvice(goal);
      setAdvice(res);
      setSelectedStrategy(res.strategyKey);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setGenError(true);
    } finally {
      setGenerating(false);
    }
  };

  const restart = () => {
    setAdvice(null);
    setSelectedStrategy(null);
    setGenError(false);
  };

  if (stratState.status === "loading" || planState.status === "loading")
    return (
      <div className="px-5 md:px-8 py-10 max-w-6xl mx-auto" dir="rtl">
        <SectionLoading height={320} />
      </div>
    );
  if (stratState.status === "error")
    return (
      <div className="px-5 md:px-8 py-10 max-w-6xl mx-auto" dir="rtl">
        <SectionError onRetry={retryStrat} message={stratState.error} />
      </div>
    );
  if (planState.status === "error")
    return (
      <div className="px-5 md:px-8 py-10 max-w-6xl mx-auto" dir="rtl">
        <SectionError onRetry={retryPlan} message={planState.error} />
      </div>
    );

  const plan = planState.data;
  const { strategies, goals } = stratState.data;
  const strategyByKey = new Map(strategies.map((s) => [s.key, s]));

  const activeStrategy = selectedStrategy ? strategyByKey.get(selectedStrategy) : undefined;
  const targets = activeStrategy ? roundTargets(plan.income, activeStrategy) : plan.targets;
  const pct = activeStrategy
    ? {
        needs: Math.round(activeStrategy.ratios.needs * 100),
        wants: Math.round(activeStrategy.ratios.wants * 100),
        savings: Math.round(activeStrategy.ratios.savings * 100),
      }
    : plan.strategy.pct;

  const overrodeAI = advice != null && selectedStrategy != null && selectedStrategy !== advice.strategyKey;
  const goalReady = (selectedGoal ?? customGoal.trim()).length > 0;

  return (
    <div className="px-5 md:px-8 py-6 md:py-8 max-w-6xl mx-auto space-y-6" dir="rtl">
      <PageHeader
        eyebrow="خطتك نحو ادخار أذكى"
        title="مستشارك المالي والادخاري"
        subtitle="أخبر ALLaM بهدفك، وسيختار أنسب استراتيجية ادخار لك ويبنيها على أرقامك الحقيقية"
      />

      {/* ── Cash-flow summary (income vs obligations) ─────────────────────────── */}
      <Card reveal={false} className="relative overflow-hidden bg-espresso border-espresso p-6">
        <div className="pointer-events-none absolute -top-16 -start-10 w-64 h-64 rounded-full bg-gold/15 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-5">
            <Wallet size={16} className="text-gold" />
            <h3 className="text-white font-semibold text-sm">نظرة سريعة على تدفقك النقدي</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <SummaryStat icon={Wallet} label="الدخل الشهري" value={formatSAR(plan.income)} />
            <SummaryStat icon={TrendingDown} label="إجمالي الالتزامات" value={formatSAR(plan.obligations)} />
            <SummaryStat
              icon={PiggyBank}
              label="المتاح بعد الالتزامات"
              value={formatSAR(plan.disposableAfterObligations)}
              tone="positive"
            />
          </div>
        </div>
      </Card>

      {/* ══════════════ STEP 1 — GOAL COLLECTION ══════════════ */}
      {!advice && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
          <Card className="p-6 md:p-8">
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gold/15 flex items-center justify-center mx-auto mb-4">
                <Target size={26} className="text-gold" />
              </div>
              <h3 className="text-xl font-bold text-ink mb-1.5">ما هو هدفك المالي الأساسي؟</h3>
              <p className="text-sm text-ink-soft max-w-lg mx-auto leading-relaxed">
                لكل هدف استراتيجية ادخار مختلفة. اختر هدفك وسيحلّل ALLaM وضعك ويختار الأنسب لك.
              </p>
            </div>

            {/* Goal chips */}
            <div className="flex flex-wrap justify-center gap-2.5 mb-5">
              {goals.map((g) => {
                const active = selectedGoal === g.key;
                return (
                  <button
                    key={g.key}
                    onClick={() => {
                      setSelectedGoal(g.key);
                      setCustomGoal("");
                    }}
                    className={cn(
                      "px-4 py-2.5 rounded-full text-sm font-medium border transition-colors",
                      active
                        ? "bg-copper text-white border-copper shadow-[var(--shadow-sm)]"
                        : "bg-card text-ink border-line hover:border-copper/40"
                    )}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>

            {/* Custom goal */}
            <div className="max-w-md mx-auto">
              <label className="block text-xs text-ink-soft mb-1.5 text-center">أو اكتب هدفاً آخر</label>
              <input
                type="text"
                value={customGoal}
                onChange={(e) => {
                  setCustomGoal(e.target.value);
                  setSelectedGoal(null);
                }}
                placeholder="مثال: تكوين رأس مال لمشروع"
                className="w-full text-center rounded-2xl border border-line bg-card px-4 py-3 text-sm text-ink focus:border-copper/50 focus:outline-none"
              />
            </div>

            <div className="text-center mt-6">
              <Button size="lg" onClick={generate} disabled={!goalReady || generating}>
                {generating ? (
                  <>
                    <Loader2 size={17} className="animate-spin" /> يحلّل ALLaM هدفك ويبني خطتك…
                  </>
                ) : (
                  <>
                    <Sparkles size={17} /> ابدأ بناء خطتك الادخارية مع ALLaM
                  </>
                )}
              </Button>
              {genError && (
                <p className="text-xs text-negative mt-4">تعذّر توليد الخطة الآن، حاول مرة أخرى.</p>
              )}
            </div>
          </Card>
        </motion.div>
      )}

      {/* ══════════════ STEP 2 — RESULTS ══════════════ */}
      {advice && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="space-y-5"
        >
          {/* Strategy selector + AI recommendation */}
          <Card reveal={false} className="p-5 md:p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold text-copper mb-1">
                  <Sparkles size={13} /> اختيار ALLaM لهدفك
                </div>
                <h3 className="text-base font-bold text-ink">{activeStrategy?.name ?? plan.strategy.name}</h3>
                <p className="text-xs text-ink-soft mt-0.5">{activeStrategy?.tagline ?? plan.strategy.tagline}</p>
              </div>
              <div className="shrink-0">
                <label className="block text-[11px] text-ink-soft mb-1">جرّب استراتيجية أخرى</label>
                <div className="relative">
                  <select
                    value={selectedStrategy ?? plan.strategy.key}
                    onChange={(e) => setSelectedStrategy(e.target.value)}
                    className="appearance-none w-full md:w-72 rounded-2xl border border-line bg-card ps-4 pe-9 py-2.5 text-sm font-medium text-ink focus:border-copper/50 focus:outline-none cursor-pointer"
                  >
                    {strategies.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 text-ink-soft" />
                </div>
              </div>
            </div>
            {overrodeAI && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-gold/10 border border-gold/25 px-4 py-2.5">
                <span className="text-xs text-ink leading-relaxed">
                  عدّلت الاستراتيجية يدوياً. توصية ALLaM لهدفك كانت:{" "}
                  <span className="font-bold">{advice.strategyName}</span>
                </span>
                <button
                  onClick={() => setSelectedStrategy(advice.strategyKey)}
                  className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-copper hover:text-copper-dark"
                >
                  <RotateCcw size={13} /> استعادة توصية ALLaM
                </button>
              </div>
            )}
          </Card>

          {/* Bucket cards (targets recompute instantly from the selected strategy) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(["needs", "wants", "savings"] as BucketKey[]).map((key, i) => (
              <BucketCard
                key={key}
                bucketKey={key}
                pct={pct[key]}
                target={targets[key]}
                actual={plan.actuals[key]}
                index={i}
              />
            ))}
          </div>

          {/* AI narration */}
          <Card className="p-6 md:p-8">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-espresso flex items-center justify-center">
                <Sparkles size={17} className="text-gold" />
              </div>
              <div>
                <h3 className="text-base font-bold text-ink leading-none">خطتك الادخارية من ALLaM</h3>
                <span className="text-[11px] text-ink-soft">مبنية على هدفك وأرقامك الحقيقية</span>
              </div>
            </div>
            <p className="text-sm text-ink leading-loose whitespace-pre-line">{advice.advice}</p>
            <div className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-cream-deep px-3 py-1">
              <ShieldCheck size={12} className="text-copper shrink-0" />
              <span className="text-[10px] font-medium text-ink-soft">
                كل الأرقام محسوبة في النظام، لا يخترعها الذكاء الاصطناعي
              </span>
            </div>
          </Card>

          {/* Where to trim */}
          {plan.topDiscretionary.length > 0 && (
            <Card className="p-6 md:p-8">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown size={18} className="text-copper" />
                <h3 className="text-base font-bold text-ink">أين يمكنك التوفير؟</h3>
              </div>
              <p className="text-sm text-ink-soft mb-5">
                أكبر فئات إنفاقك غير الأساسي شهرياً — تقليلها يقرّبك من هدف الادخار.
              </p>
              <div className="space-y-2.5">
                {plan.topDiscretionary.map((cat, i) => (
                  <div
                    key={cat.name}
                    className="flex items-center justify-between rounded-2xl border border-line bg-card p-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-full bg-copper-tint text-copper-dark text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium text-ink">{cat.name}</span>
                    </div>
                    <span className="text-sm font-bold text-ink tnum">{formatNumber(cat.amount)} ر.س / شهر</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="text-center">
            <Button variant="ghost" size="md" onClick={restart}>
              <Target size={16} /> تغيير الهدف
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
