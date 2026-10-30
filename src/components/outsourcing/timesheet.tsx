"use client";

import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  CopyPlus,
  Loader2,
  Lock,
  MessageSquareText,
  Play,
  Plus,
  Send,
  Trash2,
  Undo2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { AnimatedBar } from "@/components/motion";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeaderRow } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, Textarea } from "@/components/ui/input";
import { Avatar, ColorDot, Kbd, Switch } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/page";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger, Tooltip } from "@/components/ui/popover";
import { useAction } from "@/hooks/use-action";
import { TIME_ENTRY_STATUS } from "@/lib/constants";
import { formatHours } from "@/lib/format";
import { addDaysIso, formatClock, formatDay, parseHoursInput, WEEKDAY_SHORT, weekRangeLabel, weekStartOf } from "@/lib/outsourcing/dates";
import { dailyCapacity } from "@/lib/outsourcing/metrics";
import type { MemberLite, ProjectLite, TaskLite } from "@/lib/outsourcing/types";
import { cn } from "@/lib/utils";
import {
  copyPreviousWeekAction,
  deleteRowAction,
  retractWeekAction,
  saveCellAction,
  startTimerAction,
  submitWeekAction,
} from "@/app/(app)/pontaj/actions";
import { memberOptions, projectOptions } from "./shared";
import { TimerWidget } from "./timer-widget";

/* ------------------------------------------------------------------ */
/* Tipuri                                                              */
/* ------------------------------------------------------------------ */

export type TimesheetProject = ProjectLite & { assignable: boolean; tasks: TaskLite[] };
export type TimerInfo = { entryId: string; projectId: string; taskId: string | null; description: string | null; startedAt: number; baseHours: number; date: string };
export type TsEntry = {
  id: string;
  projectId: string;
  taskId: string | null;
  date: string;
  hours: number;
  status: string;
  description: string | null;
  billable: boolean;
  rejectionReason: string | null;
  running: boolean;
  invoiced: boolean;
};
export type TimesheetData = {
  member: { id: string; name: string; color: string; position: string | null; weeklyCapacity: number };
  isOwn: boolean;
  canApprove: boolean;
  members: MemberLite[];
  weekStart: string;
  today: string;
  days: { date: string; weekend: boolean; holiday: string | null; off: { type: string; label: string; status: string } | null }[];
  entries: TsEntry[];
  projects: TimesheetProject[];
  prevRows: { projectId: string; taskId: string | null }[];
  timer: TimerInfo | null;
  recent: {
    id: string;
    date: string;
    hours: number;
    status: string;
    description: string | null;
    projectName: string;
    projectColor: string;
    taskTitle: string | null;
    rejectionReason: string | null;
    running: boolean;
  }[];
};

type Row = { key: string; projectId: string; taskId: string | null };
type Cell = {
  hours: number;
  status: "draft" | "submitted" | "approved" | "rejected";
  locked: boolean;
  description: string | null;
  billable: boolean;
  rejectionReason: string | null;
  running: boolean;
  count: number;
};
type Override = { hours: number; state: "saving" | "saved" | "error" };

const rowKey = (projectId: string, taskId: string | null) => `${projectId}:${taskId ?? ""}`;
const cellKey = (row: string, date: string) => `${row}|${date}`;

/* ------------------------------------------------------------------ */
/* Componentă principală                                               */
/* ------------------------------------------------------------------ */

