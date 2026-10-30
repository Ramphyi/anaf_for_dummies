"use client";

import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, Calculator, Landmark, LineChart as LineIcon, Loader2, Minus, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import * as React from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AreaGradient, axisProps, ChartTooltip, gridProps } from "@/components/charts/chart-kit";
import { AnimatedNumber, Stagger, StaggerItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { Tooltip as Hint } from "@/components/ui/popover";
import { formatDate, formatDateLong } from "@/lib/format";
import { cn } from "@/lib/utils";
import { refreshBnrAction, type RatesResult } from "./actions";

export type RatePoint = { date: string; EUR?: number; USD?: number };

const MAIN = ["EUR", "USD", "GBP", "CHF", "HUF", "PLN", "BGN", "MDL", "CZK", "SEK", "NOK", "DKK", "JPY", "CAD", "CNY", "TRY"];
const NAMES: Record<string, string> = {
  RON: "Leu românesc",
  EUR: "Euro",
  USD: "Dolar american",
  GBP: "Liră sterlină",
  CHF: "Franc elvețian",
  HUF: "Forint maghiar",
  PLN: "Zlot polonez",
  BGN: "Leva bulgărească",
  MDL: "Leu moldovenesc",
  CZK: "Coroană cehă",
  SEK: "Coroană suedeză",
  NOK: "Coroană norvegiană",
  DKK: "Coroană daneză",
  JPY: "Yen japonez",
  CAD: "Dolar canadian",
  CNY: "Yuan chinezesc",
  TRY: "Liră turcească",
};

const fmt = (v: number, d = 4) => v.toLocaleString("ro-RO", { minimumFractionDigits: d, maximumFractionDigits: d });

function Delta({ now, prev }: { now: number; prev?: number }) {
  if (!prev) return <span className="text-[11px] text-muted-foreground">—</span>;
  const diff = now - prev;
  const pct = (diff / prev) * 100;
  if (Math.abs(diff) < 0.00005)
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
        <Minus className="size-3" /> neschimbat
      </span>
    );
  const up = diff > 0;
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-medium whitespace-nowrap text-muted-foreground">
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {up ? "+" : ""}
      {fmt(diff)} ({up ? "+" : ""}
      {pct.toFixed(2).replace(".", ",")}%)
    </span>
  );
}

