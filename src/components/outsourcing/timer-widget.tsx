"use client";

import { Play, Square, Timer, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { ColorDot } from "@/components/ui/misc";
import { useAction } from "@/hooks/use-action";
import { formatHours } from "@/lib/format";
import { formatStopwatch } from "@/lib/outsourcing/dates";
import { discardTimerAction, startTimerAction, stopTimerAction } from "@/app/(app)/pontaj/actions";
import { projectOptions } from "./shared";
import type { TimesheetProject, TimerInfo } from "./timesheet";

export function TimerWidget({ timer, projects }: { timer: TimerInfo | null; projects: TimesheetProject[] }) {
  const assignable = projects.filter((p) => p.assignable);
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [taskId, setTaskId] = React.useState<string | null>(null);
  const [description, setDescription] = React.useState("");
  const { run, pending } = useAction();
  const project = projects.find((p) => p.id === (timer?.projectId ?? projectId));
  const tasks = (project?.tasks ?? []).filter((t) => t.status !== "done" || t.id === taskId);

  const start = () => {
    if (!projectId) return;
    run(() => startTimerAction({ projectId, taskId, description }), {
      onSuccess: () => {
        setDescription("");
      },
    });
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <AnimatePresence mode="wait" initial={false}>
        {timer ? (
          <motion.div
            key="running"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5"
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.07]"
              style={{ background: `radial-gradient(120% 140% at 0% 50%, ${project?.color ?? "var(--primary)"}, transparent 60%)` }}
            />
            <div className="relative flex min-w-0 flex-1 items-center gap-4">
              <div className="relative grid size-12 shrink-0 place-items-center rounded-2xl text-white shadow-lift" style={{ background: project?.color ?? "var(--primary)" }}>
                <span className="absolute inset-0 animate-ping rounded-2xl opacity-20" style={{ background: project?.color ?? "var(--primary)" }} />
                <Timer className="relative size-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <ColorDot color={project?.color ?? "#888"} />
                  <span className="truncate font-semibold">{project?.name ?? "Proiect"}</span>
                  {timer.taskId && <span className="truncate text-muted-foreground">· {project?.tasks.find((t) => t.id === timer.taskId)?.title}</span>}
                </div>
                <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{timer.description || "Fără descriere"}</p>
              </div>
            </div>
            <div className="relative flex items-center justify-between gap-4 sm:justify-end">
              <div className="text-right">
                <Stopwatch startedAt={timer.startedAt} />
                {timer.baseHours > 0 && <div className="text-[11px] text-muted-foreground">+ {formatHours(timer.baseHours)} pontate deja</div>}
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="icon" aria-label="Renunță la cronometru" onClick={() => run(() => discardTimerAction())} disabled={pending}>
                  <X />
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => run(() => stopTimerAction(), { success: (d) => `Cronometru oprit · +${formatHours(d.added)}` })}
                  loading={pending}
                >
                  <Square className="fill-current" /> Stop
                </Button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.form
            key="idle"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onSubmit={(e) => {
              e.preventDefault();
              start();
            }}
            className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center"
          >
            <div className="flex items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                <Timer className="size-5" />
              </div>
              <div className="lg:hidden">
                <div className="text-sm font-semibold">Cronometru</div>
                <div className="text-xs text-muted-foreground">Pornește și uită de el — timpul se adaugă în pontaj.</div>
              </div>
            </div>
            <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
              <Combobox
                options={projectOptions(assignable)}
                value={projectId}
                onChange={(v) => {
                  setProjectId(v || null);
                  setTaskId(null);
                }}
                placeholder="Proiect…"
                searchPlaceholder="Caută proiect…"
              />
              <Combobox
                options={tasks.map((t) => ({ value: t.id, label: t.title }))}
                value={taskId}
                onChange={(v) => setTaskId(v || null)}
                placeholder={projectId ? "Task (opțional)" : "Alege întâi proiectul"}
                disabled={!projectId}
                allowClear
              />
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="La ce lucrezi?"
                className="sm:col-span-2 lg:col-span-1"
              />
            </div>
            <Button type="submit" variant="success" disabled={!projectId} loading={pending} className="lg:w-28">
              <Play className="fill-current" /> Start
            </Button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

function Stopwatch({ startedAt }: { startedAt: number }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const text = formatStopwatch((now - startedAt) / 1000);
  const original = React.useRef<string | null>(null);
  React.useEffect(() => {
    original.current = document.title;
    return () => {
      if (original.current) document.title = original.current;
    };
  }, []);
  React.useEffect(() => {
    document.title = `⏱ ${text} · Pontaj`;
  }, [text]);
  return (
    <div className="font-mono text-3xl font-semibold tracking-tight tabular" suppressHydrationWarning>
      {text}
    </div>
  );
}
