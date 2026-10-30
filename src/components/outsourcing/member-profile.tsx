"use client";

import { Activity, CalendarRange, Clock, FolderKanban, Mail, Palmtree, Pencil, Percent, Phone, Sparkles, Timer, TrendingUp } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartLegend, ChartTooltip, axisProps, gridProps } from "@/components/charts/chart-kit";
import { AnimatedBar, Stagger, StaggerItem } from "@/components/motion";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { Avatar } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/page";
import { StatCard } from "@/components/ui/stat-card";
import { EMPLOYMENT_TYPE_LABELS, PROJECT_STATUS, SENIORITY_LABELS, TIME_OFF_TYPE } from "@/lib/constants";
import { formatDateLong, formatHours, formatMoney } from "@/lib/format";
import { rangeLabel } from "@/lib/outsourcing/dates";
import { pct } from "@/lib/outsourcing/metrics";
import type { MemberFormData } from "@/lib/outsourcing/types";
import { cn } from "@/lib/utils";
import { MemberDialog } from "./member-dialog";

export type MemberProfileData = {
  member: MemberFormData & { id: string };
  hasUser: boolean;
  stats: { monthHours: number; monthBillablePct: number; utilization: number; hours4w: number; capacity4w: number; revenueEur: number; totalHours: number };
  weekly: Record<string, number | string>[];
  series: { id: string; name: string; color: string }[];
  projects: { id: string; name: string; code: string | null; color: string; status: string; role: string | null; hours: number; rate: number; currency: string }[];
  allocations: { id: string; projectName: string; projectColor: string; projectCode: string | null; startDate: string; endDate: string; hoursPerDay: number; notes: string | null; current: boolean }[];
  timeOff: { id: string; type: string; startDate: string; endDate: string; status: string; days: number; upcoming: boolean }[];
};

const TO_STATUS = {
  pending: { label: "În așteptare", tone: "warning" as const },
  approved: { label: "Aprobat", tone: "success" as const },
  rejected: { label: "Respins", tone: "danger" as const },
};

