import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  Wallet,
  CheckCircle2,
  Star,
  MessageCircle,
  ArrowLeft,
  Landmark,
  Sparkles,
  PiggyBank,
  TrendingUp,
} from "lucide-react";
import type { Screen } from "../lib/data";
import { eligibility, user, banks, type MetricDetail } from "../lib/data";
import { api, type EligibilityResponse, type IndividualsOverview } from "../lib/api";
import { useApi } from "../lib/useApi";
import { formatSAR } from "../lib/utils";
import { useSelectedAccount } from "../lib/accountStore";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { CountUp } from "../components/CountUp";
import { EligibilityRing } from "../components/EligibilityRing";
import { ConcentricRings, type RingDatum } from "../components/ConcentricRings";
import { FloatingBadge } from "../components/FloatingBadge";
import { MetricDetailModal } from "../components/MetricDetailModal";
import { SectionLoading, SectionError } from "../components/AsyncStates";
import { RefreshButton, Toast, useRefresh } from "../components/RefreshControl";
import { IncomeSpendingChart } from "../components/charts/IncomeSpendingChart";
import { SpendingDonut } from "../components/charts/SpendingDonut";
import { EASE } from "../animations/variants";
import { cn } from "../lib/utils";

export function Dashboard({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [connected, setConnected] = useState(false);
  const [selectedBank, setSelectedBank] = useState(banks[0].id);
  const [financeType, setFinanceType] = useState<"personal" | "mortgage">("personal");
  const [detailKey, setDetailKey] = useState<MetricKey | null>(null);
  // Re-fetch whenever the account browser switches persona.
  const account = useSelectedAccount("individuals");
  const { state: overview, retry } = useApi(api.getIndividualsOverview, [account]);
  const { state: eligState } = useApi(api.getEligibility, [account]);
  const { spinning, toast, refresh } = useRefresh();

  // Live eligibility scores when ready; fall back to mock while loading/on error so
  // the ring never renders empty. Keeps the dashboard ring consistent with the
  // Eligibility screen (both now read the same getEligibility endpoint).
  const liveScores = eligState.status === "ready" ? eligState.data.scores : null;
  const score =
    financeType === "personal"
      ? liveScores?.personal ?? eligibility.personal
      : liveScores?.mortgage ?? eligibility.mortgage;
  const selectedBankName = banks.find((b) => b.id === selectedBank)?.name ?? banks[0].name;

  // Live persona data drives the modals, the advisor card, and the mission strip — so an open
  // modal re-renders with the new numbers the instant the account browser switches persona.
  const { state: roadmapState } = useApi(api.getIndividualsRoadmap, [account]);
  const liveElig = eligState.status === "ready" ? eligState.data : null;
  const details =
    overview.status === "ready"
      ? buildMetricDetails(overview.data.kpis, overview.data.metricBreakdowns, liveElig)
      : null;
  const progress = roadmapState.status === "ready" ? roadmapState.data.progress : null;

  return (
    <div className="p-5 md:p-8 space-y-6">
      {/* Greeting */}
      <PageHeader
        eyebrow="صورتك المالية"
        title={<>أهلاً، {user.name.split(" ")[0]} 👋</>}
        subtitle="هذه صورتك المالية لشهر يونيو 2025"
        end={
          <span className="inline-flex items-center gap-2.5">
            <span className="inline-flex items-center gap-2 bg-card border border-line rounded-full px-4 py-2 text-xs font-medium text-ink-soft shadow-[var(--shadow-sm)]">
              يونيو 2025
            </span>
            {connected && <RefreshButton spinning={spinning} onClick={() => refresh(retry)} />}
          </span>
        }
      />

      {/* Bank connection */}
      <AnimatePresence mode="wait">
        {!connected ? (
          <motion.div key="connect" exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
            {/* mt-12 lives on the Card (not the space-y wrapper) so it reliably adds
                room for the floating badge to fully clear the greeting above. */}
            <Card reveal={false} className="relative mt-12 bg-espresso border-espresso p-6 pt-12">
              <div className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden">
                <div className="absolute -bottom-16 -end-10 w-64 h-64 rounded-full bg-copper/25 blur-3xl" />
              </div>

              <FloatingBadge icon={Landmark} tone="gold" position="top-start" />

              <div className="relative">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 mb-6">
                  <div className="max-w-lg">
                    <div className="text-white font-bold text-lg mb-1.5">اربط حسابك البنكي</div>
                    <div className="text-white/60 text-sm leading-relaxed">
                      اختر بنكك ثم اربط حسابك بأمان عبر الخدمات المصرفية المفتوحة — صلاحية
                      قراءة فقط، وتلغيها متى شئت.
                    </div>
                  </div>
                  <Button onClick={() => setConnected(true)} className="shrink-0 whitespace-nowrap">
                    ربط حساب {selectedBankName}
                    <ArrowLeft size={17} />
                  </Button>
                </div>

                {/* Bank picker — Alinma (sponsor) always first and highlighted */}
                <div className="flex flex-wrap gap-2.5">
                  {banks.map((b) => {
                    const active = selectedBank === b.id;
                    return (
                      <button
                        key={b.id}
                        onClick={() => setSelectedBank(b.id)}
                        className={cn(
                          "relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border transition-colors",
                          active
                            ? "bg-gold text-espresso border-gold"
                            : "bg-white/5 text-white/75 border-white/15 hover:bg-white/10 hover:text-white"
                        )}
                      >
                        {active && <CheckCircle2 size={15} />}
                        {b.name}
                        {b.featured && (
                          <span
                            className={cn(
                              "text-[10px] font-bold px-2 py-0.5 rounded-full",
                              active ? "bg-espresso/10 text-espresso" : "bg-gold/20 text-gold"
                            )}
                          >
                            البنك الشريك
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>
          </motion.div>
        ) : (
          <motion.div key="connected" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <Card reveal={false} className="bg-positive-bg border-[#CDE6D6] p-4 flex items-center gap-3">
              <CheckCircle2 size={20} className="text-positive shrink-0" />
              <div>
                <div className="text-positive font-semibold text-sm">
                  تم ربط حساب {selectedBankName} بنجاح
                </div>
                <div className="text-positive/70 text-xs mt-0.5">
                  {user.account} · صلاحية قراءة فقط · آخر تحديث: الآن
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bento grid ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {connected && overview.status === "loading" && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <SectionLoading height={420} />
          </motion.div>
        )}
        {connected && overview.status === "error" && (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <SectionError onRetry={retry} />
          </motion.div>
        )}
        {connected && overview.status === "ready" && (
          <motion.div
            key="bento"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-5 [grid-auto-flow:dense]"
          >
            {(() => {
              const { kpis, series, categories } = overview.data;
              const maxCat = Math.max(...categories.map((c) => c.value));
              const ringData: RingDatum[] = categories.slice(0, 4).map((c) => ({
                label: c.name,
                amount: c.amount,
                color: c.color,
                value: Math.round((c.value / maxCat) * 100),
              }));

              return (
                <>
                  {/* Eligibility — dark hero stage (top-right in RTL) */}
                  <Card className="lg:col-span-4 lg:row-span-2 relative overflow-visible bg-espresso border-espresso p-6 flex flex-col">
                    <div className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden">
                      <div className="absolute -top-16 -start-12 w-56 h-56 rounded-full bg-copper/25 blur-3xl" />
                      <div className="absolute -bottom-20 -end-12 w-56 h-56 rounded-full bg-gold/12 blur-3xl" />
                    </div>
                    <div className="relative flex items-center justify-between mb-4">
                      <h3 className="font-bold text-white">الأهلية التمويلية</h3>
                      <SegmentToggle value={financeType} onChange={setFinanceType} />
                    </div>
                    <div className="relative flex-1 flex items-center justify-center py-4">
                      <EligibilityRing percentage={score} size={210} showTier onDark />
                    </div>
                    <p className="relative text-center text-sm text-white/65 mt-2 mb-4 leading-relaxed">
                      {financeType === "personal"
                        ? score >= 60
                          ? "أهليتك للتمويل الشخصي جيدة — تحسين بسيط يرفعها للمستوى الممتاز."
                          : "أهليتك للتمويل الشخصي تحتاج لتحسين — استعرض المسارات الذكية لرفعها."
                        : "أهليتك للتمويل العقاري تحتاج لتحسين قبل التقديم."}
                    </p>
                    <Button
                      className="relative w-full bg-gold text-espresso hover:bg-[#E7CBA0] shadow-none font-semibold"
                      onClick={() => onNavigate("eligibility")}
                    >
                      عرض المسارات الذكية
                      <ArrowLeft size={16} />
                    </Button>
                  </Card>

                  {/* Income vs spending — wide (with floating pill) */}
                  <Card className="lg:col-span-8 relative p-6">
                    <div className="absolute -top-3.5 start-8 z-20 bg-card border border-line rounded-full ps-2 pe-3.5 py-1.5 flex items-center gap-2 shadow-[var(--shadow-md)]">
                      <span className="w-6 h-6 rounded-full bg-positive-bg flex items-center justify-center">
                        <TrendingUp size={13} className="text-positive" />
                      </span>
                      <span className="text-xs font-semibold text-ink">
                        صافي التدفق{" "}
                        <span className="text-positive tnum">
                          +{(kpis.income - kpis.spending).toLocaleString("en-US")} ر.س
                        </span>
                      </span>
                    </div>

                    <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                      <h3 className="font-bold text-ink pt-1">الدخل مقابل الإنفاق</h3>
                      <div className="flex gap-5">
                        <InlineStat label="الدخل" value={kpis.income} up icon={ArrowDownRight} />
                        <InlineStat label="الإنفاق" value={kpis.spending} icon={ArrowUpRight} />
                      </div>
                    </div>
                    <IncomeSpendingChart height={230} data={series} />
                    <p className="text-xs text-ink-soft mt-3">
                      دخلك مستقر منذ 6 أشهر، وقفزة الإنفاق الوحيدة كانت في مايو (+18٪ تسوّق) وعادت
                      للانتظام — إشارة صحية.
                    </p>
                  </Card>

                  {/* KPI cards with consultative drill-down */}
                  <StatCard
                    className="lg:col-span-4"
                    label="الالتزامات الشهرية"
                    value={kpis.commitments}
                    icon={CreditCard}
                    trend="neutral"
                    delay={0.1}
                    onDetails={() => setDetailKey("commitments")}
                  />
                  <StatCard
                    className="lg:col-span-4"
                    label="إجمالي القروض"
                    value={kpis.loans}
                    icon={Wallet}
                    trend="neutral"
                    delay={0.15}
                    onDetails={() => setDetailKey("loans")}
                  />

                  {/* Concentric rings — tall */}
                  <Card className="lg:col-span-4 lg:row-span-2 relative p-6">
                    <FloatingBadge icon={PiggyBank} tone="copper" position="top-end" size={46} />
                    <h3 className="font-bold text-ink mb-1">أكبر بنود الإنفاق</h3>
                    <p className="text-xs text-ink-soft mb-5">توزيع طبقي لأعلى أربع فئات</p>
                    <div className="flex justify-center py-2">
                      <ConcentricRings data={ringData} size={210} />
                    </div>
                  </Card>

                  {/* Donut */}
                  <Card className="lg:col-span-4 p-6">
                    <h3 className="font-bold text-ink mb-3">توزيع الإنفاق</h3>
                    <div className="relative">
                      <SpendingDonut height={190} data={categories} />
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <div className="text-xl font-bold text-ink">
                          <CountUp value={kpis.spending} />
                        </div>
                        <div className="text-[11px] text-ink-soft">ر.س إجمالي</div>
                      </div>
                    </div>
                  </Card>

                  {/* Advisor — dark accent card */}
                  <Card reveal className="lg:col-span-4 relative overflow-hidden bg-espresso border-espresso p-5">
                    <div className="pointer-events-none absolute -top-10 -end-6 w-44 h-44 rounded-full bg-copper/25 blur-3xl" />
                    <div className="relative">
                      <div className="flex items-center gap-2.5 mb-3">
                        <div className="w-9 h-9 rounded-xl bg-gold/15 flex items-center justify-center">
                          <MessageCircle size={16} className="text-gold" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">توصية المستشار</div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-positive" />
                            <span className="text-[11px] text-white/50">محدّثة الآن</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-white/70 leading-relaxed">
                        {buildAdvisorLine(liveElig)}
                      </p>
                      <button
                        onClick={() => onNavigate("chat")}
                        className="mt-3 inline-flex items-center gap-1 text-sm text-gold font-semibold hover:gap-2 transition-all"
                      >
                        المحادثة الكاملة <ArrowLeft size={15} />
                      </button>
                    </div>
                  </Card>

                  {/* Mission progress — real per-account roadmap state (Part 3 engine) */}
                  <Card className="lg:col-span-4 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Star size={16} className="text-copper" />
                        <span className="text-sm font-bold text-ink">مسار تحسين أهليتك</span>
                      </div>
                      <span className="text-xs text-ink-soft bg-cream-deep px-2.5 py-1 rounded-full tnum">
                        {progress ? `${progress.completedCount} / ${progress.totalSteps}` : "لم يبدأ"}
                      </span>
                    </div>
                    <div className="h-2.5 bg-cream-deep rounded-full overflow-hidden mb-2.5">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: "linear-gradient(to left, var(--copper), var(--copper-light))" }}
                        initial={{ width: 0 }}
                        animate={{ width: `${progress ? progress.percent : 0}%` }}
                        transition={{ duration: 1.2, ease: EASE, delay: 0.2 }}
                      />
                    </div>
                    <p className="text-xs text-ink-soft leading-relaxed">
                      {progress
                        ? `أكملت ${progress.completedCount} من ${progress.totalSteps} خطوات في مسار «${progress.plan.title}».`
                        : "لم تفعّل أي مسار بعد — استعرض المسارات الذكية لبدء رحلة تحسين أهليتك."}
                    </p>
                  </Card>

                  {/* Savings insight */}
                  <Card className="lg:col-span-4 p-5 flex items-center gap-4 bg-copper-tint/50 border-copper/15">
                    <div className="w-11 h-11 rounded-xl bg-copper flex items-center justify-center shrink-0">
                      <Sparkles size={20} className="text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-ink">
                        معدّل ادخارك{" "}
                        <span className="text-copper">
                          <CountUp value={kpis.savingsRate} suffix="٪" />
                        </span>
                      </div>
                      <div className="text-xs text-ink-soft mt-0.5">أعلى من متوسط الأشهر السابقة — استمر!</div>
                    </div>
                  </Card>
                </>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      <MetricDetailModal
        detail={detailKey && details ? details[detailKey] : null}
        open={detailKey !== null}
        onClose={() => setDetailKey(null)}
      />
      <Toast show={toast} label="تم تحديث البيانات" />
    </div>
  );
}

type MetricKey = "commitments" | "loans";

/**
 * Build the two "لماذا هذا الرقم؟" drill-downs from live persona data (real Python numbers).
 * Degrades gracefully: uses the fine-grained `metricBreakdowns` when the overview payload carries
 * it, otherwise derives a truthful breakdown from the eligibility figures (which always include the
 * real obligation numbers) and finally the overview `kpis`. So the modal is never empty when the
 * overview is ready — even against an older backend payload that predates `metricBreakdowns`.
 */
function buildMetricDetails(
  kpis: IndividualsOverview["kpis"],
  mb: IndividualsOverview["metricBreakdowns"] | undefined,
  elig: EligibilityResponse | null
): Record<MetricKey, MetricDetail> {
  const capPct =
    elig?.grossSalary && elig?.salaryCapSar
      ? Math.round((elig.salaryCapSar / elig.grossSalary) * 1000) / 10
      : null;

  const fmtRows = (rows: { label: string; value: number }[]) =>
    rows.filter((r) => r.value > 0).map((r) => ({ label: r.label, value: formatSAR(r.value) }));

  // The fine 3-way split (mortgage / other loans / card) is only shown when the overview payload
  // carries `metricBreakdowns` — it reconciles EXACTLY to the commitments KPI (existing obligations).
  // Without it we fall back to a single honest total row; we deliberately do NOT derive the split
  // from the eligibility figures, because those INCLUDE the requested-loan installment and so would
  // not reconcile with the commitments card.
  let commitmentRows = mb
    ? fmtRows([
        { label: "قسط الرهن العقاري", value: mb.commitments.mortgage },
        { label: "أقساط القروض الأخرى", value: mb.commitments.otherLoans },
        { label: "الحد الأدنى للبطاقة الائتمانية", value: mb.commitments.cardMin },
      ])
    : [];
  if (commitmentRows.length === 0)
    commitmentRows = [{ label: "إجمالي الالتزامات الشهرية", value: formatSAR(kpis.commitments) }];

  const requested = mb ? mb.loans.requested : kpis.loans;
  const loanRows = [
    requested > 0
      ? { label: "مبلغ التمويل المطلوب", value: formatSAR(requested) }
      : { label: "التمويل المطلوب", value: "لا يوجد طلب حالياً" },
    ...(mb?.loans.rate != null ? [{ label: "معدل الفائدة", value: `${mb.loans.rate}٪` }] : []),
    ...(mb && mb.loans.term > 0 ? [{ label: "مدة التمويل", value: `${mb.loans.term} شهراً` }] : []),
  ];

  return {
    commitments: {
      title: "الالتزامات الشهرية",
      explanation:
        "مجموع ما يُستقطع من دخلك شهرياً لسداد أقساطك. هذا الرقم هو الأساس الذي تُحسب منه نسبة استقطاعك (DBR) — وكلما انخفض، ارتفعت أهليتك.",
      breakdown: commitmentRows,
      advice:
        elig != null && capPct != null
          ? `نسبة التزامك من الراتب ${elig.currentDbr}٪ مقابل حد ساما ${capPct}٪ — ${
              elig.currentDbr > capPct ? "خفضها يرفع أهليتك مباشرةً." : "وهي ضمن الحد المسموح."
            }`
          : "خفض التزاماتك الشهرية يخفض نسبة استقطاعك ويرفع أهليتك.",
    },
    loans: {
      title: "إجمالي القروض القائمة",
      explanation:
        "التمويل الذي طلبته أو القائم عليك. يحدد قدرتك على إعادة الهيكلة والسداد المبكر، ويدخل قسطه في حساب نسبة الاستقطاع.",
      breakdown: loanRows,
      advice:
        elig != null
          ? elig.eligible
            ? `أقصى مبلغ يمكنك طلبه الآن وفق حدود ساما هو ${formatSAR(elig.currentAvailable)}.`
            : `طلبك الحالي يتجاوز حدود ساما. لو طلبت ${formatSAR(elig.currentAvailable)} بدلاً منه (مع بقاء التزاماتك الأخرى كما هي) لكنت ضمن الحد المسموح.`
          : "سداد مبكر بسيط لأصل قرضك يخفض قسطك الشهري — أسرع أثر ممكن على أهليتك.",
    },
  };
}

/** Deterministic advisor recommendation line, built from the selected persona's real numbers. */
function buildAdvisorLine(elig: EligibilityResponse | null): string {
  if (!elig) return "جارٍ تحليل وضعك المالي…";
  const capPct =
    elig.grossSalary && elig.salaryCapSar
      ? Math.round((elig.salaryCapSar / elig.grossSalary) * 1000) / 10
      : 33.33;
  return elig.eligible
    ? `نسبة التزامك من الراتب ${elig.currentDbr}٪ ضمن حد ساما (${capPct}٪). أقصى مبلغ يمكنك طلبه الآن ${formatSAR(elig.currentAvailable)}.`
    : `نسبة التزامك من الراتب ${elig.currentDbr}٪ — أعلى من حد ساما (${capPct}٪). استعرض المسارات الذكية لخفضها ورفع سقف تمويلك.`;
}

function InlineStat({
  label,
  value,
  up = false,
  icon: Icon,
}: {
  label: string;
  value: number;
  up?: boolean;
  icon: typeof ArrowUpRight;
}) {
  return (
    <div className="text-start">
      <div className="flex items-center gap-1">
        <Icon size={14} className={up ? "text-positive" : "text-copper"} />
        <span className="text-lg font-bold text-ink">
          <CountUp value={value} />
        </span>
      </div>
      <div className="text-[11px] text-ink-soft mt-0.5">{label}</div>
    </div>
  );
}

function SegmentToggle({
  value,
  onChange,
}: {
  value: "personal" | "mortgage";
  onChange: (v: "personal" | "mortgage") => void;
}) {
  const opts = [
    { id: "personal" as const, label: "شخصي" },
    { id: "mortgage" as const, label: "عقاري" },
  ];
  return (
    <div className="relative flex bg-white/8 rounded-full p-0.5 text-xs border border-white/10">
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "relative px-3 py-1.5 rounded-full font-medium transition-colors z-10",
            value === o.id ? "text-espresso" : "text-white/60 hover:text-white"
          )}
        >
          {value === o.id && (
            <motion.span
              layoutId="finance-toggle"
              className="absolute inset-0 bg-gold rounded-full shadow-[var(--shadow-sm)]"
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
