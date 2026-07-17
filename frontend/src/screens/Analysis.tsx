import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Lightbulb,
  UtensilsCrossed,
  ArrowDownCircle,
  Zap,
  ShoppingBag,
  Home,
  Play,
  TrendingUp,
  TrendingDown,
  PiggyBank,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  spendingCategories,
  expenseCategories,
  incomeSpendingData,
  revenueExpenseData,
  type UserMode,
} from "../lib/data";
import { api, type IndividualsOverview, type TransactionRow } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useSelectedAccount } from "../lib/accountStore";
import { buildLedger, filterLedger, LEDGER_FILTERS, type LedgerFilter } from "../lib/ledger";
import { formatSAR } from "../lib/utils";
import { Card } from "../components/Card";
import { CountUp } from "../components/CountUp";
import { PageHeader } from "../components/PageHeader";
import { SectionLoading, SectionError, SectionEmpty } from "../components/AsyncStates";
import { RefreshButton, Toast, useRefresh } from "../components/RefreshControl";
import { Stagger, StaggerItem } from "../components/Stagger";
import { IncomeSpendingChart } from "../components/charts/IncomeSpendingChart";
import { SpendingDonut } from "../components/charts/SpendingDonut";
import { MonthlySpendingBars } from "../components/charts/MonthlySpendingBars";
import { fadeUp, inView } from "../animations/variants";
import { cn } from "../lib/utils";

const txIcons: Record<string, LucideIcon> = {
  food: UtensilsCrossed,
  income: ArrowDownCircle,
  bill: Zap,
  shopping: ShoppingBag,
  home: Home,
  play: Play,
};

/** Mode-specific content: individuals read salary/spending; business reads
    revenue/operating expenses. Same analytical structure, different lens. */
const contentByMode = {
  individuals: {
    eyebrow: "التحليل المالي",
    title: "ملخصك المالي الشامل",
    subtitle: "قراءة كاملة لدخلك وإنفاقك ومعاملاتك — يونيو 2025",
    advisorNote:
      "إنفاقك في مايو ارتفع 18٪ بسبب زيادة في بند التسوق، لكنه عاد للانتظام في يونيو. دخلك مستقر ومتصاعد — وهذا مؤشر إيجابي. التحدي الرئيسي يكمن في ضبط نسبة الالتزامات الثابتة وليس الإنفاق المتغير.",
    summary: [
      { label: "متوسط الدخل الشهري", value: 15000, icon: TrendingUp, tone: "copper" },
      { label: "متوسط الإنفاق الشهري", value: 9783, icon: TrendingDown, tone: "teal" },
      { label: "متوسط الادخار الشهري", value: 5217, icon: PiggyBank, tone: "green" },
    ],
    chartTitle: "الدخل مقابل الإنفاق — آخر 6 أشهر",
    series: incomeSpendingData,
    seriesNames: { income: "الدخل", spending: "الإنفاق" },
    donutTitle: "توزيع الإنفاق حسب البند",
    donutTotal: 9800,
    categories: spendingCategories,
    barsTitle: "الإنفاق الشهري",
    barsNote: "الشهر الحالي مميّز باللون النحاسي — أدنى من ذروة مايو بنسبة 12٪.",
    txTitle: "آخر المعاملات",
    fetchTransactions: api.getTransactions,
  },
  business: {
    eyebrow: "قراءة الأعمال",
    title: "إيراداتك ومصروفاتك بوضوح",
    subtitle: "قراءة كاملة لتدفقات منشأتك وحركة حسابها — يونيو 2025",
    advisorNote:
      "إيراداتك تنمو بثبات منذ يناير (+6٪ شهرياً) ومصروفاتك التشغيلية منضبطة. نقطة الانتباه الوحيدة: تزامن دفعة المورد الكبرى مع التباطؤ الموسمي في أغسطس — عالجها مبكراً يبقَ تدفقك موجباً.",
    summary: [
      { label: "متوسط الإيرادات الشهرية", value: 225500, icon: TrendingUp, tone: "copper" },
      { label: "متوسط المصروفات التشغيلية", value: 157750, icon: TrendingDown, tone: "teal" },
      { label: "متوسط صافي التدفق", value: 67750, icon: PiggyBank, tone: "green" },
    ],
    chartTitle: "الإيرادات مقابل المصروفات — آخر 6 أشهر",
    series: revenueExpenseData,
    seriesNames: { income: "الإيرادات", spending: "المصروفات" },
    donutTitle: "توزيع المصروفات التشغيلية",
    donutTotal: 165000,
    categories: expenseCategories,
    barsTitle: "المصروفات الشهرية",
    barsNote: "المصروفات مستقرة رغم نمو الإيرادات — انضباط تشغيلي تنظر إليه جهات التمويل بإيجابية.",
    txTitle: "آخر حركات الحساب",
    fetchTransactions: api.getBusinessTransactions,
  },
} as const;