export function MemberProfile({
  data,
  canManage,
  showMoney,
  isMe,
  canSeeTimesheet,
}: {
  data: MemberProfileData;
  canManage: boolean;
  showMoney: boolean;
  isMe: boolean;
  canSeeTimesheet: boolean;
}) {
  const { member: m, stats } = data;
  const [edit, setEdit] = React.useState(false);
  const weeklyCap = m.weeklyCapacity;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
      >
        <div className="relative h-24" style={{ background: `linear-gradient(120deg, color-mix(in oklab, ${m.color} 40%, var(--card)), color-mix(in oklab, ${m.color} 8%, var(--card)) 70%)` }}>
          <div className="absolute inset-0 bg-dots opacity-40" />
        </div>
        <div className="relative flex flex-col gap-4 px-5 pb-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
            <Avatar name={m.name} color={m.color} size="xl" className="-mt-10 size-20 text-2xl ring-4" />
            <div className="min-w-0 sm:pt-3">
              <nav className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Link href="/echipa" className="hover:text-foreground">
                  Echipă
                </Link>
                <span className="opacity-50">/</span>
                <span className="truncate">{m.department ?? "—"}</span>
              </nav>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">{m.name}</h1>
                {isMe && <Badge tone="brand">tu</Badge>}
                {!m.active && <Badge tone="warning">inactiv</Badge>}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{m.position ?? "—"}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground">
                <Badge>{SENIORITY_LABELS[m.seniority]}</Badge>
                <span>{EMPLOYMENT_TYPE_LABELS[m.employmentType]}</span>
                {m.email && (
                  <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1.5 hover:text-primary">
                    <Mail className="size-3.5" /> {m.email}
                  </a>
                )}
                {m.phone && (
                  <a href={`tel:${m.phone}`} className="inline-flex items-center gap-1.5 hover:text-primary">
                    <Phone className="size-3.5" /> {m.phone}
                  </a>
                )}
                {m.startDate && <span>în echipă din {formatDateLong(m.startDate)}</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canSeeTimesheet && (
              <Button variant="outline" asChild>
                <Link href={isMe ? "/pontaj" : `/pontaj?membru=${m.id}`}>
                  <Timer /> Pontaj
                </Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href="/planificare">
                <CalendarRange /> Planificare
              </Link>
            </Button>
            {canManage && (
              <Button onClick={() => setEdit(true)}>
                <Pencil /> Editează
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Ore luna aceasta" value={stats.monthHours} format="hours" icon={<Clock />} hint={`${formatHours(stats.totalHours)} în total`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Facturabil (luna)" value={stats.monthBillablePct} format="percent" icon={<Percent />} tone="info" hint="din orele pontate" />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Utilizare (4 săpt.)"
            value={stats.utilization}
            format="percent"
            icon={<Activity />}
            tone={stats.utilization > 100 ? "danger" : stats.utilization >= 80 ? "success" : "warning"}
            hint={`${formatHours(stats.hours4w)} din ${formatHours(stats.capacity4w)}`}
          />
        </StaggerItem>
        <StaggerItem>
          {showMoney ? (
            <StatCard label="Venit generat (luna)" value={stats.revenueEur} format="money" currency="EUR" icon={<TrendingUp />} tone="success" hint="ore facturabile × tarif" />
          ) : (
            <StatCard label="Capacitate" value={weeklyCap} format="hours" icon={<TrendingUp />} tone="success" hint="pe săptămână" />
          )}
        </StaggerItem>
      </Stagger>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeaderRow title="Ore pe săptămână" description={`Ultimele 12 săptămâni · capacitate ${formatHours(weeklyCap)}/săpt.`} icon={<Clock />} />
          <CardContent>
            {data.series.length ? (
              <>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.weekly} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barCategoryGap="24%">
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
                      <YAxis {...axisProps} allowDecimals={false} />
                      <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTooltip formatter={(v) => formatHours(v)} labelFormatter={(l) => `Săptămâna din ${l}`} />} />
                      <ReferenceLine y={weeklyCap} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
                      {data.series.map((s, i) => (
                        <Bar key={s.id} dataKey={s.id} name={s.name} stackId="h" fill={s.color} radius={i === data.series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} animationDuration={900} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3">
                  <ChartLegend items={data.series.map((s) => ({ label: s.name, color: s.color }))} />
                </div>
              </>
            ) : (
              <EmptyState compact icon={<Clock />} title="Nicio oră pontată recent" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeaderRow title="Competențe" icon={<Sparkles />} />
          <CardContent>
            {m.skills.length ? (
              <div className="flex flex-wrap gap-1.5">
                {m.skills.map((s, i) => (
                  <motion.span
                    key={s}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="rounded-lg bg-primary-soft px-2.5 py-1 text-[13px] font-medium text-primary-soft-foreground"
                  >
                    {s}
                  </motion.span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nicio competență adăugată.</p>
            )}
            {showMoney && (
              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Tarif facturabil</div>
                  <div className="font-semibold tabular">{m.hourlyRate ? `${formatMoney(m.hourlyRate, m.rateCurrency)}/h` : "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Cost intern</div>
                  <div className="font-semibold tabular">{formatMoney(m.hourlyCost, "RON")}/h</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeaderRow title="Proiecte" description={`${data.projects.length} proiecte`} icon={<FolderKanban />} />
          {data.projects.length ? (
            <ul className="divide-y divide-border border-t border-border">
              {data.projects.map((p) => (
                <li key={p.id}>
                  <Link href={`/proiecte/${p.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
                    <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: p.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{p.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {p.role ?? "Membru"}
                        {showMoney && p.rate > 0 && ` · ${formatMoney(p.rate, p.currency)}/h`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[13px] font-semibold tabular">{formatHours(p.hours)}</div>
                      <StatusBadge status={p.status} map={PROJECT_STATUS} className="mt-0.5" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <CardContent>
              <EmptyState compact icon={<FolderKanban />} title="Niciun proiect" />
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeaderRow title="Alocări curente și viitoare" icon={<CalendarRange />} />
          <CardContent>
            {data.allocations.length ? (
              <ul className="space-y-3">
                {data.allocations.map((a) => {
                  const loadPct = pct(a.hoursPerDay, weeklyCap / 5);
                  return (
                    <li key={a.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="size-2.5 shrink-0 rounded-full" style={{ background: a.projectColor }} />
                          <span className="truncate font-medium">{a.projectName}</span>
                          {a.current && <Badge tone="success" className="px-1.5 py-0 text-[10.5px]">acum</Badge>}
                        </span>
                        <span className="shrink-0 text-xs font-semibold tabular">{formatHours(a.hoursPerDay)}/zi</span>
                      </div>
                      <AnimatedBar value={loadPct} color={a.projectColor} />
                      <div className="text-[11.5px] text-muted-foreground">{rangeLabel(a.startDate, a.endDate)}</div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState compact icon={<CalendarRange />} title="Nicio alocare" description="Planifică-l pe un proiect din Planificare echipă." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeaderRow title="Concedii" icon={<Palmtree />} />
          <CardContent>
            {data.timeOff.length ? (
              <ul className="space-y-2.5">
                {data.timeOff.map((t) => {
                  const meta = TIME_OFF_TYPE[t.type] ?? TIME_OFF_TYPE.other;
                  return (
                    <li key={t.id} className={cn("flex items-center gap-3 rounded-lg border border-border p-2.5", !t.upcoming && "opacity-60")}>
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in oklab, ${meta.color} 18%, transparent)`, color: meta.color }}>
                        <Palmtree className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium">{meta.label}</div>
                        <div className="text-[11.5px] text-muted-foreground">
                          {rangeLabel(t.startDate, t.endDate)} · {t.days} {t.days === 1 ? "zi" : "zile"} lucrătoare
                        </div>
                      </div>
                      <StatusBadge status={t.status} map={TO_STATUS} />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState compact icon={<Palmtree />} title="Niciun concediu programat" />
            )}
            <Button variant="ghost" size="sm" asChild className="mt-3 w-full">
              <Link href="/concedii">Toate concediile →</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {canManage && <MemberDialog open={edit} onOpenChange={setEdit} member={m} showMoney={showMoney} redirectOnDelete="/echipa" />}
    </div>
  );
}