export function Timesheet({ data }: { data: TimesheetData }) {
  const router = useRouter();
  const [navPending, startNav] = React.useTransition();
  const { run, pending } = useAction();
  const { member, weekStart, today, days } = data;
  const projectById = React.useMemo(() => new Map(data.projects.map((p) => [p.id, p])), [data.projects]);
  const taskById = React.useMemo(() => new Map(data.projects.flatMap((p) => p.tasks).map((t) => [t.id, t])), [data.projects]);

  /* ---------- celule din server ---------- */
  const cells = React.useMemo(() => {
    const map = new Map<string, Cell>();
    for (const e of data.entries) {
      const k = cellKey(rowKey(e.projectId, e.taskId), e.date);
      const c = map.get(k) ?? { hours: 0, status: "draft", locked: false, description: null, billable: true, rejectionReason: null, running: false, count: 0 };
      c.hours = Math.round((c.hours + e.hours) * 100) / 100;
      c.count++;
      const locked = e.status === "submitted" || e.status === "approved" || e.invoiced;
      if (locked) {
        c.locked = true;
        c.status = c.status === "approved" || e.status === "approved" ? (e.status === "submitted" ? "submitted" : "approved") : "submitted";
      } else if (!c.locked && e.status === "rejected") c.status = "rejected";
      c.description = [c.description, e.description].filter(Boolean).join("; ") || null;
      c.billable = c.count === 1 ? e.billable : c.billable && e.billable;
      c.rejectionReason ||= e.rejectionReason;
      c.running ||= e.running;
      map.set(k, c);
    }
    return map;
  }, [data.entries]);

  /* ---------- rânduri ---------- */
  const [extraRows, setExtraRows] = React.useState<Row[]>([]);
  React.useEffect(() => setExtraRows([]), [weekStart, member.id]);

  const rows = React.useMemo(() => {
    const seen = new Map<string, Row>();
    for (const e of data.entries) {
      const k = rowKey(e.projectId, e.taskId);
      if (!seen.has(k)) seen.set(k, { key: k, projectId: e.projectId, taskId: e.taskId });
    }
    for (const r of extraRows) if (!seen.has(r.key)) seen.set(r.key, r);
    const name = (r: Row) => projectById.get(r.projectId)?.name ?? "";
    const task = (r: Row) => (r.taskId ? (taskById.get(r.taskId)?.title ?? "") : "");
    return [...seen.values()].sort((a, b) => name(a).localeCompare(name(b), "ro") || (a.taskId ? 1 : 0) - (b.taskId ? 1 : 0) || task(a).localeCompare(task(b), "ro"));
  }, [data.entries, extraRows, projectById, taskById]);

  /* ---------- override-uri optimiste ---------- */
  const [overrides, setOverrides] = React.useState<Record<string, Override>>({});
  React.useEffect(() => {
    // eliminăm override-urile confirmate de server
    setOverrides((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [k, o] of Object.entries(prev)) {
        if (o.state === "saving") continue;
        const server = cells.get(k)?.hours ?? 0;
        if (Math.abs(server - o.hours) < 0.001 || o.state === "error") {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [cells]);

  const valueOf = (k: string) => overrides[k]?.hours ?? cells.get(k)?.hours ?? 0;

  const saveCell = React.useCallback(
    async (row: Row, date: string, hours: number, extra?: { description?: string | null; billable?: boolean }) => {
      const k = cellKey(row.key, date);
      setOverrides((o) => ({ ...o, [k]: { hours, state: "saving" } }));
      try {
        const r = await saveCellAction({ memberId: member.id, projectId: row.projectId, taskId: row.taskId, date, hours, ...extra });
        if (!r.ok) {
          toast.error(r.error);
          setOverrides((o) => {
            const n = { ...o };
            delete n[k];
            return n;
          });
          return false;
        }
        setOverrides((o) => ({ ...o, [k]: { hours, state: "saved" } }));
        return true;
      } catch {
        toast.error("Nu am putut salva. Verifică conexiunea.");
        setOverrides((o) => {
          const n = { ...o };
          delete n[k];
          return n;
        });
        return false;
      }
    },
    [member.id],
  );

  /* ---------- totaluri ---------- */
  const dayTotals = days.map((d) => rows.reduce((a, r) => a + valueOf(cellKey(r.key, d.date)), 0));
  const rowTotal = (r: Row) => days.reduce((a, d) => a + valueOf(cellKey(r.key, d.date)), 0);
  const weekTotal = dayTotals.reduce((a, b) => a + b, 0);
  const daily = dailyCapacity(member.weeklyCapacity);
  const dayCapacity = days.map((d) => (d.weekend || d.holiday || d.off?.status === "approved" ? 0 : daily));
  const weekCapacity = dayCapacity.reduce((a, b) => a + b, 0);

  const byStatus = React.useMemo(() => {
    const s: Record<string, number> = { draft: 0, submitted: 0, approved: 0, rejected: 0 };
    for (const e of data.entries) s[e.status] = (s[e.status] ?? 0) + e.hours;
    return s;
  }, [data.entries]);
  const rejected = data.entries.filter((e) => e.status === "rejected" && e.rejectionReason);
  const submittable = data.entries.some((e) => (e.status === "draft" || e.status === "rejected") && !e.running && e.hours > 0);
  const hasSubmitted = byStatus.submitted > 0;

  /* ---------- navigare ---------- */
  const hrefFor = (week: string) => {
    const p = new URLSearchParams();
    if (week !== weekStartOf(today)) p.set("week", week);
    if (!data.isOwn) p.set("membru", member.id);
    const q = p.toString();
    return `/pontaj${q ? `?${q}` : ""}`;
  };
  const go = (week: string) => startNav(() => router.push(hrefFor(week), { scroll: false }));
  const prevWeek = addDaysIso(weekStart, -7);
  const nextWeek = addDaysIso(weekStart, 7);
  const isCurrentWeek = weekStart === weekStartOf(today);
  const weekHasToday = days.some((d) => d.date === today);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(prevWeek);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(nextWeek);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------- acțiuni ---------- */
  const assignable = data.projects.filter((p) => p.assignable);
  const addRow = (projectId: string, taskId: string | null) => {
    const key = rowKey(projectId, taskId);
    if (rows.some((r) => r.key === key)) {
      toast.info("Rândul există deja în această săptămână.");
      return;
    }
    setExtraRows((x) => [...x, { key, projectId, taskId }]);
    // focus pe prima celulă a rândului nou
    requestAnimationFrame(() => {
      const firstWork = days.findIndex((d) => !d.weekend && !d.holiday);
      document.querySelector<HTMLInputElement>(`[data-row-key="${CSS.escape(key)}"] [data-day="${Math.max(0, firstWork)}"] input`)?.focus();
    });
  };
  const copyRows = () => {
    const toAdd = data.prevRows.filter((r) => projectById.get(r.projectId)?.assignable && !rows.some((x) => x.key === rowKey(r.projectId, r.taskId)));
    if (!toAdd.length) {
      toast.info("Nu există rânduri noi de copiat din săptămâna trecută.");
      return;
    }
    setExtraRows((x) => [...x, ...toAdd.map((r) => ({ key: rowKey(r.projectId, r.taskId), ...r }))]);
    toast.success(`${toAdd.length} ${toAdd.length === 1 ? "rând copiat" : "rânduri copiate"}`);
  };
  const copyWithHours = () =>
    run(() => copyPreviousWeekAction({ memberId: member.id, weekStart }), {
      success: (d) => (d.count ? `${d.count} intrări copiate ca ciornă` : "Nu există ore de copiat în celulele goale"),
    });
  const removeRow = (r: Row) => {
    const hasEntries = data.entries.some((e) => rowKey(e.projectId, e.taskId) === r.key);
    setExtraRows((x) => x.filter((y) => y.key !== r.key));
    if (hasEntries) run(() => deleteRowAction({ memberId: member.id, projectId: r.projectId, taskId: r.taskId, weekStart }));
  };

  const rowsWithDays = rows.length;

  return (
    <div className="space-y-6">
      {data.isOwn && <TimerWidget timer={data.timer} projects={data.projects} />}

      {/* Bara săptămânii */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-border bg-card p-0.5 shadow-soft">
            <Tooltip content={<>Săptămâna anterioară <Kbd className="ml-1">Alt ←</Kbd></>}>
              <Button variant="ghost" size="icon-sm" onClick={() => go(prevWeek)} aria-label="Săptămâna anterioară">
                <ChevronLeft />
              </Button>
            </Tooltip>
            <Button variant="ghost" size="sm" onClick={() => go(weekStartOf(today))} disabled={isCurrentWeek} className="px-2.5">
              Azi
            </Button>
            <Tooltip content={<>Săptămâna următoare <Kbd className="ml-1">Alt →</Kbd></>}>
              <Button variant="ghost" size="icon-sm" onClick={() => go(nextWeek)} aria-label="Săptămâna următoare">
                <ChevronRight />
              </Button>
            </Tooltip>
          </div>
          <div className="flex items-center gap-2 px-1">
            <CalendarDays className="size-4 text-muted-foreground" />
            <span className="text-[15px] font-semibold tracking-tight">{weekRangeLabel(weekStart)}</span>
            {isCurrentWeek && <Badge tone="brand">săptămâna curentă</Badge>}
            {navPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data.canApprove && (
            <div className="w-full sm:w-60">
              <Combobox
                options={memberOptions(data.members)}
                value={member.id}
                onChange={(v) => v && startNav(() => router.push(`/pontaj?membru=${v}${isCurrentWeek ? "" : `&week=${weekStart}`}`, { scroll: false }))}
                placeholder="Membru…"
                searchPlaceholder="Caută coleg…"
              />
            </div>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <ClipboardCopy /> Copiază săpt. trecută
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Din {weekRangeLabel(prevWeek)}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={copyRows}>
                <CopyPlus /> Doar rândurile (proiecte & task-uri)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={copyWithHours}>
                <ClipboardCopy /> Rândurile și orele (în celulele goale)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {hasSubmitted && !submittable && (
            <Button variant="outline" size="sm" onClick={() => run(() => retractWeekAction({ memberId: member.id, weekStart }))} loading={pending}>
              <Undo2 /> Retrage
            </Button>
          )}
          <Button
            size="sm"
            disabled={!submittable}
            loading={pending}
            onClick={() =>
              run(() => submitWeekAction({ memberId: member.id, weekStart }), {
                success: (d) => `${formatHours(d.hours)} trimise spre aprobare`,
              })
            }
          >
            <Send /> Trimite spre aprobare
          </Button>
        </div>
      </div>

      {/* Sumar */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-soft">
          <Avatar name={member.name} color={member.color} size="lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-semibold">{member.name}</div>
                <div className="truncate text-xs text-muted-foreground">{member.position ?? "Membru echipă"}</div>
              </div>
              <div className="shrink-0 text-right">
                <span className="text-xl font-semibold tabular">{formatHours(weekTotal)}</span>
                <span className="text-sm text-muted-foreground"> / {formatHours(weekCapacity)}</span>
              </div>
            </div>
            <AnimatedBar
              value={weekCapacity ? (weekTotal / weekCapacity) * 100 : 0}
              color={weekTotal > weekCapacity * 1.05 ? "var(--warning)" : weekTotal >= weekCapacity * 0.95 ? "var(--success)" : "var(--primary)"}
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-3 shadow-soft sm:grid-cols-4">
          {(["draft", "submitted", "approved", "rejected"] as const).map((s) => (
            <div key={s} className={cn("rounded-lg px-2.5 py-2", byStatus[s] ? "bg-subtle" : "opacity-50")}>
              <div className="text-[15px] font-semibold tabular">{formatHours(byStatus[s])}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    s === "draft" ? "bg-muted-foreground/60" : s === "submitted" ? "bg-info" : s === "approved" ? "bg-success" : "bg-danger",
                  )}
                />
                {{ draft: "Ciornă", submitted: "Trimis", approved: "Aprobat", rejected: "Respins" }[s]}
              </div>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {rejected.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex gap-3 rounded-xl border border-danger/25 bg-danger-soft p-4 text-sm text-danger-soft-foreground">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold">Unele ore au fost respinse — corectează-le și retrimite săptămâna.</p>
                <ul className="space-y-0.5">
                  {[...new Map(rejected.map((e) => [`${e.projectId}${e.rejectionReason}`, e])).values()].map((e) => (
                    <li key={e.id}>
                      <span className="font-medium">{projectById.get(e.projectId)?.name}</span> · {formatDay(e.date, "EEE d MMM")}: „{e.rejectionReason}”
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grila */}
      <Card className={cn("overflow-hidden transition-opacity duration-200", navPending && "opacity-60")}>
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 border-b border-border bg-card px-4 py-3 text-left text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Proiect / task
                </th>
                {days.map((d, i) => {
                  const isToday = d.date === today;
                  const shaded = d.weekend || d.holiday || d.off;
                  return (
                    <th
                      key={d.date}
                      className={cn(
                        "w-[78px] border-b border-border px-1 py-2 text-center align-top font-normal",
                        shaded && "bg-muted/40",
                        d.holiday && "bg-primary-soft/50",
                        d.off && d.off.status === "approved" && "bg-info-soft/60",
                      )}
                    >
                      <div className={cn("text-[11px] font-semibold tracking-wide uppercase", isToday ? "text-primary" : "text-muted-foreground")}>{WEEKDAY_SHORT[i]}</div>
                      <div
                        className={cn(
                          "mx-auto mt-0.5 grid size-7 place-items-center rounded-full text-[13px] font-semibold tabular",
                          isToday && "bg-primary text-primary-foreground shadow-glow",
                        )}
                      >
                        {d.date.slice(8)}
                      </div>
                      {(d.holiday || d.off) && (
                        <Tooltip content={d.holiday ?? `${d.off!.label}${d.off!.status === "pending" ? " (în așteptare)" : ""}`}>
                          <div
                            className={cn(
                              "mx-auto mt-1 max-w-[70px] truncate rounded px-1 text-[10px] leading-4 font-medium",
                              d.holiday ? "text-primary-soft-foreground" : "text-info-soft-foreground",
                              d.off?.status === "pending" && !d.holiday && "opacity-70",
                            )}
                          >
                            {d.holiday ?? d.off!.label}
                          </div>
                        </Tooltip>
                      )}
                    </th>
                  );
                })}
                <th className="w-[88px] border-b border-border px-3 py-3 text-right text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">Total</th>
                <th className="w-[76px] border-b border-border" />
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {rows.map((r, ri) => (
                  <TimesheetRow
                    key={r.key}
                    row={r}
                    rowIndex={ri}
                    rowCount={rowsWithDays}
                    project={projectById.get(r.projectId)}
                    taskTitle={r.taskId ? (taskById.get(r.taskId)?.title ?? "Task") : null}
                    days={days}
                    today={today}
                    cells={cells}
                    overrides={overrides}
                    total={rowTotal(r)}
                    canTimer={data.isOwn && weekHasToday && !!projectById.get(r.projectId)?.assignable && !data.timer}
                    runningHere={!!data.timer && rowKey(data.timer.projectId, data.timer.taskId) === r.key}
                    onSave={saveCell}
                    onRemove={() => removeRow(r)}
                    onTimer={() => run(() => startTimerAction({ projectId: r.projectId, taskId: r.taskId }))}
                  />
                ))}
              </AnimatePresence>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={days.length + 3}>
                    <EmptyState
                      compact
                      icon={<CalendarDays />}
                      title="Nicio oră în această săptămână"
                      description={
                        data.prevRows.length
                          ? "Adaugă un rând sau copiază rândurile din săptămâna trecută."
                          : "Adaugă un rând cu proiectul (și opțional task-ul) la care ai lucrat."
                      }
                      action={
                        data.prevRows.length ? (
                          <Button variant="outline" size="sm" onClick={copyRows}>
                            <CopyPlus /> Copiază rândurile
                          </Button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              )}
              <tr>
                <td colSpan={days.length + 3} className="sticky left-0 border-t border-border/70 px-3 py-2">
                  <AddRow projects={assignable} existing={rows.map((r) => r.key)} onAdd={addRow} />
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="bg-subtle/70">
                <td className="sticky left-0 z-10 border-t border-border bg-subtle px-4 py-3 text-[13px] font-semibold">Total zi</td>
                {days.map((d, i) => {
                  const t = dayTotals[i];
                  const cap = dayCapacity[i];
                  const over = cap > 0 ? t > cap + 0.01 : t > 0;
                  return (
                    <td key={d.date} className={cn("border-t border-border px-2 py-2.5 text-center", (d.weekend || d.holiday) && "bg-muted/30")}>
                      <div className={cn("text-[13px] font-semibold tabular", !t && "text-muted-foreground/50", over && "text-warning")}>{t ? formatClock(t) : "—"}</div>
                      {cap > 0 && (
                        <div className="mx-auto mt-1.5 h-1 w-10 overflow-hidden rounded-full bg-muted">
                          <motion.div
                            className={cn("h-full rounded-full", over ? "bg-warning" : t >= cap - 0.01 ? "bg-success" : "bg-primary")}
                            animate={{ width: `${Math.min(100, (t / cap) * 100)}%` }}
                            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                          />
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="border-t border-border px-3 py-3 text-right text-[15px] font-semibold tabular">{formatHours(weekTotal)}</td>
                <td className="border-t border-border" />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border px-4 py-2.5 text-[11.5px] text-muted-foreground">
          <span>
            Format: <Kbd>7,5</Kbd> <Kbd>7:30</Kbd> <Kbd>90m</Kbd>
          </span>
          <span>
            <Kbd>Enter</Kbd> salvează · <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> rând · <Kbd>Tab</Kbd> zi următoare
          </span>
          <span>
            Dublu-click sau <Kbd>⇧ Enter</Kbd> pentru descriere
          </span>
          <span className="ml-auto inline-flex items-center gap-3">
            <Legend className="bg-info-soft ring-info/30" label="Trimis" />
            <Legend className="bg-success-soft ring-success/30" label="Aprobat" />
            <Legend className="bg-danger-soft ring-danger/30" label="Respins" />
          </span>
        </div>
      </Card>

      <RecentEntries recent={data.recent} hrefFor={(d) => hrefFor(weekStartOf(d))} />
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-sm ring-1 ring-inset", className)} />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Rând                                                                */
/* ------------------------------------------------------------------ */

function TimesheetRow({
  row,
  rowIndex,
  rowCount,
  project,
  taskTitle,
  days,
  today,
  cells,
  overrides,
  total,
  canTimer,
  runningHere,
  onSave,
  onRemove,
  onTimer,
}: {
  row: Row;
  rowIndex: number;
  rowCount: number;
  project?: TimesheetProject;
  taskTitle: string | null;
  days: TimesheetData["days"];
  today: string;
  cells: Map<string, Cell>;
  overrides: Record<string, Override>;
  total: number;
  canTimer: boolean;
  runningHere: boolean;
  onSave: (row: Row, date: string, hours: number, extra?: { description?: string | null; billable?: boolean }) => Promise<boolean>;
  onRemove: () => void;
  onTimer: () => void;
}) {
  const anyLocked = days.some((d) => cells.get(cellKey(row.key, d.date))?.locked);
  return (
    <motion.tr
      layout="position"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      data-row-key={row.key}
      className="group"
    >
      <td className="sticky left-0 z-10 border-b border-border/70 bg-card px-4 py-2 transition-colors group-hover:bg-subtle">
        <div className="flex min-w-[200px] items-center gap-3">
          <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: project?.color ?? "#888" }} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold">{project?.name ?? "Proiect"}</span>
              {project?.code && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{project.code}</span>}
            </div>
            <div className="truncate text-xs text-muted-foreground">{taskTitle ?? (project?.clientName ? `${project.clientName} · fără task` : "Fără task")}</div>
          </div>
          {runningHere && (
            <Badge tone="success" dot pulse className="ml-auto shrink-0">
              rulează
            </Badge>
          )}
        </div>
      </td>
      {days.map((d, di) => {
        const k = cellKey(row.key, d.date);
        return (
          <td
            key={d.date}
            data-day={di}
            className={cn(
              "border-b border-border/70 px-1 py-1.5",
              (d.weekend || d.holiday) && "bg-muted/30",
              d.off?.status === "approved" && "bg-info-soft/30",
              d.date === today && "bg-primary-soft/25",
            )}
          >
            <HourCell
              row={row}
              date={d.date}
              cell={cells.get(k)}
              override={overrides[k]}
              rowIndex={rowIndex}
              dayIndex={di}
              rowCount={rowCount}
              onSave={onSave}
            />
          </td>
        );
      })}
      <td className="border-b border-border/70 px-3 py-2 text-right">
        <span className={cn("text-[13px] font-semibold tabular", !total && "text-muted-foreground/50")}>{total ? formatHours(total) : "—"}</span>
      </td>
      <td className="border-b border-border/70 pr-3 text-right">
        <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
          {canTimer && (
            <Tooltip content="Pornește cronometrul pe acest rând">
              <Button variant="ghost" size="icon-xs" onClick={onTimer} aria-label="Pornește cronometrul" className="hover:text-success">
                <Play className="fill-current" />
              </Button>
            </Tooltip>
          )}
          {!anyLocked && (
            <Tooltip content="Șterge rândul">
              <Button variant="ghost" size="icon-xs" onClick={onRemove} aria-label="Șterge rândul" className="hover:text-danger">
                <Trash2 />
              </Button>
            </Tooltip>
          )}
        </div>
      </td>
    </motion.tr>
  );
}

/* ------------------------------------------------------------------ */
/* Celulă                                                              */
/* ------------------------------------------------------------------ */

function focusCell(rowIndex: number, dayIndex: number) {
  const rows = document.querySelectorAll<HTMLTableRowElement>("tr[data-row-key]");
  const tr = rows[rowIndex];
  const input = tr?.querySelector<HTMLInputElement>(`[data-day="${dayIndex}"] input`);
  if (input) {
    input.focus();
    input.select();
  }
}

function HourCell({
  row,
  date,
  cell,
  override,
  rowIndex,
  dayIndex,
  rowCount,
  onSave,
}: {
  row: Row;
  date: string;
  cell?: Cell;
  override?: Override;
  rowIndex: number;
  dayIndex: number;
  rowCount: number;
  onSave: (row: Row, date: string, hours: number, extra?: { description?: string | null; billable?: boolean }) => Promise<boolean>;
}) {
  const value = override?.hours ?? cell?.hours ?? 0;
  const [text, setText] = React.useState(formatClock(value));
  const [focused, setFocused] = React.useState(false);
  const [invalid, setInvalid] = React.useState(false);
  const [detail, setDetail] = React.useState(false);
  const [flash, setFlash] = React.useState(false);

  React.useEffect(() => {
    if (!focused) setText(formatClock(value));
  }, [value, focused]);

  const commit = async (): Promise<boolean> => {
    const h = parseHoursInput(text);
    if (h === null) {
      setInvalid(true);
      toast.error("Format invalid. Exemple: 7,5 · 7:30 · 90m");
      return false;
    }
    setInvalid(false);
    if (Math.abs(h - value) < 0.001) {
      setText(formatClock(value));
      return true;
    }
    setText(formatClock(h));
    const ok = await onSave(row, date, h);
    if (ok) {
      setFlash(true);
      setTimeout(() => setFlash(false), 650);
    }
    return ok;
  };

  if (cell?.locked) {
    const approved = cell.status === "approved";
    return (
      <Tooltip content={`${TIME_ENTRY_STATUS[cell.status].label}${cell.description ? ` · ${cell.description}` : ""}`}>
        <div
          className={cn(
            "relative flex h-10 items-center justify-center gap-1 rounded-lg text-[13px] font-semibold tabular ring-1 ring-inset select-none",
            approved ? "bg-success-soft text-success-soft-foreground ring-success/25" : "bg-info-soft text-info-soft-foreground ring-info/25",
          )}
        >
          {formatClock(cell.hours)}
          <Lock className="absolute top-1 right-1 size-2.5 opacity-60" />
        </div>
      </Tooltip>
    );
  }

  const rejected = cell?.status === "rejected";
  const saving = override?.state === "saving";

  return (
    <Popover open={detail} onOpenChange={setDetail}>
      <PopoverAnchor asChild>
        <div className="relative">
          <input
            value={text}
            inputMode="decimal"
            aria-label={`Ore ${date}`}
            aria-invalid={invalid || undefined}
            onChange={(e) => {
              setText(e.target.value);
              setInvalid(false);
            }}
            onFocus={(e) => {
              setFocused(true);
              e.currentTarget.select();
            }}
            onBlur={() => {
              setFocused(false);
              if (!detail) void commit();
            }}
            onDoubleClick={() => setDetail(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.shiftKey) {
                e.preventDefault();
                void commit().then(() => setDetail(true));
              } else if (e.key === "Enter") {
                e.preventDefault();
                void commit();
                if (rowIndex < rowCount - 1) focusCell(rowIndex + 1, dayIndex);
              } else if (e.key === "Escape") {
                setText(formatClock(value));
                setInvalid(false);
                e.currentTarget.blur();
              } else if (e.key === "ArrowDown" && rowIndex < rowCount - 1) {
                e.preventDefault();
                focusCell(rowIndex + 1, dayIndex);
              } else if (e.key === "ArrowUp" && rowIndex > 0) {
                e.preventDefault();
                focusCell(rowIndex - 1, dayIndex);
              }
            }}
            placeholder="—"
            className={cn(
              "h-10 w-full rounded-lg border border-transparent bg-transparent text-center text-[13px] font-semibold tabular transition-[background-color,border-color,box-shadow] duration-300 outline-none placeholder:text-muted-foreground/30 hover:border-border hover:bg-card focus:border-primary focus:bg-card focus:ring-4 focus:ring-primary/15",
              value > 0 && !focused && "bg-card shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] ring-1 ring-border ring-inset",
              rejected && "bg-danger-soft text-danger-soft-foreground ring-danger/30",
              invalid && "border-danger ring-4 ring-danger/15",
              flash && "bg-success-soft ring-success/40",
            )}
          />
          {saving && <Loader2 className="pointer-events-none absolute top-1 right-1 size-2.5 animate-spin text-primary" />}
          {!saving && cell?.running && <span className="pointer-events-none absolute top-1.5 right-1.5 size-1.5 animate-pulse rounded-full bg-success" />}
          {!saving && !cell?.running && cell?.description && (
            <MessageSquareText className="pointer-events-none absolute right-1 bottom-1 size-2.5 text-muted-foreground/60" />
          )}
          {rejected && cell?.rejectionReason && (
            <Tooltip content={`Respins: ${cell.rejectionReason}`}>
              <AlertCircle className="absolute top-1 left-1 size-2.5 text-danger" />
            </Tooltip>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent className="w-72" align="center" onOpenAutoFocus={(e) => e.preventDefault()}>
        <CellDetail
          date={date}
          hours={value}
          description={cell?.description ?? ""}
          billable={cell?.billable ?? true}
          onCancel={() => setDetail(false)}
          onSave={async (h, description, billable) => {
            const ok = await onSave(row, date, h, { description, billable });
            if (ok) setDetail(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function CellDetail({
  date,
  hours,
  description,
  billable,
  onSave,
  onCancel,
}: {
  date: string;
  hours: number;
  description: string;
  billable: boolean;
  onSave: (h: number, d: string | null, b: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const [h, setH] = React.useState(formatClock(hours));
  const [d, setD] = React.useState(description);
  const [b, setB] = React.useState(billable);
  const [busy, setBusy] = React.useState(false);
  const submit = async () => {
    const parsed = parseHoursInput(h);
    if (parsed === null) {
      toast.error("Format invalid pentru ore.");
      return;
    }
    setBusy(true);
    await onSave(parsed, d.trim() || null, b);
    setBusy(false);
  };
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold first-letter:uppercase">{formatDay(date, "EEEE, d MMMM")}</div>
      <Field label="Ore">
        <input
          autoFocus
          value={h}
          onChange={(e) => setH(e.target.value)}
          className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm tabular outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          onKeyDown={(e) => e.key === "Enter" && void submit()}
        />
      </Field>
      <Field label="Descriere">
        <Textarea
          value={d}
          onChange={(e) => setD(e.target.value)}
          rows={3}
          placeholder="Ce ai lucrat?"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
          }}
        />
      </Field>
      <label className="flex items-center justify-between gap-2 text-[13px]">
        Facturabil
        <Switch checked={b} onCheckedChange={setB} />
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Renunță
        </Button>
        <Button size="sm" onClick={submit} loading={busy}>
          Salvează
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Adăugare rând                                                       */
/* ------------------------------------------------------------------ */

function AddRow({ projects, existing, onAdd }: { projects: TimesheetProject[]; existing: string[]; onAdd: (projectId: string, taskId: string | null) => void }) {
  const [open, setOpen] = React.useState(false);
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [taskId, setTaskId] = React.useState<string | null>(null);
  const project = projects.find((p) => p.id === projectId);
  const tasks = (project?.tasks ?? []).filter((t) => t.status !== "done");
  const dup = projectId ? existing.includes(rowKey(projectId, taskId)) : false;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setProjectId(null);
          setTaskId(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" disabled={!projects.length}>
          <Plus /> Adaugă rând
          {!projects.length && <span className="text-xs">(nu ești alocat pe niciun proiect)</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3">
        <div className="text-sm font-semibold">Rând nou</div>
        <Field label="Proiect">
          <Combobox
            options={projectOptions(projects)}
            value={projectId}
            onChange={(v) => {
              setProjectId(v || null);
              setTaskId(null);
            }}
            placeholder="Alege proiectul…"
          />
        </Field>
        <Field label="Task" hint="Opțional — poți ponta și direct pe proiect">
          <Combobox
            options={tasks.map((t) => ({ value: t.id, label: t.title }))}
            value={taskId}
            onChange={(v) => setTaskId(v || null)}
            placeholder={projectId ? "Fără task" : "—"}
            disabled={!projectId}
            allowClear
          />
        </Field>
        {dup && <p className="text-xs text-warning">Rândul există deja în această săptămână.</p>}
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!projectId || dup}
            onClick={() => {
              onAdd(projectId!, taskId);
              setOpen(false);
              setProjectId(null);
              setTaskId(null);
            }}
          >
            <Plus /> Adaugă
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Intrări recente                                                     */
/* ------------------------------------------------------------------ */

function RecentEntries({ recent, hrefFor }: { recent: TimesheetData["recent"]; hrefFor: (date: string) => string }) {
  if (!recent.length) return null;
  return (
    <Card>
      <CardHeaderRow title="Intrări recente" description="Ultimele ore pontate" icon={<ColorDot color="var(--primary)" className="size-3" />} />
      <ul className="divide-y divide-border border-t border-border">
        {recent.map((e) => (
          <li key={e.id}>
            <Link href={hrefFor(e.date)} scroll={false} className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/40">
              <span className="w-20 shrink-0 text-xs text-muted-foreground first-letter:uppercase">{formatDay(e.date, "EEE d MMM")}</span>
              <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: e.projectColor }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">
                  {e.projectName}
                  {e.taskTitle && <span className="font-normal text-muted-foreground"> · {e.taskTitle}</span>}
                </div>
                {e.description && <div className="truncate text-xs text-muted-foreground">{e.description}</div>}
              </div>
              <span className="hidden sm:block">
                {e.running ? <Badge tone="success" dot pulse>rulează</Badge> : <StatusBadge status={e.status} map={TIME_ENTRY_STATUS} />}
              </span>
              <span className="w-16 shrink-0 text-right text-[13px] font-semibold tabular">{formatHours(e.hours)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
