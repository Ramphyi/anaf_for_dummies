"use client";

import { CalendarClock, GripVertical, Plus, Search, X } from "lucide-react";
import { animate, motion } from "motion/react";
import * as React from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, Kbd } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/popover";
import { TASK_PRIORITY, TASK_STATUS } from "@/lib/constants";
import { formatHours } from "@/lib/format";
import { addDaysIso, formatDay } from "@/lib/outsourcing/dates";
import { cn } from "@/lib/utils";
import { moveTaskAction, saveTaskAction } from "@/app/(app)/proiecte/actions";
import type { KanbanTask, ProjectMemberRow } from "./project-detail";
import { TaskDialog } from "./task-dialog";

const STATUSES = Object.keys(TASK_STATUS);
const STATUS_DOT: Record<string, string> = {
  backlog: "bg-muted-foreground/50",
  todo: "bg-info",
  in_progress: "bg-warning",
  review: "bg-primary",
  done: "bg-success",
};
const PRIORITY_BARS: Record<string, number> = { low: 1, medium: 2, high: 3, urgent: 4 };
const EASE = [0.16, 1, 0.3, 1] as const;

type DragState = { id: string; status: string; index: number; width: number; height: number };
type Pending = {
  id: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  pointerId: number;
  started: boolean;
};

