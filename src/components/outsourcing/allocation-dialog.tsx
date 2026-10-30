"use client";

import { AlertTriangle, CalendarRange, Trash2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { formatHours } from "@/lib/format";
import { eachDayIso, isWorkingDay, rangeLabel } from "@/lib/outsourcing/dates";
import { dailyCapacity } from "@/lib/outsourcing/metrics";
import type { AllocationRow, MemberLite, ProjectLite, TimeOffRow } from "@/lib/outsourcing/types";
import { cn } from "@/lib/utils";
import { deleteAllocationAction, saveAllocationAction } from "@/app/(app)/planificare/actions";
import { DecimalInput, memberOptions, projectOptions } from "./shared";

export type AllocationDraft = Partial<AllocationRow> & { startDate: string; endDate: string };

export function AllocationDialog({
  open,
  onOpenChange,
  draft,
  members,
  projects,
  allocations,
  timeOff,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  draft: AllocationDraft | null;
  members: MemberLite[];
  projects: ProjectLite[];
  allocations: AllocationRow[];
  timeOff: TimeOffRow[];
  onSaved?: (a: AllocationRow) => void;
  onDeleted?: (id: string) => void;
}) {
  const [form, setForm] = React.useState<AllocationDraft>({ startDate: "", endDate: "", hoursPerDay: 8 });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [confirm, setConfirm] = React.useState(false);
  const { run, pending } = useAction();

  React.useEffect(() => {
    if (open && draft) {
      setForm({ hoursPerDay: 8, notes: "", ...draft });
      setErrors({});
    }
  }, [open, draft]);

  const set = <K extends keyof AllocationDraft>(k: K, v: AllocationDraft[K]) => setForm((f) => ({ ...f, [k]: v }));
  const member = members.find((m) => m.id === form.memberId);
  const valid = form.startDate && form.endDate && form.endDate >= form.startDate;

  // impact: zile lucrătoare, total ore, suprapuneri
  const analysis = React.useMemo(() => {
    if (!valid || !member) return null;
    const off = new Set<string>();
    for (const t of timeOff) if (t.memberId === member.id && t.status === "approved") for (const d of eachDayIso(t.startDate, t.endDate)) off.add(d);
    const days = eachDayIso(form.startDate, form.endDate).filter((d) => isWorkingDay(d));
    const workDays = days.filter((d) => !off.has(d));
    const others = allocations.filter((a) => a.memberId === member.id && a.id !== form.id && a.startDate <= form.endDate && a.endDate >= form.startDate);
    const cap = dailyCapacity(member.weeklyCapacity);
    let peak = 0;
    let overDays = 0;
    for (const d of workDays) {
      const load = others.filter((a) => a.startDate <= d && a.endDate >= d).reduce((s, a) => s + a.hoursPerDay, 0) + (form.hoursPerDay ?? 0);
      peak = Math.max(peak, load);
      if (load > cap + 0.01) overDays++;
    }
    return { workDays: workDays.length, offDays: days.length - workDays.length, total: workDays.length * (form.hoursPerDay ?? 0), peak, overDays, cap };
  }, [valid, member, timeOff, allocations, form.startDate, form.endDate, form.id, form.hoursPerDay]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(
      () =>
        saveAllocationAction({
          id: form.id ?? null,
          memberId: form.memberId ?? "",
          projectId: form.projectId ?? "",
          startDate: form.startDate,
          endDate: form.endDate,
          hoursPerDay: form.hoursPerDay ?? 0,
          notes: form.notes ?? null,
        }),
      {
        onSuccess: (a) => {
          onSaved?.({ id: a.id, memberId: a.memberId, projectId: a.projectId, startDate: a.startDate, endDate: a.endDate, hoursPerDay: a.hoursPerDay, notes: a.notes });
          onOpenChange(false);
        },
        onError: (_, fe) => setErrors(fe ?? {}),
      },
    );
  };

  const project = projects.find((p) => p.id === form.projectId);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="md">
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5">
                {project && <span className="size-3 rounded-full" style={{ background: project.color }} />}
                {form.id ? "Editează alocarea" : "Alocare nouă"}
              </DialogTitle>
              <DialogDescription>{valid ? rangeLabel(form.startDate, form.endDate) : "Cine, pe ce proiect, în ce perioadă și câte ore pe zi."}</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Membru" required error={errors.memberId}>
                  <Combobox options={memberOptions(members)} value={form.memberId} onChange={(v) => set("memberId", v)} placeholder="Alege…" />
                </Field>
                <Field label="Proiect" required error={errors.projectId}>
                  <Combobox options={projectOptions(projects)} value={form.projectId} onChange={(v) => set("projectId", v)} placeholder="Alege…" />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="De la" required error={errors.startDate}>
                  <Input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
                </Field>
                <Field label="Până la" required error={errors.endDate}>
                  <Input type="date" value={form.endDate} min={form.startDate} onChange={(e) => set("endDate", e.target.value)} />
                </Field>
              </div>
              <Field label="Ore pe zi" error={errors.hoursPerDay}>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {[2, 4, 6, 8].map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => set("hoursPerDay", h)}
                        className={cn(
                          "h-9 w-11 rounded-lg border text-sm font-medium tabular transition-all",
                          form.hoursPerDay === h ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border text-muted-foreground hover:border-input hover:text-foreground",
                        )}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                  <div className="w-28">
                    <DecimalInput value={form.hoursPerDay ?? null} onChange={(v) => set("hoursPerDay", v ?? 0)} suffix="h/zi" />
                  </div>
                </div>
              </Field>
              {analysis && (
                <div
                  className={cn(
                    "rounded-xl border p-3 text-[13px]",
                    analysis.overDays ? "border-warning/30 bg-warning-soft text-warning-soft-foreground" : "border-border bg-subtle",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>
                      <strong className="tabular">{analysis.workDays}</strong> zile lucrătoare
                    </span>
                    <span>
                      <strong className="tabular">{formatHours(analysis.total)}</strong> în total
                    </span>
                    {analysis.offDays > 0 && <span className="text-muted-foreground">{analysis.offDays} zile de concediu excluse</span>}
                  </div>
                  {analysis.overDays > 0 && (
                    <p className="mt-1.5 flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      {member?.name.split(" ")[0]} ar ajunge la {formatHours(analysis.peak)}/zi în {analysis.overDays} zile (capacitate {formatHours(analysis.cap)}/zi).
                    </p>
                  )}
                </div>
              )}
              <Field label="Note">
                <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="ex. Sprint 14 — modul plăți" />
              </Field>
            </DialogBody>
            <DialogFooter className="sm:justify-between">
              <div>
                {form.id && (
                  <Button type="button" variant="destructive-soft" onClick={() => setConfirm(true)}>
                    <Trash2 /> Șterge
                  </Button>
                )}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Renunță
                </Button>
                <Button type="submit" loading={pending}>
                  <CalendarRange /> {form.id ? "Salvează" : "Alocă"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        destructive
        title="Ștergi alocarea?"
        description="Orele deja pontate nu sunt afectate."
        confirmLabel="Șterge"
        onConfirm={() =>
          new Promise<void>((resolve) =>
            run(() => deleteAllocationAction(form.id!), {
              onSuccess: () => {
                onDeleted?.(form.id!);
                resolve();
                onOpenChange(false);
              },
              onError: () => resolve(),
            }),
          )
        }
      />
    </>
  );
}
