"use client";

import * as React from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AreaGradient, CHART_COLORS, ChartLegend, ChartTooltip, axisProps, compactMoney, gridProps } from "@/components/charts/chart-kit";
import { AnimatedBar } from "@/components/motion";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const ANIM = { isAnimationActive: true, animationDuration: 700, animationEasing: "ease-out" as const };
const BAR = { maxBarSize: 24, radius: [4, 4, 0, 0] as [number, number, number, number] };

/** Culori semantice pentru seriile financiare (constante între rapoarte). */
export const SERIES = {
  current: CHART_COLORS[0],
  previous: "var(--muted-foreground)",
  in: CHART_COLORS[2],
  out: CHART_COLORS[4],
  net: "var(--foreground)",
  revenue: CHART_COLORS[0],
  purchases: CHART_COLORS[4],
  labor: CHART_COLORS[3],
  collected: CHART_COLORS[0],
  deductible: CHART_COLORS[1],
};

/** Rampă ordinală pentru vechimea creanțelor (curent → > 90 zile). */
export const AGING_COLORS: Record<string, string> = {
  current: "var(--info)",
  d30: "var(--warning)",
  d60: "#f97316",
  d90: "var(--danger)",
  d90p: "color-mix(in oklab, var(--danger) 62%, #000)",
};

function ChartFrame({ height = 280, children, className }: { height?: number; children: React.ReactElement; className?: string }) {
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

const moneyTooltip = <ChartTooltip money />;

/* ---------------- Venit pe luni: curent (bare) vs anul trecut (linie) ---------------- */
export function MonthlyCompareChart({
  data,
  currentLabel = "Perioada curentă",
  previousLabel = "Anul anterior",
  height,
}: {
  data: { label: string; current: number; previous: number }[];
  currentLabel?: string;
  previousLabel?: string;
  height?: number;
}) {
  return (
    <div className="space-y-3">
      <ChartLegend
        items={[
          { label: currentLabel, color: SERIES.current },
          { label: previousLabel, color: SERIES.previous },
        ]}
      />
      <ChartFrame height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
          <YAxis {...axisProps} tickFormatter={compactMoney} width={44} />
          <Tooltip content={moneyTooltip} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
          <Bar dataKey="current" name={currentLabel} fill={SERIES.current} {...BAR} {...ANIM} />
          <Line dataKey="previous" name={previousLabel} type="monotone" stroke={SERIES.previous} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} {...ANIM} />
        </ComposedChart>
      </ChartFrame>
    </div>
  );
}

