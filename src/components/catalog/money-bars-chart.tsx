"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisProps, CHART_COLORS, ChartLegend, ChartTooltip, gridProps } from "@/components/charts/chart-kit";

/** Etichete de axă compacte, cu o zecimală unde contează (5,5k în loc de 6k). */
export function axisMoney(v: number) {
  const abs = Math.abs(v);
  const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");
  if (abs >= 1_000_000) return `${fmt(v / 1_000_000)}M`;
  if (abs >= 1_000) return `${fmt(v / 1_000)}k`;
  return String(Math.round(v));
}

export type MonthPoint = { month: string; long: string; a: number; b: number };

/**
 * Bare lunare grupate (două serii pe aceeași axă, în RON) — ex. facturat vs. încasat.
 */
export function MoneyBarsChart({
  data,
  labels,
  height = 260,
}: {
  data: MonthPoint[];
  labels: [string, string];
  height?: number;
}) {
  const longOf = new Map(data.map((d) => [d.month, d.long]));
  const colors = [CHART_COLORS[0], CHART_COLORS[1]];
  if (data.every((d) => !d.a && !d.b)) {
    return (
      <div style={{ height: Math.min(height, 180) }} className="grid place-items-center rounded-xl border border-dashed border-border bg-subtle/40 text-sm text-muted-foreground">
        Nicio activitate în ultimele 12 luni.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <ChartLegend items={labels.map((label, i) => ({ label, color: colors[i] }))} />
      <div style={{ height }} className="-ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="22%" margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="month" {...axisProps} tickMargin={8} />
            <YAxis {...axisProps} width={44} tickFormatter={axisMoney} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6, radius: 6 }}
              content={<ChartTooltip money labelFormatter={(l) => longOf.get(String(l)) ?? String(l)} />}
            />
            <Bar dataKey="a" name={labels[0]} fill={colors[0]} radius={[4, 4, 0, 0]} maxBarSize={18} animationDuration={700} />
            <Bar dataKey="b" name={labels[1]} fill={colors[1]} radius={[4, 4, 0, 0]} maxBarSize={18} animationDuration={700} animationBegin={120} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