export function Kanban({
  projectId,
  tasks,
  members,
  canManage,
  meId,
  today,
}: {
  projectId: string;
  tasks: KanbanTask[];
  members: ProjectMemberRow[];
  canManage: boolean;
  meId: string | null;
  today: string;
}) {
  const [items, setItems] = React.useState(tasks);
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const [query, setQuery] = React.useState("");
  const [assignee, setAssignee] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<{ open: boolean; task: KanbanTask | null; status?: string }>({ open: false, task: null });

  const serverTasks = React.useRef(tasks);
  const itemsRef = React.useRef(items);
  const dragRef = React.useRef<DragState | null>(null);
  const pending = React.useRef<Pending | null>(null);
  const boardRef = React.useRef<HTMLDivElement>(null);
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const colRefs = React.useRef(new Map<string, HTMLDivElement>());
  const visibleRef = React.useRef<Record<string, KanbanTask[]>>({});
  const raf = React.useRef<number | null>(null);

  React.useEffect(() => {
    serverTasks.current = tasks;
    if (!dragRef.current) setItems(tasks);
  }, [tasks]);
  React.useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const memberById = React.useMemo(() => new Map(members.map((m) => [m.memberId, m])), [members]);
  const canMove = React.useCallback((t: KanbanTask) => canManage || (!!meId && t.assigneeId === meId), [canManage, meId]);

  const matches = React.useCallback(
    (t: KanbanTask) => {
      if (assignee && t.assigneeId !== assignee) return false;
      const q = query.trim().toLowerCase();
      return !q || t.title.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q);
    },
    [assignee, query],
  );

  /** Coloanele vizibile (cu previzualizarea poziției în timpul drag-ului). */
  const columns = React.useMemo(() => {
    const by: Record<string, KanbanTask[]> = Object.fromEntries(STATUSES.map((s) => [s, []]));
    const sorted = [...items].sort((a, b) => a.position - b.position);
    for (const t of sorted) if ((!drag || t.id !== drag.id) && matches(t)) by[t.status]?.push(t);
    visibleRef.current = by;
    if (drag) {
      const t = items.find((x) => x.id === drag.id);
      if (t) {
        by[drag.status] = [...by[drag.status]];
        by[drag.status].splice(Math.min(drag.index, by[drag.status].length), 0, { ...t, status: drag.status });
      }
    }
    return by;
  }, [items, drag, matches]);

  const counts = React.useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of items) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [items]);

  /* ----------------------------- Drag & drop ----------------------------- */

  // Ascultători stabili pe window care deleagă către ultimele versiuni ale handler-elor.
  const latest = React.useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void; cancel: () => void; key: (e: KeyboardEvent) => void } | null>(null);
  const stable = React.useMemo(
    () => ({
      move: (e: PointerEvent) => latest.current?.move(e),
      up: (e: PointerEvent) => latest.current?.up(e),
      cancel: () => latest.current?.cancel(),
      key: (e: KeyboardEvent) => latest.current?.key(e),
    }),
    [],
  );

  const setDragState = (d: DragState | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  const computeOver = React.useCallback((x: number, y: number, id: string) => {
    let best = STATUSES[0];
    let bestDist = Infinity;
    for (const [status, el] of colRefs.current) {
      const r = el.getBoundingClientRect();
      const dist = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      if (dist < bestDist) {
        bestDist = dist;
        best = status;
      }
    }
    const el = colRefs.current.get(best);
    let index = 0;
    if (el) {
      const cards = Array.from(el.querySelectorAll<HTMLElement>("[data-task-id]")).filter((c) => c.dataset.taskId !== id);
      for (const c of cards) {
        const r = c.getBoundingClientRect();
        if (y > r.top + r.height / 2) index++;
      }
    }
    return { status: best, index };
  }, []);

  const positionOverlay = (p: Pending) => {
    const el = overlayRef.current;
    if (!el) return;
    el.style.left = `${p.x - p.offsetX}px`;
    el.style.top = `${p.y - p.offsetY}px`;
  };

  const updateOver = React.useCallback(() => {
    const p = pending.current;
    const d = dragRef.current;
    if (!p || !d) return;
    const over = computeOver(p.x, p.y, p.id);
    if (over.status !== d.status || over.index !== d.index) setDragState({ ...d, ...over });
  }, [computeOver]);

  const autoScroll = React.useCallback(() => {
    const p = pending.current;
    const board = boardRef.current;
    if (!p?.started || !board) return;
    const r = board.getBoundingClientRect();
    const edge = 56;
    let dx = 0;
    if (p.x < r.left + edge) dx = -Math.ceil((r.left + edge - p.x) / 4);
    else if (p.x > r.right - edge) dx = Math.ceil((p.x - (r.right - edge)) / 4);
    let dy = 0;
    if (p.y < 80) dy = -Math.ceil((80 - p.y) / 4);
    else if (p.y > window.innerHeight - 60) dy = Math.ceil((p.y - (window.innerHeight - 60)) / 4);
    if (dx) board.scrollLeft += dx;
    if (dy) window.scrollBy(0, dy);
    if (dx || dy) updateOver();
    raf.current = requestAnimationFrame(autoScroll);
  }, [updateOver]);

  const cleanup = () => {
    window.removeEventListener("pointermove", stable.move);
    window.removeEventListener("pointerup", stable.up);
    window.removeEventListener("pointercancel", stable.cancel);
    window.removeEventListener("keydown", stable.key);
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    document.body.style.removeProperty("user-select");
    document.body.style.removeProperty("cursor");
  };

  const onMove = (e: PointerEvent) => {
    const p = pending.current;
    if (!p || e.pointerId !== p.pointerId) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (!p.started) {
      if (Math.hypot(p.x - p.startX, p.y - p.startY) < 5) return;
      const t = itemsRef.current.find((x) => x.id === p.id);
      if (!t) return;
      p.started = true;
      try {
        boardRef.current?.setPointerCapture(p.pointerId);
      } catch {
        /* ignorat */
      }
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
      const index = (visibleRef.current[t.status] ?? []).findIndex((x) => x.id === t.id);
      setDragState({ id: t.id, status: t.status, index: Math.max(0, index), width: p.width, height: p.height });
      raf.current = requestAnimationFrame(autoScroll);
    }
    e.preventDefault();
    positionOverlay(p);
    updateOver();
  };

  const finish = (commit: boolean) => {
    const p = pending.current;
    const d = dragRef.current;
    cleanup();
    pending.current = null;
    if (!p?.started || !d) {
      setDragState(null);
      return;
    }
    const target = boardRef.current?.querySelector<HTMLElement>(`[data-task-id="${d.id}"]`);
    const overlay = overlayRef.current;
    const done = () => {
      if (commit) commitMove(d);
      setDragState(null);
    };
    if (target && overlay && commit) {
      const r = target.getBoundingClientRect();
      animate(overlay, { left: r.left, top: r.top, rotate: 0, scale: 1 }, { duration: 0.2, ease: EASE }).then(done);
    } else done();
  };

  const onUp = (e: PointerEvent) => {
    if (pending.current && e.pointerId !== pending.current.pointerId) return;
    finish(true);
  };
  const onCancel = () => finish(false);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") finish(false);
  };

  React.useLayoutEffect(() => {
    latest.current = { move: onMove, up: onUp, cancel: onCancel, key: onKey };
  });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, t: KanbanTask) => {
    if (!canMove(t) || e.button !== 0 || pending.current) return;
    const target = e.target as HTMLElement;
    const onHandle = !!target.closest("[data-drag-handle]");
    if (e.pointerType === "touch" && !onHandle) return; // pe touch se trage doar de mâner (restul derulează)
    if (!onHandle && target.closest("button, a, input, textarea")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    pending.current = {
      id: t.id,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      pointerId: e.pointerId,
      started: false,
    };
    window.addEventListener("pointermove", stable.move, { passive: false });
    window.addEventListener("pointerup", stable.up);
    window.addEventListener("pointercancel", stable.cancel);
    window.addEventListener("keydown", stable.key);
  };

  React.useEffect(() => () => cleanup(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const commitMove = (d: DragState) => {
    const all = itemsRef.current;
    const moved = all.find((t) => t.id === d.id);
    if (!moved) return;
    const fullCol = all.filter((t) => t.status === d.status && t.id !== d.id).sort((a, b) => a.position - b.position);
    const visibleCol = (visibleRef.current[d.status] ?? []).filter((t) => t.id !== d.id);
    let fullIndex: number;
    if (d.index < visibleCol.length) fullIndex = fullCol.findIndex((t) => t.id === visibleCol[d.index].id);
    else if (visibleCol.length) fullIndex = fullCol.findIndex((t) => t.id === visibleCol[visibleCol.length - 1].id) + 1;
    else fullIndex = fullCol.length;
    if (fullIndex < 0) fullIndex = fullCol.length;

    const before = [...all.filter((t) => t.status === moved.status)].sort((a, b) => a.position - b.position).findIndex((t) => t.id === moved.id);
    if (moved.status === d.status && before === fullIndex) return;

    const col = [...fullCol];
    col.splice(fullIndex, 0, { ...moved, status: d.status });
    const pos = new Map(col.map((t, i) => [t.id, i]));
    const next = all.map((t) => (pos.has(t.id) ? { ...t, status: d.status, position: pos.get(t.id)! } : t));
    itemsRef.current = next;
    setItems(next);
    moveTaskAction({ id: d.id, status: d.status as never, index: fullIndex })
      .then((r) => {
        if (!r.ok) {
          toast.error(r.error);
          setItems(serverTasks.current);
        } else if (moved.status !== d.status) {
          toast.success(`„${moved.title}” → ${TASK_STATUS[d.status].label}`, { duration: 1800 });
        }
      })
      .catch(() => {
        toast.error("Nu am putut salva mutarea.");
        setItems(serverTasks.current);
      });
  };

  /* ----------------------------- Scurtături ----------------------------- */

  React.useEffect(() => {
    if (!canManage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (el.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      e.preventDefault();
      setDialog({ open: true, task: null, status: "todo" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canManage]);

  const dragged = drag ? items.find((t) => t.id === drag.id) : null;
  const filtering = !!query || !!assignee;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrează task-uri…" className="h-8 pl-9" />
          </div>
          <div className="flex items-center -space-x-1.5">
            {members
              .filter((m) => m.active)
              .map((m) => (
                <Tooltip key={m.memberId} content={assignee === m.memberId ? "Arată toate" : `Doar ${m.name}`}>
                  <button
                    type="button"
                    onClick={() => setAssignee((a) => (a === m.memberId ? null : m.memberId))}
                    className={cn(
                      "rounded-full transition-all hover:z-10 hover:-translate-y-0.5",
                      assignee && assignee !== m.memberId && "opacity-35 grayscale",
                      assignee === m.memberId && "z-10 ring-2 ring-primary ring-offset-2 ring-offset-background",
                    )}
                  >
                    <Avatar name={m.name} color={m.color} size="sm" />
                  </button>
                </Tooltip>
              ))}
          </div>
          {filtering && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setQuery("");
                setAssignee(null);
              }}
            >
              <X /> Resetează
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:inline-flex">
            Trage cardurile între coloane{canManage && <> · <Kbd>N</Kbd> task nou</>}
          </span>
          {canManage && (
            <Button size="sm" onClick={() => setDialog({ open: true, task: null, status: "todo" })}>
              <Plus /> Task nou
            </Button>
          )}
        </div>
      </div>

      <div
        ref={boardRef}
        className="scrollbar-thin -mx-4 grid auto-cols-[minmax(250px,1fr)] grid-flow-col gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0 xl:auto-cols-[minmax(0,1fr)]"
      >
        {STATUSES.map((status) => {
          const list = columns[status] ?? [];
          const isOver = drag?.status === status;
          return (
            <section
              key={status}
              className={cn(
                "flex min-h-[420px] flex-col rounded-2xl border border-border/70 bg-muted/35 transition-colors duration-200",
                isOver && "border-primary/30 bg-primary-soft/40",
              )}
            >
              <header className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
                <div className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", STATUS_DOT[status])} />
                  <h3 className="text-[13px] font-semibold">{TASK_STATUS[status].label}</h3>
                  <motion.span
                    key={counts[status] ?? 0}
                    initial={{ scale: 1.25, opacity: 0.6 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="rounded-md bg-foreground/[0.07] px-1.5 text-[11px] font-medium text-muted-foreground tabular"
                  >
                    {counts[status] ?? 0}
                  </motion.span>
                </div>
                {canManage && (
                  <Button variant="ghost" size="icon-xs" aria-label="Adaugă task" onClick={() => setDialog({ open: true, task: null, status })}>
                    <Plus />
                  </Button>
                )}
              </header>
              <div
                ref={(el) => {
                  if (el) colRefs.current.set(status, el);
                  else colRefs.current.delete(status);
                }}
                className="flex flex-1 flex-col gap-2 px-2 pb-2"
              >
                {list.map((t) =>
                  drag?.id === t.id ? (
                    <motion.div
                      key={t.id}
                      layout="position"
                      data-task-id={t.id}
                      transition={{ type: "spring", stiffness: 520, damping: 42 }}
                      className="rounded-xl border-2 border-dashed border-primary/40 bg-primary-soft/50"
                      style={{ height: drag.height }}
                    />
                  ) : (
                    <motion.div
                      key={t.id}
                      layout="position"
                      data-task-id={t.id}
                      transition={{ type: "spring", stiffness: 520, damping: 42 }}
                      onPointerDown={(e) => onPointerDown(e, t)}
                      onClick={() => setDialog({ open: true, task: t })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setDialog({ open: true, task: t });
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className={cn("outline-none", canMove(t) ? "cursor-grab active:cursor-grabbing" : "cursor-pointer")}
                    >
                      <TaskCard task={t} member={t.assigneeId ? memberById.get(t.assigneeId) : undefined} today={today} draggable={canMove(t)} />
                    </motion.div>
                  ),
                )}
                {list.length === 0 && !drag && (
                  <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-border/80 px-3 py-8 text-center text-xs text-muted-foreground">
                    {filtering ? "Niciun task potrivit" : "Niciun task"}
                  </div>
                )}
                {canManage && !drag && (
                  <QuickAdd
                    projectId={projectId}
                    status={status}
                    onCreated={(t) => setItems((prev) => [...prev, t])}
                  />
                )}
              </div>
            </section>
          );
        })}
      </div>

      {drag &&
        dragged &&
        createPortal(
          <motion.div
            ref={overlayRef}
            initial={{ scale: 1, rotate: 0 }}
            animate={{ scale: 1.03, rotate: 1.5 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="pointer-events-none fixed z-[70] cursor-grabbing"
            style={{
              width: drag.width,
              left: (pending.current?.x ?? 0) - (pending.current?.offsetX ?? 0),
              top: (pending.current?.y ?? 0) - (pending.current?.offsetY ?? 0),
            }}
          >
            <TaskCard task={dragged} member={dragged.assigneeId ? memberById.get(dragged.assigneeId) : undefined} today={today} lifted />
          </motion.div>,
          document.body,
        )}

      <TaskDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        task={dialog.task}
        defaultStatus={dialog.status}
        projectId={projectId}
        members={members}
        readOnly={!canManage}
      />
    </div>
  );
}

/* ------------------------------- Card ------------------------------- */

function PriorityIcon({ priority }: { priority: string }) {
  const n = PRIORITY_BARS[priority] ?? 2;
  const color = priority === "urgent" ? "bg-danger" : priority === "high" ? "bg-warning" : priority === "medium" ? "bg-info" : "bg-muted-foreground/60";
  return (
    <span className="inline-flex h-3 items-end gap-[2px]" aria-hidden>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={cn("w-[3px] rounded-sm", i <= n ? color : "bg-foreground/10")} style={{ height: `${25 * i}%` }} />
      ))}
    </span>
  );
}

function TaskCard({
  task: t,
  member,
  today,
  draggable,
  lifted,
}: {
  task: KanbanTask;
  member?: ProjectMemberRow;
  today: string;
  draggable?: boolean;
  lifted?: boolean;
}) {
  const overdue = !!t.dueDate && t.dueDate < today && t.status !== "done";
  const soon = !!t.dueDate && !overdue && t.dueDate <= addDaysIso(today, 2) && t.status !== "done";
  const over = !!t.estimateHours && t.loggedHours > t.estimateHours;
  const progress = t.estimateHours ? Math.min(100, (t.loggedHours / t.estimateHours) * 100) : 0;
  const p = TASK_PRIORITY[t.priority] ?? TASK_PRIORITY.medium;
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card p-3 shadow-soft transition-[box-shadow,border-color] duration-200 hover:border-input hover:shadow-lift",
        t.status === "done" && "opacity-80",
        lifted && "border-primary/40 shadow-lift ring-4 ring-primary/10",
      )}
    >
      <div className="flex items-start gap-2">
        <p className={cn("min-w-0 flex-1 text-[13px] leading-snug font-medium", t.status === "done" && "text-muted-foreground line-through decoration-muted-foreground/40")}>
          {t.title}
        </p>
        {draggable && (
          <span
            data-drag-handle
            className="-mt-0.5 -mr-1 shrink-0 touch-none rounded p-0.5 text-muted-foreground/60 transition-opacity hover:bg-muted hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"
          >
            <GripVertical className="size-3.5" />
          </span>
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={p.tone} className="gap-1.5 px-1.5 py-0 text-[11px]">
          <PriorityIcon priority={t.priority} />
          {p.label}
        </Badge>
        {t.dueDate && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 text-[11px] leading-5 font-medium",
              overdue ? "bg-danger-soft text-danger-soft-foreground" : soon ? "bg-warning-soft text-warning-soft-foreground" : "text-muted-foreground",
            )}
          >
            <CalendarClock className="size-3" />
            {formatDay(t.dueDate, "d MMM")}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        {member ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <Avatar name={member.name} color={member.color} size="xs" className="ring-0" />
            <span className="truncate">{member.name.split(" ")[0]}</span>
          </span>
        ) : (
          <span className="text-[11.5px] text-muted-foreground/70">Neatribuit</span>
        )}
        <span className={cn("shrink-0 text-[11.5px] tabular", over ? "font-semibold text-danger" : "text-muted-foreground")}>
          {formatHours(t.loggedHours)}
          {t.estimateHours ? <span className="text-muted-foreground"> / {formatHours(t.estimateHours)}</span> : null}
        </span>
      </div>
      {t.estimateHours ? (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-transparent">
          <div className={cn("h-full transition-[width] duration-700", over ? "bg-danger" : "bg-primary/60")} style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------- Adăugare rapidă ------------------------------- */

function QuickAdd({ projectId, status, onCreated }: { projectId: string; status: string; onCreated: (t: KanbanTask) => void }) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    const value = title.trim();
    if (!value || busy) return;
    setBusy(true);
    const r = await saveTaskAction({ projectId, title: value, status: status as never, priority: "medium" });
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setTitle("");
    onCreated({
      id: r.data.id,
      title: r.data.title,
      description: r.data.description,
      status: r.data.status,
      priority: r.data.priority,
      assigneeId: r.data.assigneeId,
      estimateHours: r.data.estimateHours,
      dueDate: r.data.dueDate,
      position: r.data.position,
      loggedHours: 0,
    });
  };

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-auto flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
      >
        <Plus className="size-3.5" /> Adaugă task
      </button>
    );
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-auto rounded-xl border border-primary/40 bg-card p-2 shadow-soft">
      <input
        autoFocus
        value={title}
        disabled={busy}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
          if (e.key === "Escape") {
            setOpen(false);
            setTitle("");
          }
        }}
        onBlur={() => !title.trim() && setOpen(false)}
        placeholder="Titlul task-ului…"
        className="w-full bg-transparent px-1 py-1 text-[13px] outline-none placeholder:text-muted-foreground/70"
      />
      <div className="mt-1 flex items-center justify-between px-1 text-[10.5px] text-muted-foreground">
        <span>
          <Kbd>Enter</Kbd> salvează · <Kbd>Esc</Kbd> închide
        </span>
        {busy && <span className="animate-pulse">Se salvează…</span>}
      </div>
    </motion.div>
  );
}
