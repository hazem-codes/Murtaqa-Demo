import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Calculator,
  FlaskConical,
  CheckCircle2,
  XCircle,
  Sparkles,
  Landmark,
  Building2,
  Home,
} from "lucide-react";
import { api, type WhatIfFinancingType, type WhatIfSimulationResponse } from "../lib/api";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { SectionError } from "../components/AsyncStates";
import { EASE } from "../animations/variants";
import { cn, formatSAR } from "../lib/utils";

const FINANCING_TYPES: { id: WhatIfFinancingType; label: string; icon: typeof Landmark }[] = [
  { id: "personal", label: "تمويل شخصي", icon: Landmark },
  { id: "mortgage", label: "تمويل عقاري", icon: Home },
  { id: "commercial", label: "تمويل تجاري", icon: Building2 },
];

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(2).replace(/\.00$/, "")}٪`;
}

/**
 * A dedicated, clearly-separate hypothetical calculator (Part 4). Unlike the live Eligibility
 * screen (which always reflects the account's REAL requested loan), everything on this page is
 * user-entered and explicitly labeled SIMULATION — it never reads or writes the real profile.
 */
export function WhatIfSimulator() {
  const [amount, setAmount] = useState("200000");
  const [termYears, setTermYears] = useState("5");
  const [financingType, setFinancingType] = useState<WhatIfFinancingType>("personal");
  const [activateStrategies, setActivateStrategies] = useState(false);
  const [result, setResult] = useState<WhatIfSimulationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNum = Number(amount);
  const termNum = Number(termYears);
  const validInputs = amountNum > 0 && termNum > 0;

  const runSimulation = async () => {
    if (!validInputs) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.getWhatIfSimulation(amountNum, termNum, financingType, activateStrategies);
      setResult(r);
    } catch {
      setError("تعذّر إجراء الحساب. حاول مجدداً.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-5 md:px-8 py-6 md:py-8 max-w-5xl mx-auto space-y-6" dir="rtl">
      <PageHeader
        eyebrow="أداة منفصلة عن أهليتك الحقيقية"
        title="حاسبة الأهلية الافتراضية"
        subtitle="جرّب أرقاماً افتراضية بالكامل — لا تؤثر على طلبك أو بياناتك الفعلية"
      />

      {/* Loud, persistent simulation banner — never let this be mistaken for real eligibility */}
      <div className="flex items-center gap-3 rounded-2xl bg-gold/15 border border-gold/40 px-4 py-3">
        <FlaskConical size={18} className="text-copper shrink-0" />
        <span className="text-sm font-semibold text-copper-dark">
          محاكاة — ليست بياناتك الفعلية. كل الأرقام هنا افتراضية ولا تُرسل أي طلب حقيقي.
        </span>
      </div>

      {/* Inputs */}
      <Card reveal={false} className="p-5 md:p-6 space-y-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-copper-tint text-copper flex items-center justify-center shrink-0">
            <Calculator size={16} />
          </div>
          <h3 className="text-sm font-bold text-ink">أدخل سيناريو افتراضي</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1.5">مبلغ التمويل المطلوب (ر.س)</label>
            <input
              type="number"
              min={1}
              step={1000}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-ink tnum focus:outline-none focus:border-copper/60"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1.5">المدة (سنوات)</label>
            <input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={termYears}
              onChange={(e) => setTermYears(e.target.value)}
              className="w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-ink tnum focus:outline-none focus:border-copper/60"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-soft mb-2">نوع التمويل</label>
          <div className="flex flex-wrap gap-2">
            {FINANCING_TYPES.map((t) => {
              const Icon = t.icon;
              const active = financingType === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setFinancingType(t.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border transition-colors",
                    active
                      ? "bg-copper text-white border-copper"
                      : "bg-card text-ink-soft border-line hover:border-copper/40"
                  )}
                >
                  <Icon size={15} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-line bg-cream-deep/50 px-4 py-3 cursor-pointer">
          <input
            type="checkbox"
            checked={activateStrategies}
            onChange={(e) => setActivateStrategies(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-copper shrink-0"
          />
          <span>
            <span className="block text-sm font-semibold text-ink">تفعيل المسارات الذكية لهذه البيانات؟</span>
            <span className="block text-xs text-ink-soft mt-0.5 leading-relaxed">
              لو كان السيناريو الافتراضي غير مؤهل، شغّل نفس محرك المسارات الثلاثة (المكثّف/المركّز/المتوازن)
              على هذه الأرقام الافتراضية بدل طلبك الحقيقي.
            </span>
          </span>
        </label>

        <Button onClick={runSimulation} disabled={!validInputs || loading} className="w-full sm:w-auto">
          <Sparkles size={16} /> {loading ? "جارٍ الحساب…" : "احسب الأهلية الافتراضية"}
        </Button>
      </Card>

      {error && <SectionError onRetry={runSimulation} message={error} />}

      <AnimatePresence>
        {result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="space-y-6"
          >
            {/* Simulation-labeled hero, styled like the real Eligibility hero but unmistakably marked */}
            <Card className="relative bg-espresso border-espresso p-6 md:p-8">
              <div className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden">
                <div className="absolute -top-20 -start-16 w-72 h-72 rounded-full bg-copper/25 blur-3xl" />
              </div>
              <div className="relative">
                <span className="inline-flex items-center gap-1.5 bg-gold/20 border border-gold/40 text-gold text-xs font-bold px-3 py-1 rounded-full mb-4">
                  <FlaskConical size={12} /> {result.simulationLabel}
                </span>
                <h3 className="text-xl md:text-2xl font-bold text-white mb-2">
                  {result.eligible ? "السيناريو الافتراضي: مؤهل" : "السيناريو الافتراضي: غير مؤهل"}
                </h3>
                <p className="text-white/65 text-sm leading-relaxed mb-6">
                  عند طلب {formatSAR(result.inputs.amount)} كـ
                  {FINANCING_TYPES.find((t) => t.id === result.inputs.financingType)?.label} لمدة{" "}
                  {result.inputs.termYears} سنة{result.inputs.termClampedTo60Months && " (خُفّضت إلى 60 شهراً وفق سقف ساما)"}
                  ، بمعدل فائدة افتراضي {result.inputs.assumedRatePct}٪، تصبح نسبة عبء دينك{" "}
                  <span className="font-bold text-gold tnum">{result.currentDbr}٪</span>.
                </p>
                {result.financingTypeNote && (
                  <p className="text-white/50 text-xs leading-relaxed mb-4 border-t border-white/10 pt-3">
                    {result.financingTypeNote}
                  </p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {result.metrics.map((m) => (
                    <div key={m.label} className="bg-white/6 border border-white/10 rounded-2xl p-3.5 text-center">
                      <div className={cn("text-lg font-bold tnum", m.tone === "warn" ? "text-gold" : "text-white")}>
                        {m.value}
                      </div>
                      <div className="text-xs text-white/55 mt-1 leading-relaxed">{m.label}</div>
                    </div>
                  ))}
                </div>
                {/* Part 6 — persistent, honest rate-market note (real dataset range, not a live feed). */}
                <p className="text-[11px] text-white/45 leading-relaxed mt-3">
                  النطاق السائد لمعدلات الفائدة تقريباً {result.rateRangeLowPct}٪–{result.rateRangeHighPct}٪
                  تقديري حسب البنوك المختلفة. {result.rateMarketNote}
                </p>
              </div>
            </Card>

            {/* The 3 SAMA gates for this hypothetical scenario */}
            {result.testResults.length === 3 && (
              <Card reveal={false} className="p-5 md:p-6">
                <h3 className="text-sm font-bold text-ink mb-4">اختبارات ساما الثلاثة (للسيناريو الافتراضي)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {result.testResults.map((t) => (
                    <div
                      key={t.id}
                      className={cn(
                        "rounded-2xl border p-4 flex flex-col gap-2",
                        t.passed ? "bg-positive-bg border-[#CDE6D6]" : "bg-negative-bg border-[#F0C9C9]"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-ink-soft leading-snug">{t.label}</span>
                        {t.passed ? (
                          <CheckCircle2 size={16} className="text-positive shrink-0" />
                        ) : (
                          <XCircle size={16} className="text-negative shrink-0" />
                        )}
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className={cn("text-xl font-bold tnum", t.passed ? "text-positive" : "text-negative")}>
                          {pct(t.calculatedRatio)}
                        </span>
                        <span className="text-xs text-ink-soft">من حد {pct(t.allowedLimit)}</span>
                      </div>
                      {!t.passed && t.overageSar > 0 && (
                        <div className="text-[11px] text-negative/80">
                          يلزم تخفيض ~{formatSAR(t.overageSar)} شهرياً
                        </div>
                      )}
                      {/* Part 8 — clarify the numerator is the installment, not the entered amount. */}
                      {result.newLoanInstallmentSar > 0 && (
                        <div className="text-[11px] text-ink-soft leading-relaxed bg-white/50 rounded-lg px-2.5 py-1.5">
                          يُحتسب هنا <span className="font-semibold">القسط الشهري التقديري</span> لهذا
                          المبلغ الافتراضي، وقدره{" "}
                          <span className="font-semibold tnum">{formatSAR(result.newLoanInstallmentSar)}</span>{" "}
                          شهرياً — وليس مبلغ التمويل الذي أدخلته كاملاً.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Strategy paths — reused engine, same card language as the real Eligibility screen */}
            {result.strategiesActivated && (
              <Card reveal={false} className="p-5 md:p-6">
                <h3 className="text-sm font-bold text-ink mb-1">
                  المسارات الذكية على السيناريو الافتراضي
                </h3>
                {result.strategiesNote ? (
                  <p className="text-xs text-ink-soft leading-relaxed mt-2">{result.strategiesNote}</p>
                ) : result.paths.length === 0 ? (
                  <p className="text-xs text-ink-soft leading-relaxed mt-2">
                    لا توجد مسارات لعرضها لهذا السيناريو.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    {result.paths.map((p) => (
                      <div key={p.id} className="rounded-2xl border border-line bg-cream-deep/40 p-4 flex flex-col gap-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-ink">{p.title}</span>
                          {p.recommended && (
                            <span className="text-[10px] font-bold text-copper bg-copper-tint px-2 py-0.5 rounded-full shrink-0">
                              موصى به
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-ink-soft leading-relaxed">{p.summary}</p>
                        {p.outcome && (
                          <div className="text-xs font-medium text-copper-dark bg-gold/10 rounded-lg px-2.5 py-1.5">
                            {p.outcome}
                          </div>
                        )}
                        {p.targetDbr != null && (
                          <div className="text-xs text-ink-soft">
                            نسبة مستهدفة (افتراضية): <span className="font-bold text-ink tnum">{p.targetDbr}٪</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            <p className="text-[11px] text-ink-soft leading-relaxed">{result.disclaimer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
