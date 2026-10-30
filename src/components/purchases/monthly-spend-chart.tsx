"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisMoney } from "@/components/catalog/money-bars-chart";
import { axisProps, ChartTooltip, gridProps } from "@/components/charts/chart-kit";

export type SpendPoint = { key: string; month: string; long: string; total: number; vat: number };

/** Cheltuieli pe lună (o singură serie; luna curentă evidențiată). */
export function MonthlySpendChart({ data, height = 240 }: { data: SpendPoint[]; height?: number }) {
  const longOf = new Map(data.map((d) => [d.month, d.long]));
  const last = data.length - 1;
  return (
    <div style={{ height }} className="-ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="month" {...axisProps} tickMargin={8} />
          <YAxis {...axisProps} width={44} tickFormatter={axisMoney} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6, radius: 6 }}
            content={<ChartTooltip money labelFormatter={(l) => longOf.get(String(l)) ?? String(l)} />}
          />
          <Bar dataKey="total" name="Cheltuieli (cu TVA)" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={700}>
            {data.map((d, i) => (
              <Cell key={d.key} fill="var(--chart-1)" fillOpacity={i === last ? 1 : 0.55} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
