import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { incomeSpendingData } from "../../lib/data";
import { CHART } from "../../lib/chartColors";
import { ChartTooltip } from "./ChartTooltip";

/**
 * Monthly spending bars. Self-drawing: bars grow up from the axis on load.
 * The most recent (current) month is highlighted in copper.
 */
export function MonthlySpendingBars({
  height = 220,
  source = incomeSpendingData,
  name = "الإنفاق",
}: {
  height?: number;
  /** Monthly series; the `spending` field is plotted. */
  source?: { month: string; spending: number }[];
  name?: string;
}) {
  const data = source.map((d) => ({ month: d.month, spending: d.spending }));
  const axisTick = {
    fontSize: 11,
    fontFamily: "IBM Plex Sans Arabic, sans-serif",
    fill: CHART.inkSoft,
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} reversed dy={6} />
        <YAxis
          orientation="right"
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          width={40}
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: CHART.creamDeep }} />
        <Bar dataKey="spending" name={name} radius={[8, 8, 0, 0]} animationDuration={1300} animationEasing="ease-out">
          {data.map((_, i) => (
            <Cell key={i} fill={i === data.length - 1 ? CHART.copper : CHART.sand} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
