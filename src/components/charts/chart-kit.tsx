"use client";

import * as React from "react";
import { formatMoney } from "@/lib/format";

/** Culori pentru serii de date (variabile CSS — se adaptează automat la tema dark/light). */
export const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "#f97316", "#14b8a6", "#e11d48"];

export const axisProps = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export const gridProps = { stroke: "var(--border)", strokeDasharray: "3 3", vertical: false } as const;

type TooltipPayload = { name?: string; value?: number | string; color?: string; dataKey?: string | number; payload?: Record<string, unknown> };

/** Tooltip stilizat pentru recharts: <Tooltip content={<ChartTooltip money currency="RON" />} /> */
export function ChartTooltip({
  active,
  payload,
  label,
  money,
  currency = "RON",
  formatter,
  labelFormatter,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string | number;
  money?: boolean;
  currency?: string;
  formatter?: (v: number, name?: string) => string;
  labelFormatter?: (l: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-40 rounded-xl border border-border bg-popover/95 px-3 py-2 text-xs shadow-lift backdrop-blur">
      {label !== undefined && <div className="mb-1.5 font-semibold text-foreground">{labelFormatter ? labelFormatter(label) : label}</div>}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="font-medium text-foreground tabular">
              {formatter ? formatter(Number(p.value), p.name) : money ? formatMoney(Number(p.value), currency) : String(p.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Gradient vertical pentru zone (AreaChart): <defs><AreaGradient id="g1" color="var(--chart-1)" /></defs> */
export function AreaGradient({ id, color, opacity = 0.3 }: { id: string; color: string; opacity?: number }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={opacity} />
      <stop offset="100%" stopColor={color} stopOpacity={0} />
    </linearGradient>
  );
}

export function compactMoney(v: number) {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (abs >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(Math.round(v));
}

/** Legendă simplă orizontală. */
export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
