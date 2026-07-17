import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Construction,
  Landmark,
  ShieldCheck,
  TrendingUp,
  Waves,
} from "lucide-react";
import type { Screen, UserMode } from "../lib/data";
import { business, banks, metricDetails, type MetricDetail, type ReadinessCriterion } from "../lib/data";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useSelectedAccount } from "../lib/accountStore";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { CountUp } from "../components/CountUp";
import { EligibilityRing } from "../components/EligibilityRing";
import { FloatingBadge } from "../components/FloatingBadge";
import { MetricDetailModal } from "../components/MetricDetailModal";
import { SectionLoading, SectionError } from "../components/AsyncStates";
import { RefreshButton, Toast, useRefresh } from "../components/RefreshControl";
import { IncomeSpendingChart } from "../components/charts/IncomeSpendingChart";
import { SpendingDonut } from "../components/charts/SpendingDonut";
import { EASE } from "../animations/variants";
import { cn } from "../lib/utils";

/** Upcoming cash obligations — the operational view individuals don't have. */
const upcomingObligations = [
  { label: "رواتب يوليو", amount: "69,300 ر.س", date: "27 يوليو", risk: false },
  { label: "دفعة المورد الرئيسي", amount: "46,000 ر.س", date: "10 أغسطس", risk: true },
  { label: "إيجار الربع الثالث", amount: "34,500 ر.س", date: "1 أغسطس", risk: false },
];

const criterionIcon: Record<ReadinessCriterion["status"], { icon: typeof CheckCircle2; cls: string }> = {
  pass: { icon: CheckCircle2, cls: "text-positive" },
  watch: { icon: AlertTriangle, cls: "text-gold" },
  fail: { icon: AlertTriangle, cls: "text-negative" },
};

