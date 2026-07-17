import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { spendingCategories } from "../../lib/data";
import { PercentTooltip } from "./ChartTooltip";

/**
 * Spending distribution donut. Self-drawing: sweeps open on load
 * (Recharts animates the angle from 0). Hovering a slice shows exact % + amount.
 */
export function SpendingDonut({
  height = 210,
  data = spendingCategories,
}: {
  height?: number;
  data?: { name: string; value: number; amount: number; color: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius="58%"
          outerRadius="86%"
          paddingAngle={3}
          cornerRadius={6}
          dataKey="value"
          stroke="none"
          startAngle={90}
          endAngle={-270}
          animationDuration={1300}
          animationEasing="ease-out"
        >
          {spendingCategories.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip content={<PercentTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}