/** Grafic mic (o singură serie) — evoluția cursului unei monede în RON. */
function RateChart({ currency, data }: { currency: "EUR" | "USD"; data: RatePoint[] }) {
  const points = data.filter((d) => d[currency] !== undefined).map((d) => ({ date: d.date, v: d[currency]! }));
  const id = `bnr-${currency}`;
  if (points.length < 2) {
    return <div className="grid h-52 place-items-center text-sm text-muted-foreground">Date insuficiente pentru grafic.</div>;
  }
  const first = points[0].v;
  const last = points[points.length - 1].v;
  const min = Math.min(...points.map((p) => p.v));
  const max = Math.max(...points.map((p) => p.v));
  const pad = Math.max((max - min) * 0.25, 0.005);
  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            {currency}/RON · {points.length} zile cu curs publicat
          </p>
          <p className="text-xl font-semibold tabular">{fmt(last)} lei</p>
        </div>
        <div className="text-right text-[11px] text-muted-foreground">
          <p>
            min {fmt(min)} · max {fmt(max)}
          </p>
          <Delta now={last} prev={first} />
        </div>
      </div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: -8 }}>
            <defs>
              <AreaGradient id={id} color="var(--chart-1)" opacity={0.22} />
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} tickFormatter={(d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`} minTickGap={28} />
            <YAxis {...axisProps} width={52} domain={[min - pad, max + pad]} tickFormatter={(v: number) => v.toFixed(3).replace(".", ",")} tickCount={4} />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3", strokeWidth: 1 }}
              content={<ChartTooltip formatter={(v) => `${fmt(v)} lei`} labelFormatter={(l) => formatDateLong(String(l))} />}
            />
            <Area
              type="monotone"
              dataKey="v"
              name={`1 ${currency}`}
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill={`url(#${id})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              animationDuration={900}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function BnrTool({ cached, series }: { cached: { date: string; rates: Record<string, number> } | null; series: RatePoint[] }) {
  const [state, setState] = React.useState<RatesResult | null>(cached ? { ...cached, source: "cache", error: null } : null);
  const [loading, setLoading] = React.useState(true);
  const [showAll, setShowAll] = React.useState(false);
  const [amount, setAmount] = React.useState<number | "">(1000);
  const [from, setFrom] = React.useState("EUR");
  const [to, setTo] = React.useState("RON");

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await refreshBnrAction();
      if (r.ok) setState(r.data);
      else setState((s) => (s ? { ...s, source: "cache", error: r.error } : s));
    } catch {
      setState((s) => (s ? { ...s, source: "cache", error: "Eroare de rețea." } : s));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const rates = state?.rates ?? { RON: 1 };
  const codes = Object.keys(rates).filter((c) => c !== "RON");
  const ordered = [...MAIN.filter((c) => codes.includes(c)), ...codes.filter((c) => !MAIN.includes(c)).sort()];
  const shown = showAll ? ordered : ordered.slice(0, 8);
  const prevPoint = [...series].reverse().find((p) => state && p.date < state.date);
  const result = amount === "" || !rates[from] || !rates[to] ? 0 : (amount * rates[from]) / rates[to];

  if (!state) {
    return (
      <Card className="grid min-h-60 place-items-center p-6">
        {loading ? (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" /> Se descarcă cursul BNR…
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Cursul BNR nu este disponibil momentan.</span>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
            <Landmark className="size-5" />
          </div>
          <div>
            <p className="font-semibold">Cursul BNR din {formatDateLong(state.date)}</p>
            <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              {state.source === "live" ? (
                <>
                  <span className="size-2 rounded-full bg-success" /> preluat live de la bnr.ro
                </>
              ) : (
                <>
                  <span className="size-2 rounded-full bg-warning" /> din cache local{state.error ? ` — ${state.error}` : ""}
                </>
              )}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} loading={loading}>
          {!loading && <RefreshCw />} Actualizează
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeaderRow icon={<Landmark />} title="Cursuri de referință" description="Lei pentru o unitate de monedă străină." />
          <CardContent>
            <Stagger className="grid gap-2.5 sm:grid-cols-2" key={`${state.date}-${showAll}`} stagger={0.03}>
              {shown.map((c) => (
                <StaggerItem key={c}>
                  <button
                    type="button"
                    onClick={() => {
                      setFrom(c);
                      setTo("RON");
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all hover:border-primary/40 hover:bg-muted/40",
                      from === c && to === "RON" ? "border-primary/50 bg-primary-soft/30" : "border-border",
                    )}
                  >
                    <span className="grid h-8 w-11 shrink-0 place-items-center rounded-md bg-muted font-mono text-xs font-bold">{c}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-muted-foreground">{NAMES[c] ?? c}</span>
                      <span className="block font-semibold tabular">{fmt(rates[c])}</span>
                    </span>
                    {(c === "EUR" || c === "USD") && <Delta now={rates[c]} prev={prevPoint?.[c]} />}
                  </button>
                </StaggerItem>
              ))}
            </Stagger>
            {ordered.length > 8 && (
              <Button variant="ghost" size="sm" className="mt-3" onClick={() => setShowAll((s) => !s)}>
                {showAll ? "Arată mai puține" : `Toate cele ${ordered.length} monede`}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="relative h-fit overflow-hidden">
          <div className="pointer-events-none absolute -top-20 -right-16 size-56 rounded-full bg-primary/15 blur-3xl" />
          <CardHeaderRow icon={<Calculator />} title="Convertor valutar" description={`La cursul BNR din ${formatDate(state.date)}`} />
          <CardContent className="relative space-y-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground">Din</span>
                <NativeSelect value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Moneda sursă">
                  {["RON", ...ordered].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <Hint content="Inversează">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Inversează monedele"
                  onClick={() => {
                    setFrom(to);
                    setTo(from);
                  }}
                >
                  <motion.span whileTap={{ rotate: 180 }} className="inline-flex">
                    <ArrowLeftRight />
                  </motion.span>
                </Button>
              </Hint>
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground">În</span>
                <NativeSelect value={to} onChange={(e) => setTo(e.target.value)} aria-label="Moneda țintă">
                  {["RON", ...ordered].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
            <div className="relative">
              <Input
                type="number"
                min={0}
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                className="h-12 pr-16 text-lg font-semibold"
                aria-label="Sumă"
              />
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 font-mono text-sm text-muted-foreground">{from}</span>
            </div>
            <div className="rounded-xl bg-gradient-to-br from-primary to-accent p-5 text-white shadow-glow">
              <p className="text-xs text-white/80">Rezultat</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight tabular">
                <AnimatedNumber key={`${from}-${to}`} value={result} format={(v) => fmt(v, 2)} duration={0.6} /> <span className="text-lg font-medium text-white/85">{to}</span>
              </p>
              <p className="mt-2 text-xs text-white/80">
                1 {from} = {rates[from] && rates[to] ? fmt(rates[from] / rates[to]) : "—"} {to}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeaderRow
          icon={<LineIcon />}
          title="Evoluție în ultimele 30 de zile"
          description="Curs de referință BNR (zilele lucrătoare). Fiecare monedă are propria scală."
          actions={<Badge tone="neutral">{series.length} zile</Badge>}
        />
        <CardContent className="grid gap-8 md:grid-cols-2">
          <RateChart currency="EUR" data={series} />
          <RateChart currency="USD" data={series} />
        </CardContent>
      </Card>
    </div>
  );
}
