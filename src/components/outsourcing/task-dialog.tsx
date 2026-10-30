"use client";

import { Clock, Trash2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { TASK_PRIORITY, TASK_STATUS } from "@/lib/constants";
import { formatHours } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteTaskAction, saveTaskAction, type TaskInput } from "@/app/(app)/proiecte/actions";
import type { KanbanTask, ProjectMemberRow } from "./project-detail";
import { DecimalInput, memberOptions } from "./shared";

type Form = {
  title: string;
  description: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  estimateHours: number | null;
  dueDate: string;
};

const PRIORITY_STYLE: Record<string, string> = {
  low: "data-[on=true]:bg-muted data-[on=true]:text-foreground",
  medium: "data-[on=true]:bg-info-soft data-[on=true]:text-info-soft-foreground",
  high: "data-[on=true]:bg-warning-soft data-[on=true]:text-warning-soft-foreground",
  urgent: "data-[on=true]:bg-danger-soft data-[on=true]:text-danger-soft-foreground",
};

export function TaskDialog({
  open,
  onOpenChange,
  task,
  defaultStatus = "todo",
  projectId,
  members,
  readOnly,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  task: KanbanTask | null;
  defaultStatus?: string;
  projectId: string;
  members: ProjectMemberRow[];
  readOnly?: boolean;
}) {
  const [form, setForm] = React.useState<Form>(() => toForm(task, defaultStatus));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [confirm, setConfirm] = React.useState(false);
  const { run, pending } = useAction();

  React.useEffect(() => {
    if (open) {
      setForm(toForm(task, defaultStatus));
      setErrors({});
    }
  }, [open, task, defaultStatus]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const input: TaskInput = {
      id: task?.id ?? null,
      projectId,
      title: form.title,
      description: form.description,
      status: form.status as TaskInput["status"],
      priority: form.priority as TaskInput["priority"],
      assigneeId: form.assigneeId,
      estimateHours: form.estimateHours,
      dueDate: form.dueDate || null,
    };
    run(() => saveTaskAction(input), { onSuccess: () => onOpenChange(false), onError: (_, fe) => setErrors(fe ?? {}) });
  };

  const assignable = members.filter((m) => m.active || m.memberId === form.assigneeId);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="lg">
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <DialogHeader>
              <DialogTitle>{task ? (readOnly ? task.title : "Editează task-ul") : "Task nou"}</DialogTitle>
              <DialogDescription>
                {task ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="size-3.5" /> {formatHours(task.loggedHours)} pontate
                    {task.estimateHours ? ` din ${formatHours(task.estimateHours)} estimate` : ""}
                  </span>
                ) : (
                  "Descrie munca, alege responsabilul și estimarea."
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <fieldset disabled={readOnly} className="space-y-4">
                <Field label="Titlu" required error={errors.title}>
                  <Input autoFocus={!task} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="ex. Integrare procesator plăți" />
                </Field>
                <Field label="Descriere">
                  <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={4} placeholder="Context, criterii de acceptanță, link-uri…" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Status">
                    <NativeSelect value={form.status} onChange={(e) => set("status", e.target.value)}>
                      {Object.entries(TASK_STATUS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label="Responsabil">
                    <Combobox
                      options={memberOptions(assignable.map((m) => ({ id: m.memberId, name: m.name, color: m.color, position: m.role ?? m.position })))}
                      value={form.assigneeId}
                      onChange={(v) => set("assigneeId", v || null)}
                      placeholder="Neatribuit"
                      allowClear
                      disabled={readOnly}
                    />
                  </Field>
                </div>
                <Field label="Prioritate">
                  <div className="grid grid-cols-4 gap-1.5 rounded-xl border border-border bg-muted/50 p-1">
                    {Object.entries(TASK_PRIORITY).map(([k, v]) => (
                      <button
                        key={k}
                        type="button"
                        data-on={form.priority === k}
                        onClick={() => set("priority", k)}
                        className={cn(
                          "h-8 rounded-lg text-[13px] font-medium text-muted-foreground transition-all hover:text-foreground data-[on=true]:shadow-soft",
                          PRIORITY_STYLE[k],
                        )}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Estimare" error={errors.estimateHours}>
                    <DecimalInput value={form.estimateHours} onChange={(v) => set("estimateHours", v)} suffix="ore" placeholder="ex. 8" />
                  </Field>
                  <Field label="Termen">
                    <Input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
                  </Field>
                </div>
              </fieldset>
            </DialogBody>
            <DialogFooter className="sm:justify-between">
              <div>
                {task && !readOnly && (
                  <Button type="button" variant="destructive-soft" onClick={() => setConfirm(true)}>
                    <Trash2 /> Șterge
                  </Button>
                )}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  {readOnly ? "Închide" : "Renunță"}
                </Button>
                {!readOnly && (
                  <Button type="submit" loading={pending}>
                    {task ? "Salvează" : "Creează task-ul"}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {task && (
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          destructive
          title="Ștergi task-ul?"
          description="Orele pontate pe acest task rămân pe proiect, fără task asociat."
          confirmLabel="Șterge"
          onConfirm={() =>
            new Promise<void>((resolve) =>
              run(() => deleteTaskAction(task.id), {
                onSuccess: () => {
                  resolve();
                  onOpenChange(false);
                },
                onError: () => resolve(),
              }),
            )
          }
        />
      )}
    </>
  );
}

function toForm(task: KanbanTask | null, status: string): Form {
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? status,
    priority: task?.priority ?? "medium",
    assigneeId: task?.assigneeId ?? null,
    estimateHours: task?.estimateHours ?? null,
    dueDate: task?.dueDate ?? "",
  };
}
