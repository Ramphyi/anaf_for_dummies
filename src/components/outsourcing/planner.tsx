"use client";

import { AlertTriangle, CalendarRange, ChevronLeft, ChevronRight, FolderKanban, Gauge, Palmtree, Plus, Search, Users, X } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { Stagger, StaggerItem } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input, NativeSelect } from "@/components/ui/input";
import { Avatar, AvatarStack, Kbd } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/page";
import { Tooltip } from "@/components/ui/popover";
import { StatCard } from "@/components/ui/stat-card";
import { Segmented } from "@/components/ui/tabs";
import { TIME_OFF_TYPE } from "@/lib/constants";
import { formatHours } from "@/lib/format";
import {
  addDaysIso,
  daysBetween,
  dayOfWeek,
  eachDayIso,
  formatDay,
  holidayName,
  isIsoDay,
  isoWeekNumber,
  isWorkingDay,
  rangeLabel,
  weekStartOf,
} from "@/lib/outsourcing/dates";
import { dailyCapacity, packLanes, pct, utilizationLevel, UTILIZATION_META } from "@/lib/outsourcing/metrics";
import type { AllocationRow, MemberLite, ProjectLite, TimeOffRow } from "@/lib/outsourcing/types";
import { cn } from "@/lib/utils";
import { moveAllocationAction } from "@/app/(app)/planificare/actions";
import { AllocationDialog, type AllocationDraft } from "./allocation-dialog";
import { projectOptions, useOpenFromUrl, useUrlState } from "./shared";

type Range = "2" | "4" | "8";
type View = "oameni" | "proiecte";

const LANE_H = 30;
const BAR_H = 24;
const ROW_PAD = 8;
const HEAT_H = 18;
const MIN_DW: Record<Range, number> = { "2": 44, "4": 28, "8": 19 };
const SPRING = { type: "spring", stiffness: 420, damping: 40, mass: 0.9 } as const;

type DragState = { id: string; mode: "move" | "l" | "r"; startDate: string; endDate: string; rowId: string };
type Selection = { rowId: string; a: number; b: number };

