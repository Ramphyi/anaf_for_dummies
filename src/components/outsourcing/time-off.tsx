"use client";

import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock, List, Palmtree, Plane, Plus, Stethoscope, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { Stagger, StaggerItem } from "@/components/motion";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Avatar } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/page";
import { Tooltip } from "@/components/ui/popover";
import { StatCard } from "@/components/ui/stat-card";
import { Segmented } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { TIME_OFF_TYPE } from "@/lib/constants";
import { formatMonth } from "@/lib/format";
import { addDaysIso, eachDayIso, holidayName, isWeekendIso, rangeLabel, weekStartOf, WEEKDAY_SHORT, workingDaysCount } from "@/lib/outsourcing/dates";
import type { MemberLite, TimeOffRow } from "@/lib/outsourcing/types";
import { cn } from "@/lib/utils";
import { decideTimeOffAction } from "@/app/(app)/concedii/actions";
import { useOpenFromUrl, useUrlState } from "./shared";
import { TIME_OFF_STATUS, TimeOffDialog, type TimeOffDraft } from "./time-off-dialog";

/** Zile de concediu de odihnă pe an (referință pentru contor; minimul legal este 20 zile lucrătoare). */
const ANNUAL_LEAVE = 21;

type Shared = { today: string; members: MemberLite[]; meId: string | null; canApprove: boolean };

export function NewTimeOffButton({ today, members, meId, canApprove }: Shared) {
  const [open, setOpen] = useOpenFromUrl();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> {canApprove ? "Concediu nou" : "Cere concediu"}
      </Button>
      <TimeOffDialog
        open={open}
        onOpenChange={setOpen}
        draft={{ startDate: today, endDate: today, memberId: meId ?? undefined }}
        members={members}
        meId={meId}
        canApprove={canApprove}
      />
    </>
  );
}

