"use client";

import { format, parse } from "date-fns";
import { ro } from "date-fns/locale";
import { motion } from "motion/react";
import * as React from "react";
import { Area, Bar, CartesianGrid, Cell, ComposedChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AreaGradient, axisProps, ChartLegend, ChartTooltip, compactMoney, gridProps } from "@/components/charts/chart-kit";
import { Segmented } from "@/components/ui/tabs";
import { EFACTURA_STATUS } from "@/lib/constants";

type Point = { month: string; revenue: number; expenses: number; collected: number };

const monthLabel = (m: string) => format(parse(m, "yyyy-MM", new Date()), "LLL", { locale: ro }).replace(".", "");
const monthLong = (m: string | number) => format(parse(String(m), "yyyy-MM", new Date()), "LLLL yyyy", { locale: ro });

export function RevenueChart({ data }: { data: Point[] }) {
  const [range, setRange] = React.useState<"6" | "12">("12");
  const shown = range === "6" ? data.slice(-6) : data;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChartLegend
          items={[
            { label: "Venituri facturate", color: "var(--chart-1)" },
            { label: "Încasări", color: "var(--chart-2)" },
            { label: "Cheltuieli", color: "var(--chart-5)" },
          ]}
        />
        <Segmented
          size="sm"
          value={range}
          onChange={setRange}
          options={[
            { value: "6", label: "6 luni" },
            { value: "12", label: "12 luni" },
          ]}
        />
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={shown} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
            <defs>
              <AreaGradient id="rev" color="var(--chart-1)" opacity={0.28} />
              <linearGradient id="bar-exp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-5)" stopOpacity={0.85} />
                <stop offset="100%" stopColor="var(--chart-5)" stopOpacity={0.35} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="month" tickFormatter={monthLabel} {...axisProps} dy={6} />
            <YAxis tickFormatter={compactMoney} {...axisProps} width={48} />
            <Tooltip content={<ChartTooltip money labelFormatter={monthLong} />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
            <Bar dataKey="expenses" name="Cheltuieli" fill="url(#bar-exp)" radius={[6, 6, 0, 0]} maxBarSize={18} animationDuration={900} />
            <Area type="monotone" dataKey="revenue" name="Venituri" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#rev)" animationDuration={1200} activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }} />
            <Area type="monotone" dataKey="collected" name="Încasări" stroke="var(--chart-2)" strokeWidth={2} strokeDasharray="5 4" fill="none" animationDuration={1400} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const EF_COLORS: Record<string, string> = {
  ok: "var(--success)",
  processing: "var(--warning)",
  pending: "var(--info)",
  nok: "var(--danger)",
  error: "var(--danger)",
  none: "var(--muted-foreground)",
};

export function EfacturaDonut({ counts }: { counts: Record<string, number> }) {
  const data = ["ok", "processing", "nok", "error", "none"]
    .map((k) => ({ key: k, name: EFACTURA_STATUS[k].label, value: counts[k] ?? 0 }))
    .filter((d) => d.value > 0);
  const total = data.reduce((a, d) => a + d.value, 0);
  const okPct = total ? Math.round(((counts.ok ?? 0) / total) * 100) : 0;
  return (
    <div className="flex items-center gap-5">
      <div className="relative size-36 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="72%" outerRadius="100%" paddingAngle={2} stroke="none" animationDuration={1000}>
              {data.map((d) => (
                <Cell key={d.key} fill={EF_COLORS[d.key]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip formatter={(v) => `${v} facturi`} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.4, type: "spring", bounce: 0.4 }} className="text-2xl font-semibold tabular">
              {okPct}%
            </motion.div>
            <div className="text-[11px] text-muted-foreground">validate</div>
          </div>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.key} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <span className="size-2 shrink-0 rounded-full" style={{ background: EF_COLORS[d.key] }} />
              <span className="truncate">{d.name}</span>
            </span>
            <span className="font-semibold tabular">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ceas live pentru cronometrul pornit. */
export function LiveTimer({ since }: { since: number }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return (
    <span className="font-mono text-3xl font-semibold tracking-tight tabular">
      {hh}:{mm}
      <span className="text-muted-foreground">:{ss}</span>
    </span>
  );
}
