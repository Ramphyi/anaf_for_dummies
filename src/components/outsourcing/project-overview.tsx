"use client";

import { Banknote, Clock, Coins, Gauge, ListChecks, Percent, Receipt, TrendingUp, Users } from "lucide-react";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AreaGradient, ChartLegend, ChartTooltip, axisProps, gridProps } from "@/components/charts/chart-kit";
import { AnimatedBar, Stagger, StaggerItem } from "@/components/motion";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { Avatar } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/page";
import { StatCard } from "@/components/ui/stat-card";
import { TASK_STATUS } from "@/lib/constants";
import { formatHours, formatMoney, formatPercent } from "@/lib/format";
import { budgetTone, pct } from "@/lib/outsourcing/metrics";
import type { ProjectDetailData } from "./project-detail";

export function ProjectOverview({ data, showMoney }: { data: ProjectDetailData; showMoney: boolean }) {
  const { stats, project: p } = data;
  const billablePct = pct(stats.billableHours, stats.hours);
  const budgetPct = stats.budget.percent;
  const tone = budgetTone(budgetPct);
  const openTasks = data.tasks.filter((t) => t.status !== "done").length;

  const topTasks = [...data.tasks].filter((t) => t.loggedHours > 0).sort((a, b) => b.loggedHours - a.loggedHours).slice(0, 6);
  const maxTask = Math.max(1, ...topTasks.map((t) => Math.max(t.loggedHours, t.estimateHours ?? 0)));
  const memberBreakdown = [...data.members].filter((m) => m.hours > 0).sort((a, b) => b.hours - a.hours);

  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StaggerItem>
          <StatCard label="Ore totale" value={stats.hours} format="hours" icon={<Clock />} hint={`${formatHours(stats.monthHours)} luna aceasta`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Ore facturabile" value={stats.billableHours} format="hours" icon={<Receipt />} tone="info" hint={`${formatPercent(billablePct)} din total`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Buget consumat"
            value={budgetPct ?? 0}
            format="percent"
            icon={<Gauge />}
            tone={tone === "brand" ? "brand" : tone}
            hint={
              budgetPct === null
                ? p.billingType === "retainer"
                  ? "retainer lunar — fără plafon"
                  : "proiectul nu are buget"
                : stats.budget.unit === "hours"
                  ? `${Math.round(stats.budget.used)} din ${stats.budget.total} h`
                  : stats.budget.total
                    ? `${formatMoney(stats.budget.used, p.currency, { compact: true })} din ${formatMoney(stats.budget.total, p.currency, { compact: true })}`
                    : undefined
            }
          />
        </StaggerItem>
        {showMoney ? (
          <>
            <StaggerItem>
              <StatCard
                label="Venit estimat"
                value={stats.revenue}
                format="money"
                currency={p.currency}
                icon={<TrendingUp />}
                tone="success"
                hint={p.billingType === "retainer" ? "retainer × luni cu activitate" : "ore facturabile × tarif"}
              />
            </StaggerItem>
            <StaggerItem>
              <StatCard label="Cost intern" value={stats.costRon} format="money" currency="RON" icon={<Coins />} tone="warning" hint="ore × cost orar" />
            </StaggerItem>
            <StaggerItem>
              <StatCard
                label="Marjă"
                value={stats.marginRon}
                format="money"
                currency="RON"
                icon={<Percent />}
                tone={stats.marginRon >= 0 ? "success" : "danger"}
                hint={stats.revenueRon > 0 ? `${formatPercent(stats.marginPct)} din venit (RON)` : "fără venit facturabil"}
              />
            </StaggerItem>
          </>
        ) : (
          <>
            <StaggerItem>
              <StatCard label="Task-uri deschise" value={openTasks} format="number" icon={<ListChecks />} tone="warning" hint={`${data.tasks.length} în total`} />
            </StaggerItem>
            <StaggerItem>
              <StatCard label="Membri în echipă" value={data.members.length} format="number" icon={<Users />} tone="info" />
            </StaggerItem>
            <StaggerItem>
              <StatCard label="Ore aprobate nefacturate" value={stats.uninvoicedApprovedHours} format="hours" icon={<Banknote />} tone="success" />
            </StaggerItem>
          </>
        )}
      </Stagger>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeaderRow title="Ore pe săptămână" description="Ultimele 12 săptămâni, pe membri" icon={<Clock />} />
          <CardContent>
            {data.series.length ? (
              <>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.weekly} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barCategoryGap="22%">
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
                      <YAxis {...axisProps} allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                        content={<ChartTooltip formatter={(v) => formatHours(v)} labelFormatter={(l) => `Săptămâna din ${l}`} />}
                      />
                      {data.series.map((s, i) => (
                        <Bar
                          key={s.id}
                          dataKey={s.id}
                          name={s.name}
                          stackId="h"
                          fill={s.color}
                          radius={i === data.series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                          animationDuration={900}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3">
                  <ChartLegend items={data.series.map((s) => ({ label: s.name, color: s.color }))} />
                </div>
              </>
            ) : (
              <EmptyState compact icon={<Clock />} title="Nicio oră pontată recent" description="Orele pontate de echipă apar aici." />
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeaderRow
            title="Consum buget"
            description={data.burn.unit === "money" ? `Venit cumulat (${p.currency}) vs. plan` : "Ore cumulate vs. plan liniar"}
            icon={<Gauge />}
          />
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.burn.points} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <AreaGradient id="burn-fill" color={p.color} opacity={0.35} />
                  </defs>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis {...axisProps} width={52} tickFormatter={(v) => (data.burn.unit === "money" ? `${Math.round(Number(v) / 1000)}k` : String(v))} />
                  <Tooltip
                    content={
                      <ChartTooltip
                        formatter={(v) => (data.burn.unit === "money" ? formatMoney(v, p.currency) : formatHours(v))}
                        labelFormatter={(l) => `Săptămâna din ${l}`}
                      />
                    }
                  />
                  {data.burn.total && (
                    <ReferenceLine
                      y={data.burn.total}
                      stroke="var(--danger)"
                      strokeDasharray="4 4"
                      label={{ value: "Buget", position: "insideTopRight", fill: "var(--danger)", fontSize: 11 }}
                    />
                  )}
                  <Area type="monotone" dataKey="actual" name="Consumat" stroke={p.color} strokeWidth={2} fill="url(#burn-fill)" animationDuration={1000} />
                  {data.burn.points.some((x) => x.ideal !== null) && (
                    <Line type="monotone" dataKey="ideal" name="Plan" stroke="var(--muted-foreground)" strokeDasharray="5 4" dot={false} strokeWidth={1.5} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {budgetPct !== null && (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Consumat</span>
                  <span className="font-semibold tabular">{formatPercent(budgetPct)}</span>
                </div>
                <AnimatedBar value={budgetPct} color={{ brand: "var(--primary)", success: "var(--success)", warning: "var(--warning)", danger: "var(--danger)" }[tone]} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeaderRow title="Top task-uri" description="După orele pontate, comparat cu estimarea" icon={<ListChecks />} />
          <CardContent>
            {topTasks.length ? (
              <ul className="space-y-4">
                {topTasks.map((t) => {
                  const over = t.estimateHours ? t.loggedHours > t.estimateHours : false;
                  return (
                    <li key={t.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate font-medium">{t.title}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <StatusBadge status={t.status} map={TASK_STATUS} />
                          <span className={over ? "font-semibold text-danger tabular" : "font-medium tabular"}>
                            {formatHours(t.loggedHours)}
                            {t.estimateHours ? <span className="font-normal text-muted-foreground"> / {formatHours(t.estimateHours)}</span> : null}
                          </span>
                        </span>
                      </div>
                      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        {t.estimateHours ? (
                          <div className="absolute inset-y-0 left-0 rounded-full bg-foreground/10" style={{ width: `${(t.estimateHours / maxTask) * 100}%` }} />
                        ) : null}
                        <AnimatedBar
                          value={(t.loggedHours / maxTask) * 100}
                          className="absolute inset-0"
                          color={over ? "var(--danger)" : p.color}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState compact icon={<ListChecks />} title="Nicio oră pe task-uri" description="Pontează ore pe task-uri pentru a vedea unde se duce timpul." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeaderRow title="Contribuție echipă" description="Ore pontate pe membru" icon={<Users />} />
          <CardContent>
            {memberBreakdown.length ? (
              <ul className="space-y-3.5">
                {memberBreakdown.map((m) => (
                  <li key={m.memberId} className="flex items-center gap-3">
                    <Avatar name={m.name} color={m.color} size="sm" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-medium">{m.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular">
                          <span className="font-semibold text-foreground">{formatHours(m.hours)}</span> · {formatPercent(pct(m.hours, stats.hours))}
                          {showMoney && m.effectiveRate > 0 && <> · {formatMoney(m.effectiveRate, p.currency)}/h</>}
                        </span>
                      </div>
                      <AnimatedBar value={pct(m.hours, memberBreakdown[0].hours)} color={m.color} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact icon={<Users />} title="Nicio contribuție încă" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