export function Planner({
  today,
  members,
  projects,
  allocations,
  timeOff,
  canManage,
}: {
  today: string;
  members: MemberLite[];
  projects: ProjectLite[];
  allocations: AllocationRow[];
  timeOff: TimeOffRow[];
  canManage: boolean;
}) {
  const currentWeek = weekStartOf(today);
  const [range, setRange] = useUrlState<Range>("interval", "4");
  const [startParam, setStartParam] = useUrlState<string>("start", currentWeek);
  const [view, setView] = useUrlState<View>("vedere", "oameni");
  const [projectFilter, setProjectFilter] = useUrlState<string>("proiect", "");
  const [dept, setDept] = useUrlState<string>("departament", "");
  const [query, setQuery] = React.useState("");
  const start = isIsoDay(startParam) ? weekStartOf(startParam) : currentWeek;
  const weeks = Number(range) || 4;
  const end = addDaysIso(start, weeks * 7 - 1);
  const days = React.useMemo(() => eachDayIso(start, end), [start, end]);

  /* ---------- date locale (optimiste) ---------- */
  const [allocs, setAllocs] = React.useState(allocations);
  React.useEffect(() => setAllocs(allocations), [allocations]);
  const serverAllocs = React.useRef(allocations);
  serverAllocs.current = allocations;

  /* ---------- dimensiuni ---------- */
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(1120);
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const mobile = width < 640;
  const LEFT = mobile ? 136 : 252;
  const dw = Math.max(MIN_DW[range] ?? 28, (width - LEFT - 1) / days.length);
  const dwRef = React.useRef(dw);
  dwRef.current = dw;
  const timelineW = dw * days.length;
  const todayIdx = days.indexOf(today);

  /* ---------- hărți ---------- */
  const projectById = React.useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const memberById = React.useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const departments = React.useMemo(() => [...new Set(members.map((m) => m.department).filter(Boolean) as string[])].sort(), [members]);
  const offByMember = React.useMemo(() => {
    const map = new Map<string, TimeOffRow[]>();
    for (const t of timeOff) {
      if (t.endDate < start || t.startDate > end) continue;
      map.set(t.memberId, [...(map.get(t.memberId) ?? []), t]);
    }
    return map;
  }, [timeOff, start, end]);
  const approvedOff = React.useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const [mid, list] of offByMember) {
      const set = new Set<string>();
      for (const t of list) if (t.status === "approved") for (const d of eachDayIso(t.startDate < start ? start : t.startDate, t.endDate > end ? end : t.endDate)) set.add(d);
      map.set(mid, set);
    }
    return map;
  }, [offByMember, start, end]);

  /* ---------- drag ---------- */
  const [drag, setDragState] = React.useState<DragState | null>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const setDrag = (d: DragState | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const justDragged = React.useRef(false);
  const [sel, setSelState] = React.useState<Selection | null>(null);
  const selRef = React.useRef<Selection | null>(null);
  const setSel = (s: Selection | null) => {
    selRef.current = s;
    setSelState(s);
  };

  // alocările efective (cu previzualizarea drag-ului)
  const effective = React.useMemo(() => {
    if (!drag) return allocs;
    return allocs.map((a) =>
      a.id === drag.id
        ? {
            ...a,
            startDate: drag.startDate,
            endDate: drag.endDate,
            ...(view === "oameni" ? { memberId: drag.rowId } : { projectId: drag.rowId }),
          }
        : a,
    );
  }, [allocs, drag, view]);
  const inRange = React.useMemo(() => effective.filter((a) => a.startDate <= end && a.endDate >= start), [effective, start, end]);

  /* ---------- încărcare per membru / zi ---------- */
  const load = React.useMemo(() => {
    const map = new Map<string, number[]>();
    for (const a of inRange) {
      let arr = map.get(a.memberId);
      if (!arr) map.set(a.memberId, (arr = new Array(days.length).fill(0)));
      const off = approvedOff.get(a.memberId);
      const s = Math.max(0, daysBetween(start, a.startDate));
      const e = Math.min(days.length - 1, daysBetween(start, a.endDate));
      for (let i = s; i <= e; i++) if (isWorkingDay(days[i]) && !off?.has(days[i])) arr[i] += a.hoursPerDay;
    }
    return map;
  }, [inRange, approvedOff, days, start]);

  const memberStats = React.useCallback(
    (m: MemberLite) => {
      const off = approvedOff.get(m.id);
      const arr = load.get(m.id) ?? new Array(days.length).fill(0);
      const cap = dailyCapacity(m.weeklyCapacity);
      const capacity = days.filter((d) => isWorkingDay(d) && !off?.has(d)).length * cap;
      const allocated = arr.reduce((a, b) => a + b, 0);
      const weeksData = Array.from({ length: weeks }, (_, w) => {
        const slice = days.slice(w * 7, w * 7 + 7);
        const c = slice.filter((d) => isWorkingDay(d) && !off?.has(d)).length * cap;
        const al = arr.slice(w * 7, w * 7 + 7).reduce((a, b) => a + b, 0);
        return { capacity: c, allocated: al, pct: pct(al, c) };
      });
      return { capacity, allocated, util: pct(allocated, capacity), weeks: weeksData };
    },
    [approvedOff, load, days, weeks],
  );

  /* ---------- rânduri ---------- */
  const q = query.trim().toLowerCase();
  const peopleRows = React.useMemo(() => {
    return members.filter((m) => {
      if (dept && m.department !== dept) return false;
      if (q && !`${m.name} ${m.position ?? ""}`.toLowerCase().includes(q)) return false;
      if (projectFilter && !effective.some((a) => a.memberId === m.id && a.projectId === projectFilter)) return false;
      return true;
    });
  }, [members, dept, q, projectFilter, effective]);

  const projectRows = React.useMemo(() => {
    return projects.filter((p) => {
      if (projectFilter && p.id !== projectFilter) return false;
      if (q && !`${p.name} ${p.code ?? ""} ${p.clientName ?? ""}`.toLowerCase().includes(q)) return false;
      const has = inRange.some((a) => a.projectId === p.id);
      return has || p.status === "active" || p.status === "planning";
    });
  }, [projects, projectFilter, q, inRange]);

  /* ---------- KPI ---------- */
  const kpi = React.useMemo(() => {
    let capacity = 0;
    let allocated = 0;
    let over = 0;
    for (const m of peopleRows) {
      const s = memberStats(m);
      capacity += s.capacity;
      allocated += s.allocated;
      if (s.weeks.some((w) => w.pct > 100.5)) over++;
    }
    const weekEnd = addDaysIso(currentWeek, 6);
    const away = new Set(timeOff.filter((t) => t.status === "approved" && t.startDate <= weekEnd && t.endDate >= currentWeek).map((t) => t.memberId));
    return { capacity, allocated, util: pct(allocated, capacity), over, away: away.size };
  }, [peopleRows, memberStats, timeOff, currentWeek]);

  /* ---------- dialog ---------- */
  const [dialog, setDialog] = React.useState<{ open: boolean; draft: AllocationDraft | null }>({ open: false, draft: null });
  const [urlOpen, setUrlOpen] = useOpenFromUrl();
  React.useEffect(() => {
    if (urlOpen && canManage) {
      setDialog({ open: true, draft: { startDate: currentWeek, endDate: addDaysIso(currentWeek, 4), projectId: projectFilter || undefined } });
      setUrlOpen(false);
    }
  }, [urlOpen, canManage, currentWeek, projectFilter, setUrlOpen]);

  const openCreate = (rowId: string, a: number, b: number) => {
    const s = days[Math.min(a, b)];
    let e = days[Math.max(a, b)];
    if (a === b) {
      const dow = dayOfWeek(s);
      e = dow < 4 ? addDaysIso(s, 4 - dow) : s;
    }
    const base: AllocationDraft = { startDate: s, endDate: e, hoursPerDay: 8 };
    if (view === "oameni") {
      base.memberId = rowId;
      if (projectFilter) base.projectId = projectFilter;
    } else base.projectId = rowId;
    setDialog({ open: true, draft: base });
  };
  const openEdit = (a: AllocationRow) => setDialog({ open: true, draft: { ...a } });

  /* ---------- navigare ---------- */
  const step = weeks === 2 ? 1 : weeks === 4 ? 2 : 4;
  const shift = (n: number) => setStartParam(addDaysIso(start, n * 7));
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [role=dialog], [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") shift(-step);
      else if (e.key === "ArrowRight") shift(step);
      else if (e.key.toLowerCase() === "t") setStartParam(currentWeek);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------- interacțiuni pe bare ---------- */
  const commitMove = (a: AllocationRow, d: DragState, originalRow: string) => {
    const rowChanged = d.rowId !== originalRow;
    if (d.startDate === a.startDate && d.endDate === a.endDate && !rowChanged) return;
    const patch = {
      startDate: d.startDate,
      endDate: d.endDate,
      ...(rowChanged ? (view === "oameni" ? { memberId: d.rowId } : { projectId: d.rowId }) : {}),
    };
    setAllocs((list) => list.map((x) => (x.id === a.id ? { ...x, ...patch } : x)));
    moveAllocationAction({ id: a.id, ...patch })
      .then((r) => {
        if (!r.ok) {
          toast.error(r.error);
          setAllocs(serverAllocs.current);
        } else {
          const who = view === "oameni" ? memberById.get(r.data.memberId)?.name : projectById.get(r.data.projectId)?.name;
          toast.success(rowChanged ? `Mutată la ${who}` : `Alocare: ${rangeLabel(r.data.startDate, r.data.endDate)}`, { duration: 1800 });
        }
      })
      .catch(() => {
        toast.error("Nu am putut salva modificarea.");
        setAllocs(serverAllocs.current);
      });
  };

  const beginBarDrag = (e: React.PointerEvent, a: AllocationRow, mode: DragState["mode"], rowId: string) => {
    if (!canManage || e.button !== 0 || e.pointerType === "touch") return;
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 4 && Math.abs(ev.clientY - y0) < 4) return;
      if (!moved) {
        moved = true;
        document.body.style.cursor = mode === "move" ? "grabbing" : "ew-resize";
        document.body.style.userSelect = "none";
      }
      const delta = Math.round(dx / dwRef.current);
      let s = a.startDate;
      let en = a.endDate;
      if (mode === "move") {
        s = addDaysIso(a.startDate, delta);
        en = addDaysIso(a.endDate, delta);
      } else if (mode === "l") {
        s = addDaysIso(a.startDate, delta);
        if (s > en) s = en;
      } else {
        en = addDaysIso(a.endDate, delta);
        if (en < s) en = s;
      }
      let target = dragRef.current?.rowId ?? rowId;
      if (mode === "move") {
        const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-planner-row]");
        if (el?.dataset.plannerRow) target = el.dataset.plannerRow;
      }
      const cur = dragRef.current;
      if (!cur || cur.startDate !== s || cur.endDate !== en || cur.rowId !== target) setDrag({ id: a.id, mode, startDate: s, endDate: en, rowId: target });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onEsc);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      const d = dragRef.current;
      setDrag(null);
      if (!moved) return;
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 50);
      if (d) commitMove(a, d, rowId);
    };
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      moved = false;
      dragRef.current = null;
      onUp();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onEsc);
  };

  const beginSelect = (e: React.PointerEvent<HTMLDivElement>, rowId: string) => {
    if (!canManage || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-bar]")) return;
    const el = e.currentTarget;
    const idxAt = (x: number) => {
      const r = el.getBoundingClientRect();
      return Math.max(0, Math.min(days.length - 1, Math.floor((x - r.left) / dwRef.current)));
    };
    const i0 = idxAt(e.clientX);
    const x0 = e.clientX;
    const y0 = e.clientY;
    if (e.pointerType === "touch") {
      const onUp = (ev: PointerEvent) => {
        cleanup();
        if (Math.abs(ev.clientX - x0) < 8 && Math.abs(ev.clientY - y0) < 8) openCreate(rowId, i0, i0);
      };
      const cleanup = () => {
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", cleanup);
      };
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", cleanup);
      return;
    }
    e.preventDefault();
    setSel({ rowId, a: i0, b: i0 });
    document.body.style.userSelect = "none";
    const onMove = (ev: PointerEvent) => {
      const b = idxAt(ev.clientX);
      if (selRef.current && selRef.current.b !== b) setSel({ ...selRef.current, b });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.removeProperty("user-select");
      const s = selRef.current;
      setSel(null);
      if (s) openCreate(s.rowId, s.a, s.b);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  /* ---------- poziționare ---------- */
  const span = (s: string, e: string) => {
    const a = Math.max(0, daysBetween(start, s));
    const b = Math.min(days.length - 1, daysBetween(start, e));
    return { left: a * dw, width: (b - a + 1) * dw, clipL: s < start, clipR: e > end };
  };

  const rows = view === "oameni" ? peopleRows : projectRows;

  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Capacitate în interval" value={kpi.capacity} format="hours" icon={<Users />} hint={`${peopleRows.length} oameni · ${weeks} săpt.`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Ore alocate" value={kpi.allocated} format="hours" icon={<CalendarRange />} tone="info" />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Grad de alocare"
            value={kpi.util}
            format="percent"
            icon={<Gauge />}
            tone={kpi.util > 100 ? "danger" : kpi.util >= 80 ? "success" : "warning"}
            hint={UTILIZATION_META[utilizationLevel(kpi.util)].label}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Supra-alocați"
            value={kpi.over}
            format="number"
            icon={<AlertTriangle />}
            tone={kpi.over ? "danger" : "success"}
            hint={`${kpi.away} în concediu săptămâna aceasta`}
          />
        </StaggerItem>
      </Stagger>

      {/* Bara de instrumente */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<View>
              value={view}
              onChange={setView}
              options={[
                { value: "oameni", label: "Pe oameni", icon: <Users /> },
                { value: "proiecte", label: "Pe proiecte", icon: <FolderKanban /> },
              ]}
            />
            <Segmented<Range>
              value={range}
              onChange={setRange}
              options={[
                { value: "2", label: mobile ? "2 săpt." : "2 săptămâni" },
                { value: "4", label: mobile ? "4 săpt." : "4 săptămâni" },
                { value: "8", label: mobile ? "8 săpt." : "8 săptămâni" },
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden px-1 text-sm font-semibold tracking-tight md:inline">{rangeLabel(start, end)}</span>
            <div className="flex items-center rounded-xl border border-border bg-card p-0.5 shadow-soft">
              <Tooltip content={<>Înapoi <Kbd className="ml-1">←</Kbd></>}>
                <Button variant="ghost" size="icon-sm" onClick={() => shift(-step)} aria-label="Înapoi">
                  <ChevronLeft />
                </Button>
              </Tooltip>
              <Tooltip content={<>Săptămâna curentă <Kbd className="ml-1">T</Kbd></>}>
                <Button variant="ghost" size="sm" className="px-2.5" onClick={() => setStartParam(currentWeek)} disabled={start === currentWeek}>
                  Azi
                </Button>
              </Tooltip>
              <Tooltip content={<>Înainte <Kbd className="ml-1">→</Kbd></>}>
                <Button variant="ghost" size="icon-sm" onClick={() => shift(step)} aria-label="Înainte">
                  <ChevronRight />
                </Button>
              </Tooltip>
            </div>
            {canManage && (
              <Button
                size="sm"
                onClick={() =>
                  setDialog({
                    open: true,
                    draft: {
                      startDate: currentWeek < start ? start : currentWeek,
                      endDate: addDaysIso(currentWeek < start ? start : currentWeek, 4),
                      hoursPerDay: 8,
                      projectId: projectFilter || undefined,
                    },
                  })
                }
              >
                <Plus /> Alocare
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={view === "oameni" ? "Caută persoană…" : "Caută proiect…"} className="h-8 pl-9" />
          </div>
          <div className="w-[calc(50%-4px)] sm:w-48">
            <NativeSelect value={dept} onChange={(e) => setDept(e.target.value)} className="h-8 text-[13px]">
              <option value="">Toate departamentele</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="w-[calc(50%-4px)] sm:w-60">
            <Combobox
              options={projectOptions(projects)}
              value={projectFilter || null}
              onChange={(v) => setProjectFilter(v)}
              placeholder="Toate proiectele"
              allowClear
              className="h-8 text-[13px]"
            />
          </div>
          {(projectFilter || dept || query) && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setProjectFilter("");
                setDept("");
                setQuery("");
              }}
            >
              <X /> Resetează
            </Button>
          )}
          <span className="ml-auto text-sm font-semibold tracking-tight md:hidden">{rangeLabel(start, end)}</span>
        </div>
      </div>

      {/* Timeline */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div ref={scrollRef} className="scrollbar-thin relative max-h-[calc(100dvh-13rem)] min-h-[360px] overflow-auto overscroll-x-contain">
          <div className="relative" style={{ width: LEFT + timelineW, minWidth: "100%" }}>
            {/* Antet */}
            <div className="sticky top-0 z-30 flex border-b border-border bg-card/95 backdrop-blur">
              <div className="sticky left-0 z-40 flex shrink-0 items-end border-r border-border bg-card px-4 pb-2" style={{ width: LEFT }}>
                <span className="text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {view === "oameni" ? `Echipă · ${rows.length}` : `Proiecte · ${rows.length}`}
                </span>
              </div>
              <div className="relative shrink-0" style={{ width: timelineW, height: 58 }}>
                {Array.from({ length: weeks }, (_, w) => {
                  const ws = days[w * 7];
                  return (
                    <div
                      key={ws}
                      className="absolute top-0 flex h-6 items-center gap-1.5 border-l border-border px-2 text-[11px] whitespace-nowrap text-muted-foreground"
                      style={{ left: w * 7 * dw, width: 7 * dw }}
                    >
                      <span className="font-semibold text-foreground/80">S{isoWeekNumber(ws)}</span>
                      <span className="truncate">{formatDay(ws, dw * 7 > 150 ? "d MMM" : "d.MM")}</span>
                    </div>
                  );
                })}
                {days.map((d, i) => {
                  const isToday = d === today;
                  const hol = holidayName(d);
                  const weekend = dayOfWeek(d) >= 5;
                  return (
                    <div
                      key={d}
                      className={cn(
                        "absolute top-6 flex h-8 flex-col items-center justify-center text-center",
                        dayOfWeek(d) === 0 && "border-l border-border",
                        weekend && "text-muted-foreground/60",
                      )}
                      style={{ left: i * dw, width: dw }}
                    >
                      {dw >= 26 && <span className="text-[9.5px] leading-none font-medium uppercase">{formatDay(d, "EEEEE")}</span>}
                      {(dw >= 22 || isToday || dayOfWeek(d) === 0) && (
                        <span
                          className={cn(
                            "mt-0.5 grid size-5 place-items-center rounded-full text-[11px] leading-none font-semibold tabular",
                            isToday && "bg-primary text-primary-foreground shadow-glow",
                            hol && !isToday && "text-primary",
                          )}
                        >
                          {d.slice(8).replace(/^0/, "")}
                        </span>
                      )}
                      {hol && (
                        <Tooltip content={hol}>
                          <span className="absolute bottom-0 size-1 rounded-full bg-primary" />
                        </Tooltip>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Corp */}
            <div className="relative">
              {/* fundal: weekend, sărbători, separatoare */}
              <div className="pointer-events-none absolute inset-y-0" style={{ left: LEFT, width: timelineW }} aria-hidden>
                {days.map((d, i) => {
                  const weekend = dayOfWeek(d) >= 5;
                  const hol = holidayName(d);
                  if (!weekend && !hol && dayOfWeek(d) !== 0 && d !== today) return null;
                  return (
                    <div
                      key={d}
                      className={cn(
                        "absolute inset-y-0",
                        weekend && "bg-muted/55",
                        hol && "bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--primary)_10%,transparent)_0_6px,transparent_6px_12px)]",
                        d === today && "bg-primary/[0.05]",
                        dayOfWeek(d) === 0 && "border-l border-border",
                      )}
                      style={{ left: i * dw, width: dw }}
                    />
                  );
                })}
              </div>
              {todayIdx >= 0 && (
                <div className="pointer-events-none absolute inset-y-0 w-0.5 rounded-full bg-primary/70" style={{ left: LEFT + todayIdx * dw + dw / 2 - 1 }} aria-hidden>
                  <span className="absolute -top-1 -left-[3px] size-2 rounded-full bg-primary shadow-glow" />
                </div>
              )}

              {rows.length === 0 && (
                <div className="sticky left-0" style={{ width: Math.min(width, LEFT + timelineW) }}>
                  <EmptyState
                    compact
                    icon={view === "oameni" ? <Users /> : <FolderKanban />}
                    title={view === "oameni" ? "Nicio persoană pentru filtrele alese" : "Niciun proiect pentru filtrele alese"}
                    description="Schimbă filtrele sau intervalul."
                  />
                </div>
              )}

              {view === "oameni"
                ? peopleRows.map((m) => {
                    const items = inRange.filter((a) => a.memberId === m.id);
                    const stats = memberStats(m);
                    const level = utilizationLevel(stats.util);
                    return (
                      <TimelineRow
                        key={m.id}
                        rowId={m.id}
                        LEFT={LEFT}
                        width={timelineW}
                        items={items}
                        heat
                        selection={sel?.rowId === m.id ? sel : null}
                        dw={dw}
                        canManage={canManage}
                        onPointerDown={(e) => beginSelect(e, m.id)}
                        left={
                          <Link href={`/echipa/${m.id}`} className="group/left flex min-w-0 flex-1 items-center gap-3">
                            <Avatar name={m.name} color={m.color} size={mobile ? "sm" : "md"} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13px] font-semibold group-hover/left:text-primary">{mobile ? m.name.split(" ")[0] : m.name}</div>
                              {!mobile && <div className="truncate text-[11.5px] text-muted-foreground">{m.position ?? m.department ?? "—"}</div>}
                              <div className="mt-1 flex items-center gap-1.5">
                                <div className="h-1 w-12 overflow-hidden rounded-full bg-muted">
                                  <motion.div
                                    className={cn("h-full rounded-full", level === "over" ? "bg-danger" : level === "ok" ? "bg-success" : "bg-info")}
                                    animate={{ width: `${Math.min(100, stats.util)}%` }}
                                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                  />
                                </div>
                                <span className={cn("text-[10.5px] font-semibold tabular", level === "over" ? "text-danger" : "text-muted-foreground")}>{Math.round(stats.util)}%</span>
                              </div>
                            </div>
                          </Link>
                        }
                        background={
                          <>
                            {(offByMember.get(m.id) ?? []).map((t) => {
                              const sp = span(t.startDate, t.endDate);
                              const meta = TIME_OFF_TYPE[t.type] ?? TIME_OFF_TYPE.other;
                              return (
                                <div
                                  key={t.id}
                                  className={cn(
                                    "pointer-events-none absolute z-[6] overflow-hidden rounded-md border",
                                    t.status === "pending" ? "border-dashed opacity-70" : "border-solid",
                                  )}
                                  style={{
                                    left: sp.left + 1,
                                    width: sp.width - 2,
                                    top: 4,
                                    bottom: HEAT_H + 6,
                                    borderColor: `color-mix(in oklab, ${meta.color} 55%, transparent)`,
                                    background: `repeating-linear-gradient(135deg, color-mix(in oklab, ${meta.color} 26%, transparent) 0 5px, color-mix(in oklab, var(--card) 55%, transparent) 5px 10px)`,
                                  }}
                                >
                                  {sp.width > 54 && (
                                    <span className="absolute bottom-1 left-1.5 inline-flex max-w-[calc(100%-12px)] items-center gap-1 truncate rounded bg-card/85 px-1 text-[10px] leading-4 font-semibold" style={{ color: meta.color }}>
                                      <Palmtree className="size-2.5 shrink-0" />
                                      <span className="truncate">
                                        {meta.label}
                                        {t.status === "pending" ? " · în așteptare" : ""}
                                      </span>
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </>
                        }
                        heatCells={stats.weeks.map((w, i) => ({ ...w, left: i * 7 * dw, width: 7 * dw, label: `S${isoWeekNumber(days[i * 7])}` }))}
                        renderBar={(a, lane, isDragging) => {
                          const p = projectById.get(a.projectId);
                          const sp = span(a.startDate, a.endDate);
                          const dim = !!projectFilter && a.projectId !== projectFilter;
                          return (
                            <Bar
                              key={a.id}
                              a={a}
                              sp={sp}
                              lane={lane}
                              color={p?.color ?? "#888"}
                              dragging={isDragging}
                              dim={dim}
                              canManage={canManage}
                              label={p ? (sp.width > 140 ? p.name : (p.code ?? p.name)) : "Proiect"}
                              sub={`${formatHours(a.hoursPerDay)}/zi`}
                              tooltip={`${p?.name ?? "Proiect"} · ${formatHours(a.hoursPerDay)}/zi · ${rangeLabel(a.startDate, a.endDate)}${a.notes ? ` · ${a.notes}` : ""}`}
                              onPointerDown={(e, mode) => beginBarDrag(e, a, mode, m.id)}
                              onClick={() => !justDragged.current && canManage && openEdit(a)}
                            />
                          );
                        }}
                        draggingId={drag?.id ?? null}
                      />
                    );
                  })
                : projectRows.map((p) => {
                    const items = inRange.filter((a) => a.projectId === p.id && (!dept || memberById.get(a.memberId)?.department === dept));
                    const hours = items.reduce((acc, a) => {
                      const off = approvedOff.get(a.memberId);
                      const s = a.startDate < start ? start : a.startDate;
                      const e = a.endDate > end ? end : a.endDate;
                      return acc + eachDayIso(s, e).filter((d) => isWorkingDay(d) && !off?.has(d)).length * a.hoursPerDay;
                    }, 0);
                    const people = [...new Set(items.map((a) => a.memberId))].map((id) => memberById.get(id)).filter(Boolean) as MemberLite[];
                    return (
                      <TimelineRow
                        key={p.id}
                        rowId={p.id}
                        LEFT={LEFT}
                        width={timelineW}
                        items={items}
                        selection={sel?.rowId === p.id ? sel : null}
                        dw={dw}
                        canManage={canManage}
                        onPointerDown={(e) => beginSelect(e, p.id)}
                        left={
                          <Link href={`/proiecte/${p.id}`} className="group/left flex min-w-0 flex-1 items-center gap-3">
                            <span
                              className="grid size-8 shrink-0 place-items-center rounded-lg font-mono text-[9.5px] font-bold text-white"
                              style={{ background: `linear-gradient(135deg, ${p.color}, color-mix(in oklab, ${p.color} 55%, #000))` }}
                            >
                              {(p.code ?? p.name).slice(0, 3).toUpperCase()}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13px] font-semibold group-hover/left:text-primary">{mobile ? (p.code ?? p.name) : p.name}</div>
                              {!mobile && <div className="truncate text-[11.5px] text-muted-foreground">{p.clientName ?? "Intern"}</div>}
                              <div className="mt-1 flex items-center gap-2">
                                <span className="text-[10.5px] font-semibold text-muted-foreground tabular">{formatHours(hours)}</span>
                                {!mobile && people.length > 0 && <AvatarStack people={people} max={4} size="xs" />}
                              </div>
                            </div>
                          </Link>
                        }
                        renderBar={(a, lane, isDragging) => {
                          const m = memberById.get(a.memberId);
                          const sp = span(a.startDate, a.endDate);
                          return (
                            <Bar
                              key={a.id}
                              a={a}
                              sp={sp}
                              lane={lane}
                              color={p.color}
                              dragging={isDragging}
                              canManage={canManage}
                              avatar={m ? { name: m.name, color: m.color } : undefined}
                              label={m ? (sp.width > 150 ? m.name : m.name.split(" ")[0]) : "Membru"}
                              sub={`${formatHours(a.hoursPerDay)}/zi`}
                              tooltip={`${m?.name ?? "Membru"} · ${formatHours(a.hoursPerDay)}/zi · ${rangeLabel(a.startDate, a.endDate)}${a.notes ? ` · ${a.notes}` : ""}`}
                              onPointerDown={(e, mode) => beginBarDrag(e, a, mode, p.id)}
                              onClick={() => !justDragged.current && canManage && openEdit(a)}
                            />
                          );
                        }}
                        draggingId={drag?.id ?? null}
                      />
                    );
                  })}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-2.5 text-[11.5px] text-muted-foreground">
          {(["under", "ok", "over"] as const).map((l) => (
            <span key={l} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2.5 w-4 rounded-sm", UTILIZATION_META[l].className)} />
              {UTILIZATION_META[l].label}
              <span className="opacity-60">{l === "under" ? "< 80%" : l === "ok" ? "80–100%" : "> 100%"}</span>
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm border border-info/50 bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--info)_35%,transparent)_0_3px,transparent_3px_6px)]" />
            Concediu
          </span>
          {canManage && (
            <span className="ml-auto hidden items-center gap-1 lg:inline-flex">
              Trage pe un rând gol pentru o alocare nouă · trage bara pentru a o muta · marginile pentru durată
            </span>
          )}
        </div>
      </div>

      <AllocationDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        draft={dialog.draft}
        members={members}
        projects={projects.filter((p) => p.status !== "completed" || p.id === dialog.draft?.projectId)}
        allocations={allocs}
        timeOff={timeOff}
        onSaved={(a) => setAllocs((list) => (list.some((x) => x.id === a.id) ? list.map((x) => (x.id === a.id ? a : x)) : [...list, a]))}
        onDeleted={(id) => setAllocs((list) => list.filter((x) => x.id !== id))}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rând timeline                                                       */
/* ------------------------------------------------------------------ */

function TimelineRow({
  rowId,
  LEFT,
  width,
  items,
  heat,
  heatCells,
  selection,
  dw,
  canManage,
  onPointerDown,
  left,
  background,
  renderBar,
  draggingId,
}: {
  rowId: string;
  LEFT: number;
  width: number;
  items: AllocationRow[];
  heat?: boolean;
  heatCells?: { capacity: number; allocated: number; pct: number; left: number; width: number; label: string }[];
  selection: Selection | null;
  dw: number;
  canManage: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  left: React.ReactNode;
  background?: React.ReactNode;
  renderBar: (a: AllocationRow, lane: number, dragging: boolean) => React.ReactNode;
  draggingId: string | null;
}) {
  const { lanes, count } = React.useMemo(() => packLanes(items), [items]);
  const height = ROW_PAD * 2 + Math.max(1, count) * LANE_H + (heat ? HEAT_H + 4 : 0);
  return (
    <motion.div
      layout="position"
      data-planner-row={rowId}
      className="group/row relative flex border-b border-border/70 last:border-b-0"
      animate={{ height }}
      initial={false}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className="sticky left-0 z-20 flex shrink-0 items-center border-r border-border bg-card px-3 transition-colors group-hover/row:bg-subtle sm:px-4"
        style={{ width: LEFT }}
      >
        {left}
      </div>
      <div
        className={cn("relative shrink-0", canManage && "cursor-cell")}
        style={{ width }}
        onPointerDown={onPointerDown}
      >
        {background}
        {selection && (
          <motion.div
            className="pointer-events-none absolute z-[8] rounded-md border-2 border-dashed border-primary/60 bg-primary-soft/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              left: Math.min(selection.a, selection.b) * dw + 1,
              width: (Math.abs(selection.b - selection.a) + 1) * dw - 2,
              top: ROW_PAD,
              height: Math.max(1, count) * LANE_H - (LANE_H - BAR_H),
            }}
          >
            <span className="absolute top-1/2 left-2 -translate-y-1/2 text-[10.5px] font-semibold whitespace-nowrap text-primary">
              {Math.abs(selection.b - selection.a) + 1} {Math.abs(selection.b - selection.a) === 0 ? "zi" : "zile"}
            </span>
          </motion.div>
        )}
        {items.map((a) => renderBar(a, lanes.get(a.id) ?? 0, draggingId === a.id))}
        {heat && heatCells && (
          <div className="pointer-events-none absolute inset-x-0 z-[5]" style={{ bottom: 6, height: HEAT_H }}>
            {heatCells.map((h) => {
              const level = h.capacity === 0 ? "none" : utilizationLevel(h.pct);
              return (
                <Tooltip key={h.left} content={`${h.label}: ${formatHours(h.allocated)} alocate din ${formatHours(h.capacity)} (${Math.round(h.pct)}%)`}>
                  <div
                    className={cn(
                      "pointer-events-auto absolute top-0 flex h-full items-center justify-center rounded-[5px] text-[10px] font-semibold tabular transition-colors duration-300",
                      UTILIZATION_META[level].className,
                    )}
                    style={{ left: h.left + 2, width: h.width - 4 }}
                  >
                    {h.width > 36 ? (h.capacity ? `${Math.round(h.pct)}%` : "—") : ""}
                  </div>
                </Tooltip>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Bară de alocare                                                     */
/* ------------------------------------------------------------------ */

function Bar({
  a,
  sp,
  lane,
  color,
  dragging,
  dim,
  canManage,
  label,
  sub,
  avatar,
  tooltip,
  onPointerDown,
  onClick,
}: {
  a: AllocationRow;
  sp: { left: number; width: number; clipL: boolean; clipR: boolean };
  lane: number;
  color: string;
  dragging: boolean;
  dim?: boolean;
  canManage: boolean;
  label: string;
  sub: string;
  avatar?: { name: string; color: string };
  tooltip: string;
  onPointerDown: (e: React.PointerEvent, mode: "move" | "l" | "r") => void;
  onClick: () => void;
}) {
  const left = sp.left + 2;
  const width = Math.max(10, sp.width - 4);
  const top = ROW_PAD + lane * LANE_H;
  const bar = (
    <motion.div
      data-bar
      data-allocation-id={a.id}
      initial={dragging ? false : { opacity: 0, left, width, top, scale: 0.96 }}
      animate={{ opacity: dim ? 0.32 : 1, left, width, top, scale: dragging ? 1.02 : 1 }}
      exit={{ opacity: 0 }}
      transition={dragging ? { duration: 0.08 } : SPRING}
      onPointerDown={(e) => onPointerDown(e, "move")}
      onClick={onClick}
      className={cn(
        "group/bar absolute z-[4] flex items-center overflow-hidden border text-[11.5px] leading-none select-none",
        canManage ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        dragging && "z-[9] shadow-lift ring-2 ring-primary/40",
        sp.clipL ? "rounded-l-none border-l-0" : "rounded-l-md",
        sp.clipR ? "rounded-r-none border-r-0" : "rounded-r-md",
      )}
      style={{
        height: BAR_H,
        background: `linear-gradient(90deg, color-mix(in oklab, ${color} 30%, var(--card)), color-mix(in oklab, ${color} 18%, var(--card)))`,
        borderColor: `color-mix(in oklab, ${color} 50%, transparent)`,
        boxShadow: sp.clipL ? undefined : `inset 3px 0 0 ${color}`,
      }}
    >
      {canManage && !sp.clipL && (
        <span
          onPointerDown={(e) => onPointerDown(e, "l")}
          className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize opacity-0 transition-opacity group-hover/bar:opacity-100"
          style={{ background: `linear-gradient(90deg, color-mix(in oklab, ${color} 60%, transparent), transparent)` }}
        />
      )}
      <span className={cn("flex min-w-0 items-center gap-1.5 pr-2", sp.clipL ? "pl-1.5" : "pl-2.5")}>
        {sp.clipL && <ChevronLeft className="size-3 shrink-0 opacity-60" />}
        {avatar && width > 70 && <Avatar name={avatar.name} color={avatar.color} size="xs" className="size-4 text-[7px] ring-0" />}
        {width > 46 && <span className="truncate font-semibold text-foreground">{label}</span>}
        <span className="shrink-0 font-medium whitespace-nowrap text-muted-foreground tabular">{width > 46 ? `· ${sub}` : sub.replace("/zi", "")}</span>
      </span>
      {sp.clipR && <ChevronRight className="absolute right-1 size-3 shrink-0 opacity-60" />}
      {canManage && !sp.clipR && (
        <span
          onPointerDown={(e) => onPointerDown(e, "r")}
          className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize opacity-0 transition-opacity group-hover/bar:opacity-100"
          style={{ background: `linear-gradient(270deg, color-mix(in oklab, ${color} 60%, transparent), transparent)` }}
        />
      )}
    </motion.div>
  );
  return <Tooltip content={tooltip}>{bar}</Tooltip>;
}