/** How many transactions are visible initially / added per "إظهار المزيد". */
const TX_PAGE_SIZE = 6;

export function Analysis({ mode = "individuals" }: { mode?: UserMode }) {
  const c = contentByMode[mode];
  const track = mode === "business" ? "business" : "individuals";
  const account = useSelectedAccount(track);
  const { state: txState, retry } = useApi(c.fetchTransactions, [mode, account]);
  // The charts on this screen used to render lib/data.ts MOCK series/categories even with
  // USE_MOCK=false — only the transaction list was live, so switching account left every chart
  // unchanged. They now come from the same real overview payload the dashboard uses.
  // Both overview payloads share the series/categories shape this screen needs; the kpis differ
  // (and are not used here), so the fetcher is narrowed to the common part.
  const fetchOverview = (): Promise<Pick<IndividualsOverview, "series" | "categories">> =>
    mode === "business" ? api.getBusinessOverview() : api.getIndividualsOverview();
  const { state: overviewState, retry: retryOverview } = useApi(fetchOverview, [mode, account]);
  const { spinning, toast, refresh } = useRefresh();
  const [visibleTx, setVisibleTx] = useState(TX_PAGE_SIZE);

  const overview = overviewState.status === "ready" ? overviewState.data : undefined;
  // Fall back to the mock shapes only while loading, so no chart ever renders empty.
  const series = overview?.series ?? [...c.series];
  const categories = overview?.categories ?? [...c.categories];
  const donutTotal = categories.reduce((sum, cat) => sum + cat.amount, 0);

  const isIndividuals = mode !== "business";
  const income = series.length ? series[series.length - 1].income : 0;
  // Individuals: explode the REAL category aggregates into a merchant-level ledger (seeded per
  // account, so it's stable per persona and regenerates on switch). Business keeps its backend feed.
  const ledger = useMemo(
    () => (isIndividuals ? buildLedger(account, categories, income) : []),
    [isIndividuals, account, categories, income]
  );
  const [txFilter, setTxFilter] = useState<LedgerFilter>("الكل");

  const txLoading = isIndividuals ? overviewState.status === "loading" : txState.status === "loading";
  const txErrored = isIndividuals ? overviewState.status === "error" : txState.status === "error";
  const rows: TransactionRow[] = isIndividuals
    ? filterLedger(ledger, txFilter)
    : txState.status === "ready"
    ? [...txState.data]
    : [];
  const onTxRetry = isIndividuals ? retryOverview : retry;

  const avg = (key: "income" | "spending") =>
    series.length ? Math.round(series.reduce((s, p) => s + p[key], 0) / series.length) : 0;
  const summary = [
    { label: c.summary[0].label, value: avg("income"), icon: c.summary[0].icon, tone: c.summary[0].tone },
    { label: c.summary[1].label, value: avg("spending"), icon: c.summary[1].icon, tone: c.summary[1].tone },
    {
      label: c.summary[2].label,
      value: avg("income") - avg("spending"),
      icon: c.summary[2].icon,
      tone: c.summary[2].tone,
    },
  ];

  return (
    <div className="p-5 md:p-8 max-w-6xl mx-auto space-y-6" dir="rtl">
      <PageHeader
        eyebrow={c.eyebrow}
        title={c.title}
        subtitle={c.subtitle}
        end={
          <span className="inline-flex items-center gap-2.5">
            <span className="inline-flex items-center gap-2 bg-card border border-line rounded-full px-4 py-2 text-xs font-medium text-ink-soft shadow-[var(--shadow-sm)]">
              آخر تحديث: الآن
            </span>
            <RefreshButton
              spinning={spinning}
              onClick={() =>
                refresh(() => {
                  setVisibleTx(TX_PAGE_SIZE);
                  retry();
                })
              }
            />
          </span>
        }
      />

      {/* Advisor insight */}
      <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={inView}>
        <Card reveal={false} className="relative overflow-hidden bg-espresso border-espresso p-5 flex gap-4">
          <div className="pointer-events-none absolute -top-10 -start-6 w-48 h-48 rounded-full bg-copper/20 blur-3xl" />
          <div className="relative w-11 h-11 rounded-xl bg-gold/15 flex items-center justify-center shrink-0">
            <Lightbulb size={20} className="text-gold" />
          </div>
          <div className="relative">
            <div className="text-white font-semibold text-sm mb-1.5">ملاحظة المستشار</div>
            <p className="text-white/70 text-sm leading-relaxed">{c.advisorNote}</p>
          </div>
        </Card>
      </motion.div>

      {/* Summary stats — one continuous divided band */}
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={inView}
        className="rounded-[1.75rem] bg-card border border-line shadow-[var(--shadow-md)] grid grid-cols-1 sm:grid-cols-3 overflow-hidden"
      >
        {summary.map((s, i) => (
          <div
            key={s.label}
            className={cn(
              "flex items-center gap-4 p-6",
              i > 0 && "border-t sm:border-t-0 sm:border-s border-line"
            )}
          >
            <div
              className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
                s.tone === "copper" && "bg-copper-tint text-copper",
                s.tone === "teal" && "bg-[#E6EEED] text-chart-4",
                s.tone === "green" && "bg-positive-bg text-positive"
              )}
            >
              <s.icon size={21} />
            </div>
            <div>
              <div className="text-2xl font-bold text-ink tnum">
                <CountUp value={s.value} suffix=" ر.س" />
              </div>
              <div className="text-xs text-ink-soft mt-1">{s.label}</div>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Income vs spending area chart */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-ink">{c.chartTitle}</h3>
          <div className="flex gap-4">
            <LegendDot color="var(--copper)" label={c.seriesNames.income} />
            <LegendDot color="var(--chart-4)" label={c.seriesNames.spending} />
          </div>
        </div>
        <IncomeSpendingChart
          height={280}
          data={series}
          incomeName={c.seriesNames.income}
          spendingName={c.seriesNames.spending}
        />
      </Card>

      {/* Donut + monthly bars */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-bold text-ink mb-4">{c.donutTitle}</h3>
          <div className="relative">
            <SpendingDonut height={220} data={categories} />
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-2xl font-bold text-ink">
                <CountUp value={donutTotal} />
              </div>
              <div className="text-xs text-ink-soft">ر.س إجمالي</div>
            </div>
          </div>
          <Stagger className="grid grid-cols-2 gap-2.5 mt-4">
            {categories.map((cat) => (
              <StaggerItem key={cat.name} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                <span className="text-xs text-ink-soft">
                  {cat.name} <span className="text-ink font-medium tnum">{cat.value}٪</span>
                </span>
              </StaggerItem>
            ))}
          </Stagger>
        </Card>

        <Card className="p-6">
          <h3 className="font-bold text-ink mb-4">{c.barsTitle}</h3>
          <MonthlySpendingBars height={240} source={series} name={c.seriesNames.spending} />
          <p className="text-xs text-ink-soft mt-3 text-center">{c.barsNote}</p>
        </Card>
      </div>

      {/* Transactions — individuals: real-aggregate-driven merchant ledger + filters. */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-ink">{c.txTitle}</h3>
          <span className="text-xs text-ink-soft">يونيو 2025</span>
        </div>

        {isIndividuals && (
          <div className="flex flex-wrap gap-2 mb-4">
            {LEDGER_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => {
                  setTxFilter(f);
                  setVisibleTx(TX_PAGE_SIZE);
                }}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-semibold border transition-colors",
                  txFilter === f
                    ? "bg-copper text-white border-copper"
                    : "bg-card text-ink-soft border-line hover:bg-cream-deep"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        )}

        {txLoading && <SectionLoading height={200} />}
        {txErrored && <SectionError onRetry={onTxRetry} />}
        {!txLoading && !txErrored && rows.length === 0 && (
          <SectionEmpty label="لا توجد حركات في هذه الفئة." />
        )}
        {!txLoading && !txErrored && rows.length > 0 && (
          // onView={false}: animate on mount, not on scroll — so rows appended by "إظهار المزيد"
          // reveal instead of staying at their hidden (opacity 0) initial state.
          <Stagger className="divide-y divide-line" onView={false}>
            {rows.slice(0, visibleTx).map((tx) => {
              const Icon = txIcons[tx.icon] ?? ShoppingBag;
              const positive = tx.amount > 0;
              return (
                <StaggerItem key={tx.id}>
                  <div className="flex items-center justify-between py-3.5">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                          positive ? "bg-positive-bg text-positive" : "bg-cream-deep text-copper"
                        )}
                      >
                        <Icon size={18} />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-ink">{tx.name}</div>
                        <div className="text-xs text-ink-soft mt-0.5">
                          {tx.category} · {tx.date}
                        </div>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "font-bold text-sm tnum",
                        positive ? "text-positive" : "text-ink"
                      )}
                    >
                      {positive ? "+" : ""}
                      {formatSAR(tx.amount)}
                    </span>
                  </div>
                </StaggerItem>
              );
            })}
          </Stagger>
        )}
        {!txLoading && !txErrored && rows.length > visibleTx && (
          <div className="pt-4 mt-1 border-t border-line flex justify-center">
            <button
              onClick={() => setVisibleTx((v) => v + TX_PAGE_SIZE)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-copper bg-copper-tint/60 border border-copper/15 rounded-full px-6 py-2.5 hover:bg-copper-tint transition-colors"
            >
              إظهار المزيد
              <span className="text-xs text-copper/70 tnum">({rows.length - visibleTx})</span>
            </button>
          </div>
        )}
      </Card>
      <Toast show={toast} label="تم تحديث البيانات" />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-xs text-ink-soft">{label}</span>
    </div>
  );
}
