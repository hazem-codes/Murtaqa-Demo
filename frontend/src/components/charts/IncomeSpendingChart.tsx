import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { incomeSpendingData } from "../../lib/data";
import { CHART } from "../../lib/chartColors";
import { ChartTooltip } from "./ChartTooltip";

interface IncomeSpendingChartProps {
  height?: number;
  /** Series to plot; defaults to the individuals income/spending data. */
  data?: { month: string; income: number; spending: number }[];
  /** Legend/tooltip names for the two series. */
  incomeName?: string;
  spendingName?: string;
}

/**
 * Two-series monthly area chart (income vs. spending by default; the business
 * mode reuses it for revenue vs. operating expenses via props).
 * Self-drawing: both areas animate from the baseline up to their values on load.
 */
export function IncomeSpendingChart({
  height = 260,
  data = incomeSpendingData,
  incomeName = "الدخل",
  spendingName = "الإنفاق",
}: IncomeSpendingChartProps) {
  const axisTick = {
    fontSize: 11,
    fontFamily: "IBM Plex Sans Arabic, sans-serif",
    fill: CHART.inkSoft,
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="fillIncome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.copper} stopOpacity={0.28} />
            <stop offset="100%" stopColor={CHART.copper} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="fillSpending" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.teal} stopOpacity={0.22} />
            <stop offset="100%" stopColor={CHART.teal} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 4" stroke={CHART.line} vertical={false} />
        <XAxis
          dataKey="month"
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          reversed
          dy={8}
        />
        <YAxis
          orientation="right"
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          width={44}
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: CHART.line, strokeWidth: 1.5 }} />

        <Area
          type="monotone"
          dataKey="income"
          name={incomeName}
          stroke={CHART.copper}
          strokeWidth={2.75}
          fill="url(#fillIncome)"
          dot={{ fill: CHART.copper, r: 3, strokeWidth: 2, stroke: "#fff" }}
          activeDot={{ r: 6, strokeWidth: 2, stroke: "#fff" }}
          animationDuration={1500}
          animationEasing="ease-out"
        />
        <Area
          type="monotone"
          dataKey="spending"
          name={spendingName}
          stroke={CHART.teal}
          strokeWidth={2.75}
          fill="url(#fillSpending)"
          dot={{ fill: CHART.teal, r: 3, strokeWidth: 2, stroke: "#fff" }}
          activeDot={{ r: 6, strokeWidth: 2, stroke: "#fff" }}
          animationDuration={1500}
          animationBegin={200}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