export function TimeOffView({ today, members, meId, canApprove, requests }: Shared & { requests: TimeOffRow[] }) {
  const [view, setView] = useUrlState<"calendar" | "lista">("vedere", "calendar");
  const [month, setMonth] = useUrlState<string>("luna", today.slice(0, 7));
  const [dialog, setDialog] = React.useState<{ open: boolean; draft: TimeOffDraft | null }>({ open: false, draft: null });
  const { run, pending } = useAction();
  const memberById = React.useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const year = today.slice(0, 4);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const visible = canApprove ? requests : requests.filter((r) => r.status !== "rejected" || r.memberId === meId);
  const pendingList = requests.filter((r) => r.status === "pending" && (canApprove || r.memberId === meId));
  const offToday = requests.filter((r) => r.status === "approved" && r.startDate <= today && r.endDate >= today);
  const next30 = requests.filter((r) => r.status === "approved" && r.startDate > today && r.startDate <= addDaysIso(today, 30));

  const daysInYear = (r: TimeOffRow) => {
    const s = r.startDate < yearStart ? yearStart : r.startDate;
    const e = r.endDate > yearEnd ? yearEnd : r.endDate;
    return s <= e ? workingDaysCount(s, e) : 0;
  };

  const counters = React.useMemo(() => {
    return members
      .filter((m) => m.active)
      .map((m) => {
        const mine = requests.filter((r) => r.memberId === m.id);
        const vacation = mine.filter((r) => r.type === "vacation" && r.status === "approved").reduce((a, r) => a + daysInYear(r), 0);
        const pendingDays = mine.filter((r) => r.status === "pending").reduce((a, r) => a + daysInYear(r), 0);
        const sick = mine.filter((r) => r.type === "sick" && r.status === "approved").reduce((a, r) => a + daysInYear(r), 0);
        const other = mine.filter((r) => !["vacation", "sick"].includes(r.type) && r.status === "approved").reduce((a, r) => a + daysInYear(r), 0);
        return { m, vacation, pendingDays, sick, other };
      })
      .sort((a, b) => b.vacation - a.vacation || a.m.name.localeCompare(b.m.name, "ro"));
  }, [members, requests]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalVacation = counters.reduce((a, c) => a + c.vacation, 0);
  const openEdit = (r: TimeOffRow) => setDialog({ open: true, draft: { ...r } });
  const openNew = (date: string) => setDialog({ open: true, draft: { startDate: date, endDate: date, memberId: canApprove ? undefined : (meId ?? undefined) } });

  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Cereri în așteptare" value={pendingList.length} format="number" icon={<Clock />} tone={pendingList.length ? "warning" : "success"} />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="În concediu azi"
            value={offToday.length}
            format="number"
            icon={<Palmtree />}
            tone="info"
            hint={offToday.length ? offToday.map((r) => memberById.get(r.memberId)?.name.split(" ")[0]).join(", ") : "toată echipa e prezentă"}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Plecări în următoarele 30 zile" value={next30.length} format="number" icon={<Plane />} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label={`Zile de odihnă luate în ${year}`} value={totalVacation} format="number" icon={<CalendarDays />} tone="success" hint="zile lucrătoare, toată echipa" />
        </StaggerItem>
      </Stagger>

      <AnimatePresence initial={false}>
        {pendingList.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Card className="border-warning/30">
              <CardHeaderRow
                icon={<Clock />}
                title={canApprove ? "De aprobat" : "Cererile tale în așteptare"}
                description={`${pendingList.length} ${pendingList.length === 1 ? "cerere" : "cereri"}`}
              />
              <ul className="divide-y divide-border border-t border-border">
                <AnimatePresence initial={false}>
                  {pendingList.map((r) => {
                    const m = memberById.get(r.memberId);
                    const t = TIME_OFF_TYPE[r.type] ?? TIME_OFF_TYPE.other;
                    return (
                      <motion.li key={r.id} layout exit={{ opacity: 0, x: 16 }} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center">
                        <button type="button" onClick={() => openEdit(r)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          {m && <Avatar name={m.name} color={m.color} size="sm" />}
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {m?.name ?? "—"} <span className="font-normal text-muted-foreground">· {t.label}</span>
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {rangeLabel(r.startDate, r.endDate)} · {daysLabel(workingDaysCount(r.startDate, r.endDate))}
                              {r.notes && ` · „${r.notes}”`}
                            </div>
                          </div>
                        </button>
                        {canApprove && (
                          <div className="flex shrink-0 gap-1.5">
                            <Button variant="ghost" size="sm" className="hover:text-danger" disabled={pending} onClick={() => run(() => decideTimeOffAction(r.id, "rejected"))}>
                              <X /> Respinge
                            </Button>
                            <Button variant="success" size="sm" disabled={pending} onClick={() => run(() => decideTimeOffAction(r.id, "approved"))}>
                              <Check /> Aprobă
                            </Button>
                          </div>
                        )}
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-6 2xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "calendar", label: "Calendar", icon: <CalendarDays /> },
                { value: "lista", label: "Listă", icon: <List /> },
              ]}
            />
            {view === "calendar" && (
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold first-letter:uppercase">{formatMonth(`${month}-01`)}</span>
                <div className="flex items-center rounded-xl border border-border bg-card p-0.5 shadow-soft">
                  <Button variant="ghost" size="icon-sm" aria-label="Luna anterioară" onClick={() => setMonth(shiftMonth(month, -1))}>
                    <ChevronLeft />
                  </Button>
                  <Button variant="ghost" size="sm" className="px-2.5" disabled={month === today.slice(0, 7)} onClick={() => setMonth(today.slice(0, 7))}>
                    Azi
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Luna următoare" onClick={() => setMonth(shiftMonth(month, 1))}>
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            )}
          </div>
          {view === "calendar" ? (
            <MonthCalendar month={month} today={today} requests={visible.filter((r) => r.status !== "rejected")} memberById={memberById} onOpen={openEdit} onNew={openNew} />
          ) : (
            <RequestsTable requests={visible} memberById={memberById} onOpen={openEdit} />
          )}
        </div>

        <Card className="h-fit">
          <CardHeaderRow icon={<Palmtree />} title={`Zile luate în ${year}`} description={`Concediu de odihnă din ${ANNUAL_LEAVE} zile / an`} />
          <CardContent>
            {counters.length ? (
              <ul className="grid gap-x-8 gap-y-3.5 md:grid-cols-2 2xl:grid-cols-1">
                {counters.map(({ m, vacation, pendingDays, sick, other }) => {
                  const pctUsed = Math.min(100, (vacation / ANNUAL_LEAVE) * 100);
                  const pctPending = Math.min(100 - pctUsed, (pendingDays / ANNUAL_LEAVE) * 100);
                  return (
                    <li key={m.id} className="flex items-center gap-3">
                      <Avatar name={m.name} color={m.color} size="sm" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-baseline justify-between gap-2 text-[13px]">
                          <span className="truncate font-medium">{m.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground tabular">
                            <span className="font-semibold text-foreground">{vacation}</span>/{ANNUAL_LEAVE}
                          </span>
                        </div>
                        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <motion.div className="h-full bg-info" initial={{ width: 0 }} animate={{ width: `${pctUsed}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
                          <motion.div
                            className="h-full bg-[repeating-linear-gradient(135deg,var(--warning)_0_3px,transparent_3px_6px)]"
                            initial={{ width: 0 }}
                            animate={{ width: `${pctPending}%` }}
                            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                          />
                        </div>
                        {(pendingDays > 0 || sick > 0 || other > 0) && (
                          <div className="flex flex-wrap gap-x-2.5 text-[10.5px] text-muted-foreground">
                            {pendingDays > 0 && <span className="text-warning">{pendingDays} în așteptare</span>}
                            {sick > 0 && (
                              <span className="inline-flex items-center gap-0.5">
                                <Stethoscope className="size-2.5" /> {sick} medical
                              </span>
                            )}
                            {other > 0 && <span>{other} altele</span>}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState compact icon={<Palmtree />} title="Nicio persoană activă" />
            )}
          </CardContent>
        </Card>
      </div>

      <TimeOffDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        draft={dialog.draft}
        members={members.filter((m) => m.active)}
        meId={meId}
        canApprove={canApprove}
      />
    </div>
  );
}

function daysLabel(n: number) {
  return `${n} ${n === 1 ? "zi lucrătoare" : "zile lucrătoare"}`;
}

function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* ------------------------------- Calendar ------------------------------- */

function MonthCalendar({
  month,
  today,
  requests,
  memberById,
  onOpen,
  onNew,
}: {
  month: string;
  today: string;
  requests: TimeOffRow[];
  memberById: Map<string, MemberLite>;
  onOpen: (r: TimeOffRow) => void;
  onNew: (date: string) => void;
}) {
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const last = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  const gridStart = weekStartOf(first);
  const gridEnd = addDaysIso(weekStartOf(last), 6);
  const days = eachDayIso(gridStart, gridEnd);
  const inMonth = requests.filter((r) => r.startDate <= gridEnd && r.endDate >= gridStart);

  return (
    <motion.div key={month} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
      <div className="grid grid-cols-7 border-b border-border bg-subtle/60">
        {WEEKDAY_SHORT.map((d, i) => (
          <div key={d} className={cn("px-2 py-2 text-center text-[11px] font-semibold tracking-wide text-muted-foreground uppercase", i >= 5 && "text-muted-foreground/60")}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const outside = d < first || d > last;
          const hol = holidayName(d);
          const weekend = isWeekendIso(d);
          const off = inMonth
            .filter((r) => r.startDate <= d && r.endDate >= d)
            .sort((a, b) => (a.status === b.status ? 0 : a.status === "approved" ? -1 : 1));
          const shown = off.slice(0, 3);
          return (
            <div
              key={d}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("[data-chip]")) return;
                onNew(d);
              }}
              className={cn(
                "group relative min-h-[92px] cursor-pointer border-border p-1.5 transition-colors hover:bg-muted/40 sm:min-h-[112px]",
                i % 7 !== 6 && "border-r",
                i < days.length - 7 && "border-b",
                (weekend || outside) && "bg-muted/30",
                hol && "bg-primary-soft/40",
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-xs font-semibold tabular",
                    outside && "text-muted-foreground/50",
                    d === today && "bg-primary text-primary-foreground shadow-glow",
                  )}
                >
                  {Number(d.slice(8))}
                </span>
                <Plus className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              {hol && <div className="mt-0.5 truncate px-0.5 text-[10px] font-medium text-primary-soft-foreground">{hol}</div>}
              <div className="mt-1 space-y-0.5">
                {shown.map((r) => {
                  const mem = memberById.get(r.memberId);
                  const t = TIME_OFF_TYPE[r.type] ?? TIME_OFF_TYPE.other;
                  return (
                    <Tooltip key={r.id} content={`${mem?.name ?? "—"} · ${t.label} · ${rangeLabel(r.startDate, r.endDate)}${r.status === "pending" ? " (în așteptare)" : ""}`}>
                      <button
                        type="button"
                        data-chip
                        onClick={() => onOpen(r)}
                        className={cn(
                          "flex w-full items-center gap-1 rounded-md border-l-2 py-0.5 pr-1 pl-1 text-left text-[10.5px] font-medium transition-transform hover:scale-[1.02]",
                          r.status === "pending" && "border-dashed opacity-70",
                        )}
                        style={{ borderLeftColor: t.color, background: `color-mix(in oklab, ${t.color} 14%, var(--card))` }}
                      >
                        {mem && <Avatar name={mem.name} color={mem.color} size="xs" className="size-4 text-[7px] ring-0" />}
                        <span className="hidden truncate sm:inline">{mem?.name.split(" ")[0] ?? "—"}</span>
                      </button>
                    </Tooltip>
                  );
                })}
                {off.length > 3 && <div className="px-1 text-[10px] text-muted-foreground">+{off.length - 3} alții</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border px-4 py-2.5 text-[11.5px] text-muted-foreground">
        {Object.entries(TIME_OFF_TYPE).map(([k, t]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: t.color }} />
            {t.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border border-dashed border-muted-foreground" /> în așteptare
        </span>
      </div>
    </motion.div>
  );
}

/* ------------------------------- Listă ------------------------------- */

function RequestsTable({ requests, memberById, onOpen }: { requests: TimeOffRow[]; memberById: Map<string, MemberLite>; onOpen: (r: TimeOffRow) => void }) {
  const columns: Column<TimeOffRow>[] = [
    {
      key: "member",
      header: "Persoană",
      cell: (r) => {
        const m = memberById.get(r.memberId);
        return (
          <span className="flex items-center gap-2.5">
            {m && <Avatar name={m.name} color={m.color} size="sm" />}
            <span className="font-medium">{m?.name ?? "—"}</span>
          </span>
        );
      },
      sortValue: (r) => memberById.get(r.memberId)?.name ?? "",
    },
    {
      key: "type",
      header: "Tip",
      cell: (r) => {
        const t = TIME_OFF_TYPE[r.type] ?? TIME_OFF_TYPE.other;
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: t.color }} />
            {t.label}
          </span>
        );
      },
      sortValue: (r) => r.type,
      csv: (r) => TIME_OFF_TYPE[r.type]?.label ?? r.type,
    },
    { key: "period", header: "Perioadă", cell: (r) => rangeLabel(r.startDate, r.endDate), sortValue: (r) => r.startDate },
    { key: "days", header: "Zile lucr.", align: "right", cell: (r) => workingDaysCount(r.startDate, r.endDate), sortValue: (r) => workingDaysCount(r.startDate, r.endDate) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} map={TIME_OFF_STATUS} />, sortValue: (r) => r.status, csv: (r) => TIME_OFF_STATUS[r.status].label },
    { key: "notes", header: "Note", hideOnMobile: true, cell: (r) => <span className="line-clamp-1 max-w-xs text-muted-foreground">{r.notes ?? "—"}</span>, csv: (r) => r.notes ?? "" },
  ];
  if (!requests.length)
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50">
        <EmptyState icon={<Palmtree />} title="Nicio cerere de concediu" description="Cererile apar aici după ce sunt trimise." />
      </div>
    );
  return (
    <DataTable
      rows={requests}
      columns={columns}
      getRowId={(r) => r.id}
      onRowClick={onOpen}
      search={(r) => `${memberById.get(r.memberId)?.name ?? ""} ${r.notes ?? ""}`}
      searchPlaceholder="Caută persoană…"
      filters={[
        { key: "status", label: "Status", options: Object.entries(TIME_OFF_STATUS).map(([value, v]) => ({ value, label: v.label })), predicate: (r, v) => r.status === v },
        { key: "type", label: "Tip", options: Object.entries(TIME_OFF_TYPE).map(([value, v]) => ({ value, label: v.label })), predicate: (r, v) => r.type === v },
      ]}
      defaultSort={{ key: "period", dir: "desc" }}
      csvFilename="concedii"
    />
  );
}