/* ---------------- Clasament orizontal (top N) — HTML, lizibil pe mobil ---------------- */
export function RankedBars({
  items,
  color = CHART_COLORS[0],
  currency = "RON",
  format,
  empty = "Nu există date în perioada selectată.",
  limit = 10,
}: {
  items: { key: string; label: string; value: number; sub?: string; color?: string }[];
  color?: string;
  currency?: string;
  format?: (v: number) => string;
  empty?: string;
  limit?: number;
}) {
  const shown = items.slice(0, limit);
  const max = Math.max(0, ...shown.map((i) => Math.abs(i.value)));
  if (!shown.length) return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ol className="space-y-3">
      {shown.map((i, idx) => (
        <li key={i.key} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="w-4 shrink-0 text-right text-xs text-muted-foreground tabular">{idx + 1}</span>
              <span className="truncate font-medium" title={i.label}>
                {i.label}
              </span>
              {i.sub && <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{i.sub}</span>}
            </span>
            <span className="shrink-0 font-semibold tabular">{format ? format(i.value) : formatMoney(i.value, currency)}</span>
          </div>
          <div className="pl-6">
            <AnimatedBar value={max ? (Math.abs(i.value) / max) * 100 : 0} color={i.color ?? color} className="h-2 w-full overflow-hidden rounded-full bg-muted" />
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ---------------- Încasări vs plăți + flux net ---------------- */
export function InOutChart({ data, height }: { data: { label: string; in: number; out: number; net: number }[]; height?: number }) {
  return (
    <div className="space-y-3">
      <ChartLegend
        items={[
          { label: "Încasări", color: SERIES.in },
          { label: "Plăți", color: SERIES.out },
          { label: "Flux net", color: SERIES.net },
        ]}
      />
      <ChartFrame height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
          <YAxis {...axisProps} tickFormatter={compactMoney} width={44} />
          <Tooltip content={moneyTooltip} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Bar dataKey="in" name="Încasări" fill={SERIES.in} {...BAR} {...ANIM} />
          <Bar dataKey="out" name="Plăți" fill={SERIES.out} {...BAR} {...ANIM} />
          <Line dataKey="net" name="Flux net" type="monotone" stroke={SERIES.net} strokeWidth={2} dot={{ r: 3, strokeWidth: 2, stroke: "var(--card)", fill: SERIES.net }} {...ANIM} />
        </ComposedChart>
      </ChartFrame>
    </div>
  );
}

/* ---------------- Sold cumulat (arie) ---------------- */
export function CumulativeChart({ data, height = 220, name = "Flux net cumulat" }: { data: { label: string; cumulative: number }[]; height?: number; name?: string }) {
  const id = React.useId().replace(/:/g, "");
  return (
    <ChartFrame height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <AreaGradient id={`cum-${id}`} color={CHART_COLORS[0]} opacity={0.22} />
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
        <YAxis {...axisProps} tickFormatter={compactMoney} width={44} />
        <Tooltip content={moneyTooltip} />
        <ReferenceLine y={0} stroke="var(--border)" />
        <Area dataKey="cumulative" name={name} type="monotone" stroke={CHART_COLORS[0]} strokeWidth={2} fill={`url(#cum-${id})`} {...ANIM} />
      </AreaChart>
    </ChartFrame>
  );
}

/* ---------------- Vechime creanțe pe client (bare orizontale stivuite) ---------------- */
export function AgingByClientChart({
  data,
  buckets,
}: {
  data: ({ name: string } & Record<string, number | string>)[];
  buckets: { key: string; label: string }[];
}) {
  const height = Math.max(160, data.length * 38 + 40);
  const last = buckets.at(-1)?.key;
  return (
    <div className="space-y-3">
      <ChartLegend items={buckets.map((b) => ({ label: b.label, color: AGING_COLORS[b.key] }))} />
      <ChartFrame height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid {...gridProps} horizontal={false} vertical />
          <XAxis type="number" {...axisProps} tickFormatter={compactMoney} />
          <YAxis type="category" dataKey="name" {...axisProps} width={128} tick={<CategoryTick />} />
          <Tooltip content={moneyTooltip} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
          {buckets.map((b) => (
            <Bar
              key={b.key}
              dataKey={b.key}
              name={b.label}
              stackId="aging"
              fill={AGING_COLORS[b.key]}
              stroke="var(--card)"
              strokeWidth={1.5}
              maxBarSize={22}
              radius={b.key === last ? [0, 4, 4, 0] : 0}
              {...ANIM}
            />
          ))}
        </BarChart>
      </ChartFrame>
    </div>
  );
}

/** Etichetă de categorie pe o singură linie (trunchiată), fără wrap automat. */
function CategoryTick(props: { x?: number | string; y?: number | string; payload?: { value: string } }) {
  const v = String(props.payload?.value ?? "");
  const label = v.length > 20 ? `${v.slice(0, 19)}…` : v;
  return (
    <text x={Number(props.x ?? 0) - 6} y={Number(props.y ?? 0)} dy={4} textAnchor="end" fontSize={11} fill="var(--muted-foreground)">
      <title>{v}</title>
      {label}
    </text>
  );
}

/* ---------------- P&L lunar: venituri vs cheltuieli (stivuite) + profit ---------------- */
export function PnlChart({
  data,
  showLabor = true,
  height,
}: {
  data: { label: string; revenue: number; purchases: number; labor: number; profit: number }[];
  showLabor?: boolean;
  height?: number;
}) {
  const rows = showLabor ? data : data.map((d) => ({ ...d, labor: 0, profit: d.revenue - d.purchases }));
  return (
    <div className="space-y-3">
      <ChartLegend
        items={[
          { label: "Venituri", color: SERIES.revenue },
          { label: "Achiziții", color: SERIES.purchases },
          ...(showLabor ? [{ label: "Cost manoperă", color: SERIES.labor }] : []),
          { label: "Profit", color: SERIES.net },
        ]}
      />
      <ChartFrame height={height}>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
          <YAxis {...axisProps} tickFormatter={compactMoney} width={44} />
          <Tooltip content={moneyTooltip} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Bar dataKey="revenue" name="Venituri" fill={SERIES.revenue} {...BAR} {...ANIM} />
          <Bar dataKey="purchases" name="Achiziții" stackId="cost" fill={SERIES.purchases} maxBarSize={24} radius={showLabor ? 0 : [4, 4, 0, 0]} stroke="var(--card)" strokeWidth={1} {...ANIM} />
          {showLabor && <Bar dataKey="labor" name="Cost manoperă" stackId="cost" fill={SERIES.labor} maxBarSize={24} radius={[4, 4, 0, 0]} stroke="var(--card)" strokeWidth={1} {...ANIM} />}
          <Line dataKey="profit" name="Profit" type="monotone" stroke={SERIES.net} strokeWidth={2} dot={{ r: 3, strokeWidth: 2, stroke: "var(--card)", fill: SERIES.net }} {...ANIM} />
        </ComposedChart>
      </ChartFrame>
    </div>
  );
}

/* ---------------- TVA colectată vs deductibilă + sold ---------------- */
export function VatChart({ data, height = 260 }: { data: { label: string; collected: number; deductible: number; balance: number }[]; height?: number }) {
  return (
    <div className="space-y-3">
      <ChartLegend
        items={[
          { label: "TVA colectată", color: SERIES.collected },
          { label: "TVA deductibilă", color: SERIES.deductible },
          { label: "De plată (+) / de recuperat (−)", color: SERIES.net },
        ]}
      />
      <ChartFrame height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
          <YAxis {...axisProps} tickFormatter={compactMoney} width={44} />
          <Tooltip content={moneyTooltip} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Bar dataKey="collected" name="TVA colectată" fill={SERIES.collected} {...BAR} {...ANIM} />
          <Bar dataKey="deductible" name="TVA deductibilă" fill={SERIES.deductible} {...BAR} {...ANIM} />
          <Line dataKey="balance" name="Sold TVA" type="monotone" stroke={SERIES.net} strokeWidth={2} dot={{ r: 3, strokeWidth: 2, stroke: "var(--card)", fill: SERIES.net }} {...ANIM} />
        </ComposedChart>
      </ChartFrame>
    </div>
  );
}

/* ---------------- Bară 100% (distribuție pe categorii) ---------------- */
export function DistributionBar({
  segments,
  format = (v) => formatMoney(v),
}: {
  segments: { key: string; label: string; value: number; color: string; sub?: string }[];
  format?: (v: number) => string;
}) {
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  return (
    <div className="space-y-4">
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-muted">
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s, i) => (
              <div
                key={s.key}
                className="h-full origin-left animate-[grow-x_700ms_cubic-bezier(0.16,1,0.3,1)_both] first:rounded-l-full last:rounded-r-full"
                style={{ width: `${(s.value / total) * 100}%`, background: s.color, animationDelay: `${i * 60}ms` }}
                title={`${s.label}: ${format(s.value)}`}
              />
            ))}
      </div>
      <style>{"@keyframes grow-x{from{transform:scaleX(0)}to{transform:scaleX(1)}}"}</style>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        {segments.map((s) => (
          <div key={s.key} className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate">{s.label}</span>
            </div>
            <div className="mt-0.5 font-semibold tabular">{format(s.value)}</div>
            <div className="text-xs text-muted-foreground">
              {total ? `${((Math.max(0, s.value) / total) * 100).toFixed(0)}%` : "0%"}
              {s.sub ? ` · ${s.sub}` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
