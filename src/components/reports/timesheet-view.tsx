"use client";

import { Activity, CalendarCheck, Clock, Gauge, Grid3x3, Hourglass, Timer } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Stagger, StaggerItem, motion } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeaderRow } from "@/components/ui/card";
import type { Column } from "@/components/ui/data-table";
import { NativeSelect } from "@/components/ui/input";
import { Avatar, ColorDot } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/page";
import { Tooltip } from "@/components/ui/popover";
import { StatCard } from "@/components/ui/stat-card";
import { Segmented } from "@/components/ui/tabs";
import { TIME_ENTRY_STATUS } from "@/lib/constants";
import { formatDate, formatHours, formatPercent } from "@/lib/format";
import type { TimesheetEntryRow, TimesheetReport } from "@/lib/reports/timesheet";
import { cn } from "@/lib/utils";
import { ExportMenu, ReportTable, type CsvExport } from "./report-kit";

type Filters = { project: string; member: string; status: "all" | "approved" };

/** Filtre (proiect, membru, status) sincronizate cu URL-ul. */
export function TimesheetFilters({ data, filters }: { data: TimesheetReport; filters: Filters }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-soft transition-opacity sm:flex-row sm:items-center print:hidden", pending && "opacity-70")}>
      <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-xl">
        <NativeSelect value={filters.project} onChange={(e) => set("project", e.target.value)} className="h-8" aria-label="Proiect">
          <option value="">Toate proiectele</option>
          {data.options.projects.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={filters.member} onChange={(e) => set("member", e.target.value)} className="h-8" aria-label="Membru">
          <option value="">Toți membrii</option>
          {data.options.members.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Segmented
        size="sm"
        value={filters.status}
        onChange={(v) => set("status", v === "approved" ? "approved" : "")}
        options={[
          { value: "all", label: "Toate orele" },
          { value: "approved", label: "Doar aprobate" },
        ]}
      />
    </div>
  );
}

function utilTone(pct: number) {
  if (pct >= 110) return "danger" as const;
  if (pct >= 75) return "success" as const;
  if (pct >= 50) return "warning" as const;
  return "neutral" as const;
}

const entryColumns = (data: TimesheetReport): Column<TimesheetEntryRow>[] => {
  const members = new Map(data.members.map((m) => [m.id, m]));
  const projects = new Map(data.projects.map((p) => [p.id, p]));
  return [
    { key: "date", header: "Data", sortValue: (r) => r.date, csv: (r) => formatDate(r.date), cell: (r) => <span className="tabular">{formatDate(r.date)}</span> },
    {
      key: "member",
      header: "Membru",
      sortValue: (r) => members.get(r.memberId)?.name ?? "",
      cell: (r) => {
        const m = members.get(r.memberId);
        return m ? (
          <span className="flex items-center gap-2">
            <Avatar name={m.name} color={m.color} size="xs" />
            <span className="truncate">{m.name}</span>
          </span>
        ) : (
          "—"
        );
      },
    },
    {
      key: "project",
      header: "Proiect",
      sortValue: (r) => projects.get(r.projectId)?.name ?? "",
      cell: (r) => {
        const p = projects.get(r.projectId);
        return (
          <span className="flex max-w-56 items-center gap-2">
            {p && <ColorDot color={p.color} />}
            <span className="truncate">{p?.name ?? "—"}</span>
          </span>
        );
      },
    },
    { key: "description", header: "Descriere", hideOnMobile: true, sortValue: (r) => r.description ?? "", cell: (r) => <span className="line-clamp-1 max-w-72 text-muted-foreground">{r.description ?? "—"}</span> },
    { key: "billable", header: "Facturabil", align: "center", hideOnMobile: true, sortValue: (r) => (r.billable ? 1 : 0), csv: (r) => (r.billable ? "Da" : "Nu"), cell: (r) => (r.billable ? <Badge tone="success">Da</Badge> : <Badge>Nu</Badge>) },
    { key: "status", header: "Status", hideOnMobile: true, sortValue: (r) => TIME_ENTRY_STATUS[r.status]?.label ?? r.status, cell: (r) => <Badge tone={TIME_ENTRY_STATUS[r.status]?.tone}>{TIME_ENTRY_STATUS[r.status]?.label ?? r.status}</Badge> },
    { key: "hours", header: "Ore", align: "right", sortValue: (r) => r.hours, cell: (r) => <span className="font-medium">{formatHours(r.hours)}</span> },
  ];
};

export function TimesheetView({ data }: { data: TimesheetReport }) {
  const k = data.kpis;
  const max = data.maxCell || 1;
  const columns = React.useMemo(() => entryColumns(data), [data]);

  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Ore pontate" value={k.totalHours} format="hours" icon={<Clock />} hint={`${k.workingDays} zile lucrătoare până la ${formatDate(k.capTo)}`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Ore facturabile" value={k.billableHours} format="hours" icon={<Timer />} tone="success" hint={`${formatPercent(k.billablePct)} din total`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Grad de utilizare" value={k.utilization} format="percent" icon={<Gauge />} tone={k.utilization >= 75 ? "info" : "warning"} hint={`capacitate ${formatHours(k.capacity)}`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Ore neaprobate" value={k.pendingHours} format="hours" icon={<Hourglass />} tone={k.pendingHours ? "warning" : "brand"} hint="ciorne și trimise spre aprobare" />
        </StaggerItem>
      </Stagger>

      {data.entries.length === 0 ? (
        <Card>
          <EmptyState icon={<CalendarCheck />} title="Nicio oră pontată" description="Nu există înregistrări de pontaj pentru filtrele și perioada selectate." />
        </Card>
      ) : (
        <>
          <Card className="report-section overflow-hidden">
            <CardHeaderRow title="Ore pe membru × proiect" description="Intensitatea culorii arată volumul de ore; ultima coloană — utilizarea față de capacitate." icon={<Grid3x3 />} />
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full border-separate border-spacing-[3px] px-3 pb-4 text-[12.5px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 min-w-44 bg-card px-2 py-2 text-left text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">Membru</th>
                    {data.projects.map((p) => (
                      <th key={p.id} className="min-w-20 px-1 py-2 align-bottom">
                        <Tooltip content={p.name}>
                          <div className="mx-auto flex max-w-24 flex-col items-center gap-1">
                            <ColorDot color={p.color} />
                            <span className="line-clamp-2 text-center text-[11px] leading-tight font-medium text-muted-foreground">{p.name.split(" — ")[0]}</span>
                          </div>
                        </Tooltip>
                      </th>
                    ))}
                    <th className="min-w-20 px-2 py-2 text-right text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">Total</th>
                    <th className="min-w-16 px-2 py-2 text-right text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">Fact.</th>
                    <th className="min-w-36 px-2 py-2 text-left text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">Utilizare</th>
                  </tr>
                </thead>
                <tbody>
                  {data.members.map((m, ri) => (
                    <tr key={m.id}>
                      <td className="sticky left-0 z-10 bg-card px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <Avatar name={m.name} color={m.color} size="sm" />
                          <div className="min-w-0">
                            <div className="truncate font-medium">{m.name}</div>
                            <div className="truncate text-[11px] text-muted-foreground">{m.position ?? m.department ?? ""}</div>
                          </div>
                        </div>
                      </td>
                      {data.projects.map((p, ci) => {
                        const c = data.cells[m.id]?.[p.id];
                        const intensity = c ? Math.sqrt(c.hours / max) : 0;
                        return (
                          <td key={p.id} className="p-0">
                            {c ? (
                              <Tooltip content={`${m.name} · ${p.name}: ${formatHours(c.hours)} (${formatHours(c.billable)} facturabile)`}>
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.85 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ duration: 0.35, delay: Math.min(0.6, (ri + ci) * 0.018), ease: [0.16, 1, 0.3, 1] }}
                                  className={cn("grid h-10 place-items-center rounded-md font-medium tabular", intensity > 0.55 ? "text-white" : "text-foreground")}
                                  style={{ background: `color-mix(in oklab, var(--primary) ${Math.round(12 + intensity * 80)}%, var(--card))` }}
                                >
                                  {formatHours(c.hours)}
                                </motion.div>
                              </Tooltip>
                            ) : (
                              <div className="grid h-10 place-items-center rounded-md bg-muted/40 text-muted-foreground/40">·</div>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-2 text-right font-semibold tabular">{formatHours(m.hours)}</td>
                      <td className="px-2 text-right text-muted-foreground tabular">{m.hours ? formatPercent(m.billablePct) : "—"}</td>
                      <td className="px-2">
                        <Tooltip content={`${formatHours(m.hours)} din ${formatHours(m.capacity)} capacitate${m.leaveDays ? ` · ${m.leaveDays} zile concediu` : ""}`}>
                          <div className="flex items-center gap-2">
                            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                              <motion.div
                                className="absolute inset-y-0 left-0 rounded-full bg-primary/35"
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(100, m.utilization)}%` }}
                                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                              />
                              <motion.div
                                className="absolute inset-y-0 left-0 rounded-full bg-primary"
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(100, m.billableUtilization)}%` }}
                                transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                              />
                            </div>
                            <Badge tone={utilTone(m.utilization)} className="w-12 justify-center">
                              {formatPercent(m.utilization)}
                            </Badge>
                          </div>
                        </Tooltip>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="sticky left-0 z-10 bg-card px-2 py-2 text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">Total proiect</td>
                    {data.projects.map((p) => (
                      <td key={p.id} className="px-1 py-2 text-center font-semibold tabular">
                        {formatHours(p.hours)}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right font-semibold tabular">{formatHours(k.totalHours)}</td>
                    <td className="px-2 py-2 text-right text-muted-foreground tabular">{formatPercent(k.billablePct)}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{formatPercent(k.utilization)} din capacitate</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-5 py-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="flex gap-0.5">
                  {[0.15, 0.4, 0.65, 0.9].map((v) => (
                    <span key={v} className="size-3 rounded-sm" style={{ background: `color-mix(in oklab, var(--primary) ${Math.round(12 + v * 80)}%, var(--card))` }} />
                  ))}
                </span>
                puține → multe ore
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-5 rounded-full bg-primary" /> ore facturabile
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-5 rounded-full bg-primary/35" /> ore nefacturabile
              </span>
              <span className="flex items-center gap-1.5">
                <Activity className="size-3.5" /> capacitate = normă săptămânală × zile lucrătoare (fără weekend, sărbători legale, concedii aprobate)
              </span>
            </div>
          </Card>

          <ReportTable
            rows={data.entries}
            columns={columns}
            getRowId={(r) => r.id}
            search={(r) => `${r.description ?? ""} ${data.members.find((m) => m.id === r.memberId)?.name ?? ""} ${data.projects.find((p) => p.id === r.projectId)?.name ?? ""}`}
            searchPlaceholder="Caută în descrieri, membri, proiecte…"
            filters={[
              {
                key: "billable",
                label: "Facturabil",
                options: [
                  { value: "1", label: "Da" },
                  { value: "0", label: "Nu" },
                ],
                predicate: (r, v) => (v === "1") === r.billable,
              },
            ]}
            defaultSort={{ key: "date", dir: "desc" }}
            pageSize={20}
            dense
            printTitle="Înregistrări de pontaj"
          />
        </>
      )}
    </div>
  );
}

export function TimesheetExport({ data }: { data: TimesheetReport }) {
  const members = new Map(data.members.map((m) => [m.id, m.name]));
  const projects = new Map(data.projects.map((p) => [p.id, p.name]));
  const exports: CsvExport[] = [
    {
      label: "Matrice membru × proiect",
      filename: "pontaj-matrice",
      columns: [
        { key: "member", label: "Membru" },
        ...data.projects.map((p) => ({ key: p.id, label: p.name })),
        { key: "total", label: "Total ore" },
        { key: "billable", label: "Ore facturabile" },
        { key: "billablePct", label: "% facturabil" },
        { key: "capacity", label: "Capacitate (ore)" },
        { key: "utilization", label: "Utilizare %" },
      ],
      rows: data.members.map((m) => ({
        member: m.name,
        ...Object.fromEntries(data.projects.map((p) => [p.id, data.cells[m.id]?.[p.id]?.hours ?? 0])),
        total: m.hours,
        billable: m.billable,
        billablePct: Number(m.billablePct.toFixed(1)),
        capacity: m.capacity,
        utilization: Number(m.utilization.toFixed(1)),
      })),
    },
    {
      label: "Înregistrări detaliate",
      filename: "pontaj-detaliat",
      columns: [
        { key: "date", label: "Data" },
        { key: "member", label: "Membru" },
        { key: "project", label: "Proiect" },
        { key: "description", label: "Descriere" },
        { key: "hours", label: "Ore" },
        { key: "billable", label: "Facturabil" },
        { key: "status", label: "Status" },
      ],
      rows: data.entries.map((e) => ({
        date: formatDate(e.date),
        member: members.get(e.memberId) ?? "",
        project: projects.get(e.projectId) ?? "",
        description: e.description,
        hours: e.hours,
        billable: e.billable ? "Da" : "Nu",
        status: TIME_ENTRY_STATUS[e.status]?.label ?? e.status,
      })),
    },
  ];
  return <ExportMenu exports={exports} />;
}