export function BusinessDashboard({
  onNavigate,
  onSelectMode,
}: {
  onNavigate: (s: Screen) => void;
  onSelectMode?: (m: UserMode) => void;
}) {
  const [connected, setConnected] = useState(false);
  const [selectedBank, setSelectedBank] = useState(banks[0].id);
  const [detail, setDetail] = useState<MetricDetail | null>(null);
  // Part 12 — shown immediately on EVERY visit to this screen (not just once per session):
  // independent of the overview fetch below, and re-armed on every mount (App.tsx remounts this
  // component on every navigation into "dashboard", including leaving and coming back).
  const [showDevNotice, setShowDevNotice] = useState(true);
  const account = useSelectedAccount("business");
  const { state: overview, retry } = useApi(api.getBusinessOverview, [account]);
  const { spinning, toast, refresh } = useRefresh();

  const selectedBankName = banks.find((b) => b.id === selectedBank)?.name ?? banks[0].name;

  const dismissDevNotice = () => setShowDevNotice(false);

  const goToIndividuals = () => {
    dismissDevNotice();
    onSelectMode?.("individuals");
    onNavigate("dashboard");
  };

  return (
    <div className="p-5 md:p-8 space-y-6">
      <Modal
        open={showDevNotice}
        onClose={dismissDevNotice}
        title="مسار الأعمال قيد التطوير"
        subtitle="لا يزال هذا المسار غير مكتمل الوظائف كما هو مخطط له"
      >
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gold/15 flex items-center justify-center shrink-0">
            <Construction size={18} className="text-gold" />
          </div>
          <p className="text-sm text-ink-soft leading-relaxed">
            نعمل حالياً على تطوير مسار المنشآت الصغيرة والمتوسطة، وقد تجد بعض الشاشات أو الأرقام
            غير مكتملة بعد. مسار الأفراد جاهز بالكامل ومبني على المحركات الحقيقية — ننصحك بتجربته
            للحصول على تجربة تعكس رؤية مُرتقى كاملةً.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2.5">
          <Button onClick={goToIndividuals} className="flex-1">
            الانتقال إلى مسار الأفراد
            <ArrowLeft size={16} />
          </Button>
          <Button variant="secondary" onClick={dismissDevNotice} className="flex-1">
            متابعة مسار الأعمال
          </Button>
        </div>
      </Modal>

      <PageHeader
        eyebrow="صحة أعمالك المالية"
        title={<>أهلاً، {business.name}</>}
        subtitle={`${business.sector} · قراءة يونيو 2025`}
        end={
          <span className="inline-flex items-center gap-2.5">
            <span className="inline-flex items-center gap-2 bg-card border border-line rounded-full px-4 py-2 text-xs font-medium text-ink-soft shadow-[var(--shadow-sm)]">
              الربع الثاني · 2025
            </span>
            {connected && <RefreshButton spinning={spinning} onClick={() => refresh(retry)} />}
          </span>
        }
      />

      {/* Business account connection */}
      <AnimatePresence mode="wait">
        {!connected ? (
          <motion.div key="connect" exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
            <Card reveal={false} className="relative mt-12 bg-espresso border-espresso p-6 pt-12">
              <div className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden">
                <div className="absolute -bottom-16 -end-10 w-64 h-64 rounded-full bg-copper/25 blur-3xl" />
              </div>
              <FloatingBadge icon={Landmark} tone="gold" position="top-start" />
              <div className="relative">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 mb-6">
                  <div className="max-w-lg">
                    <div className="text-white font-bold text-lg mb-1.5">اربط حساب أعمالك</div>
                    <div className="text-white/60 text-sm leading-relaxed">
                      اربط الحساب الجاري لمنشأتك عبر الخدمات المصرفية المفتوحة، ليقرأ مُرتقى
                      تدفقاتك النقدية كما هي ويقيس جاهزيتك للتمويل.
                    </div>
                  </div>
                  <Button onClick={() => setConnected(true)} className="shrink-0 whitespace-nowrap">
                    ربط حساب {selectedBankName}
                    <ArrowLeft size={17} />
                  </Button>
                </div>
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
                  تم ربط حساب الأعمال لدى {selectedBankName} بنجاح
                </div>
                <div className="text-positive/70 text-xs mt-0.5">
                  الحساب الجاري للمنشأة · صلاحية قراءة فقط · آخر تحديث: الآن
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Business bento ─────────────────────────────────────────────── */}
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
              const { kpis, series, categories, readiness } = overview.data;
              return (
                <>
                  {/* Financing readiness — the business hero stage */}
                  <Card className="lg:col-span-4 lg:row-span-2 relative overflow-visible bg-espresso border-espresso p-6 flex flex-col">
                    <div className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden">
                      <div className="absolute -top-16 -start-12 w-56 h-56 rounded-full bg-copper/25 blur-3xl" />
                      <div className="absolute -bottom-20 -end-12 w-56 h-56 rounded-full bg-gold/12 blur-3xl" />
                    </div>
                    <div className="relative flex items-center justify-between mb-4">
                      <h3 className="font-bold text-white">جاهزية التمويل</h3>
                      <span className="inline-flex items-center gap-1.5 bg-white/8 border border-white/15 text-gold text-xs font-bold px-3 py-1 rounded-full">
                        {readiness.statusWord}
                      </span>
                    </div>
                    <div className="relative flex items-center justify-center py-3">
                      <EligibilityRing percentage={readiness.score} size={180} label="من 100" onDark />
                    </div>
                    {/* The three SME criteria at a glance */}
                    <div className="relative space-y-2.5 mt-3 mb-5">
                      {readiness.criteria.map((c) => {
                        const meta = criterionIcon[c.status];
                        return (
                          <div key={c.id} className="flex items-center gap-2.5 text-xs text-white/75">
                            <meta.icon size={15} className={cn("shrink-0", meta.cls)} />
                            <span className="flex-1 leading-snug">{c.label}</span>
                          </div>
                        );
                      })}
                    </div>
                    <Button
                      className="relative w-full bg-gold text-espresso hover:bg-[#E7CBA0] shadow-none font-semibold"
                      onClick={() => onNavigate("eligibility")}
                    >
                      خطة الجاهزية الكاملة
                      <ArrowLeft size={16} />
                    </Button>
                  </Card>

                  {/* Revenue vs operating expenses — wide */}
                  <Card className="lg:col-span-8 relative p-6">
                    <div className="absolute -top-3.5 start-8 z-20 bg-card border border-line rounded-full ps-2 pe-3.5 py-1.5 flex items-center gap-2 shadow-[var(--shadow-md)]">
                      <span className="w-6 h-6 rounded-full bg-positive-bg flex items-center justify-center">
                        <Waves size={13} className="text-positive" />
                      </span>
                      <span className="text-xs font-semibold text-ink">
                        صافي التدفق{" "}
                        <span className="text-positive tnum">
                          +{kpis.netCashflow.toLocaleString("en-US")} ر.س
                        </span>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                      <h3 className="font-bold text-ink pt-1">الإيرادات مقابل المصروفات التشغيلية</h3>
                      <div className="flex gap-5">
                        <InlineStat label="الإيرادات" value={kpis.revenue} up icon={ArrowDownRight} />
                        <InlineStat label="المصروفات" value={kpis.expenses} icon={ArrowUpRight} />
                      </div>
                    </div>
                    <IncomeSpendingChart
                      height={230}
                      data={series}
                      incomeName="الإيرادات"
                      spendingName="المصروفات"
                    />
                    <p className="text-xs text-ink-soft mt-3">
                      6 أشهر موجبة متتالية بنموّ +6٪ شهرياً — ويتوقع مُرتقى ضغطاً موسمياً على
                      التدفق في أغسطس. التفاصيل في خطة الجاهزية.
                    </p>
                  </Card>

                  {/* KPI cards with drill-down */}
                  <StatCard
                    className="lg:col-span-4"
                    label="صافي التدفق النقدي التشغيلي"
                    value={kpis.netCashflow}
                    icon={Banknote}
                    trend="up"
                    deltaLabel="+6٪"
                    delay={0.1}
                    onDetails={() => setDetail(metricDetails.bizCashflow)}
                  />
                  <StatCard
                    className="lg:col-span-4"
                    label="أشهر الأمان النقدي"
                    value={kpis.runwayMonths}
                    decimals={1}
                    suffix="شهر"
                    icon={ShieldCheck}
                    trend="down"
                    polarity="good"
                    deltaLabel="تحت الحد"
                    delay={0.15}
                    onDetails={() => setDetail(metricDetails.bizRunway)}
                  />

                  {/* Timing verdict — the business advisor's headline answer */}
                  <Card reveal className="lg:col-span-4 lg:row-span-2 relative overflow-hidden bg-espresso border-espresso p-6 flex flex-col">
                    <div className="pointer-events-none absolute -top-10 -end-6 w-44 h-44 rounded-full bg-gold/15 blur-3xl" />
                    <div className="relative flex-1">
                      <div className="flex items-center gap-2.5 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-gold/15 flex items-center justify-center">
                          <CalendarClock size={18} className="text-gold" />
                        </div>
                        <div className="text-sm font-bold text-white">توقيت قرار التمويل</div>
                      </div>
                      <div className="text-lg font-bold text-gold leading-snug mb-3">
                        {readiness.timing.verdict}
                      </div>
                      <p className="text-sm text-white/70 leading-relaxed">{readiness.timing.detail}</p>
                    </div>
                    <button
                      onClick={() => onNavigate("chat")}
                      className="relative mt-4 inline-flex items-center gap-1 text-sm text-gold font-semibold hover:gap-2 transition-all self-start"
                    >
                      اسأل مستشار الأعمال <ArrowLeft size={15} />
                    </button>
                  </Card>

                  {/* Expense distribution donut */}
                  <Card className="lg:col-span-4 p-6">
                    <h3 className="font-bold text-ink mb-3">توزيع المصروفات التشغيلية</h3>
                    <div className="relative">
                      <SpendingDonut height={190} data={categories} />
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <div className="text-xl font-bold text-ink">
                          <CountUp value={kpis.expenses} />
                        </div>
                        <div className="text-[11px] text-ink-soft">ر.س شهرياً</div>
                      </div>
                    </div>
                  </Card>

                  {/* Upcoming obligations — operational cash calendar */}
                  <Card className="lg:col-span-4 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-ink">مستحقات قادمة</h3>
                      <span className="text-xs text-ink-soft bg-cream-deep px-2.5 py-1 rounded-full">
                        60 يوماً
                      </span>
                    </div>
                    <div className="space-y-3">
                      {upcomingObligations.map((o) => (
                        <div key={o.label} className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={cn(
                                "w-2 h-2 rounded-full shrink-0",
                                o.risk ? "bg-warn" : "bg-positive"
                              )}
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-ink truncate">{o.label}</div>
                              <div className="text-[11px] text-ink-soft">{o.date}</div>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-ink tnum shrink-0">{o.amount}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-ink-soft mt-4 pt-3 border-t border-line leading-relaxed">
                      دفعة المورد في أغسطس تتزامن مع التباطؤ الموسمي — جدولتها على دفعتين تحمي
                      تدفقك.
                    </p>
                  </Card>

                  {/* Growth insight */}
                  <Card className="lg:col-span-4 p-5 flex items-center gap-4 bg-copper-tint/50 border-copper/15">
                    <div className="w-11 h-11 rounded-xl bg-copper flex items-center justify-center shrink-0">
                      <TrendingUp size={20} className="text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-ink">
                        نموّ الإيرادات{" "}
                        <span className="text-copper">
                          <CountUp value={kpis.revenueGrowth} prefix="+" suffix="٪" />
                        </span>{" "}
                        شهرياً
                      </div>
                      <div className="text-xs text-ink-soft mt-0.5">
                        ستة أشهر من النمو المتصل — أساس قوي لملفك التمويلي.
                      </div>
                    </div>
                  </Card>
                </>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      <MetricDetailModal detail={detail} open={detail !== null} onClose={() => setDetail(null)} />
      <Toast show={toast} label="تم تحديث البيانات" />
    </div>
  );
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
