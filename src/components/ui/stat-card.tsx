"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { AnimatedNumber } from "@/components/motion";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export type StatFormat = "money" | "number" | "hours" | "percent";

function formatter(kind: StatFormat, currency = "RON") {
  switch (kind) {
    case "money":
      return (n: number) => formatMoney(n, currency).replace(/,\d{2}(?=\s)/, "");
    case "hours":
      return (n: number) => `${Math.round(n).toLocaleString("ro-RO")} h`;
    case "percent":
      return (n: number) => `${n.toFixed(0)}%`;
    default:
      return (n: number) => Math.round(n).toLocaleString("ro-RO");
  }
}

/** Card KPI cu număr animat, variație și sparkline opțional. */
export function StatCard({
  label,
  value,
  format = "money",
  currency,
  delta,
  deltaLabel,
  invertDelta,
  icon,
  tone = "brand",
  spark,
  href,
  hint,
  className,
}: {
  label: string;
  value: number;
  format?: StatFormat;
  currency?: string;
  delta?: number | null; // procent
  deltaLabel?: string;
  invertDelta?: boolean; // ex. cheltuieli: creșterea e negativă
  icon?: React.ReactNode;
  tone?: "brand" | "success" | "warning" | "danger" | "info";
  spark?: number[];
  href?: string;
  hint?: React.ReactNode;
  className?: string;
}) {
  const toneBg = {
    brand: "from-primary/15 text-primary",
    success: "from-success/15 text-success",
    warning: "from-warning/15 text-warning",
    danger: "from-danger/15 text-danger",
    info: "from-info/15 text-info",
  }[tone];
  const toneColor = { brand: "var(--primary)", success: "var(--success)", warning: "var(--warning)", danger: "var(--danger)", info: "var(--info)" }[tone];
  const up = (delta ?? 0) >= 0;
  const good = invertDelta ? !up : up;
  const id = React.useId().replace(/:/g, "");

  const body = (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-soft transition-all duration-300",
        href && "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lift",
        className,
      )}
    >
      <div className={cn("pointer-events-none absolute -top-12 -right-12 size-32 rounded-full bg-gradient-to-br to-transparent opacity-70 blur-2xl transition-opacity group-hover:opacity-100", toneBg)} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-[26px] leading-none font-semibold tracking-tight tabular">
            <AnimatedNumber value={value} format={formatter(format, currency)} />
          </p>
        </div>
        {icon && (
          <div className={cn("grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br to-transparent [&_svg]:size-5", toneBg)}>{icon}</div>
        )}
      </div>
      <div className="relative mt-3 flex items-end justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs">
          {delta !== undefined && delta !== null && Number.isFinite(delta) && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold",
                good ? "bg-success-soft text-success-soft-foreground" : "bg-danger-soft text-danger-soft-foreground",
              )}
            >
              {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
              {Math.abs(delta).toFixed(0)}%
            </span>
          )}
          {(deltaLabel || hint) && <span className="truncate text-muted-foreground">{deltaLabel ?? hint}</span>}
        </div>
        {spark && spark.length > 1 && (
          <div className="h-9 w-24 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spark.map((v, i) => ({ i, v }))} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                <defs>
                  <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={toneColor} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={toneColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke={toneColor} strokeWidth={1.75} fill={`url(#spark-${id})`} isAnimationActive animationDuration={1200} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
