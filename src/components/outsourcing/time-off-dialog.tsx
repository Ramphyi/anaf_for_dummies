"use client";

import { Check, Trash2, X } from "lucide-react";
import * as React from "react";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/misc";
import { useAction } from "@/hooks/use-action";
import { TIME_OFF_TYPE } from "@/lib/constants";
import { eachDayIso, holidayName, isWeekendIso, rangeLabel, workingDaysCount } from "@/lib/outsourcing/dates";
import type { MemberLite, TimeOffRow } from "@/lib/outsourcing/types";
import { cn } from "@/lib/utils";
import { decideTimeOffAction, deleteTimeOffAction, saveTimeOffAction } from "@/app/(app)/concedii/actions";
import { memberOptions } from "./shared";

export const TIME_OFF_STATUS = {
  pending: { label: "În așteptare", tone: "warning" as const },
  approved: { label: "Aprobat", tone: "success" as const },
  rejected: { label: "Respins", tone: "danger" as const },
};

export type TimeOffDraft = Partial<TimeOffRow> & { startDate: string; endDate: string };

export function TimeOffDialog({
  open,
  onOpenChange,
  draft,
  members,
  meId,
  canApprove,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  draft: TimeOffDraft | null;
  members: MemberLite[];
  meId: string | null;
  canApprove: boolean;
}) {
  const [form, setForm] = React.useState<TimeOffDraft>({ startDate: "", endDate: "", type: "vacation" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [confirm, setConfirm] = React.useState(false);
  const { run, pending } = useAction();

  React.useEffect(() => {
    if (open && draft) {
      setForm({ type: "vacation", memberId: canApprove ? undefined : (meId ?? undefined), notes: "", ...draft });
      setErrors({});
    }
  }, [open, draft, canApprove, meId]);

  const set = <K extends keyof TimeOffDraft>(k: K, v: TimeOffDraft[K]) => setForm((f) => ({ ...f, [k]: v }));
  const existing = !!form.id;
  const own = form.memberId === meId;
  const editable = !existing || canApprove || (own && form.status === "pending");
  const member = members.find((m) => m.id === form.memberId);
  const valid = form.startDate && form.endDate && form.endDate >= form.startDate;
  const workDays = valid ? workingDaysCount(form.startDate, form.endDate) : 0;
  const holidays = valid ? eachDayIso(form.startDate, form.endDate).filter((d) => holidayName(d) && !isWeekendIso(d)) : [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editable) return;
    run(
      () =>
        saveTimeOffAction({
          id: form.id ?? null,
          memberId: form.memberId ?? "",
          type: (form.type ?? "vacation") as never,
          startDate: form.startDate,
          endDate: form.endDate,
          notes: form.notes ?? null,
        }),
      { onSuccess: () => onOpenChange(false), onError: (_, fe) => setErrors(fe ?? {}) },
    );
  };

  const decide = (status: "approved" | "rejected" | "pending") => run(() => decideTimeOffAction(form.id!, status), { onSuccess: () => onOpenChange(false) });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="md">
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5">
                {existing ? "Cerere de concediu" : "Cerere nouă"}
                {existing && form.status && <StatusBadge status={form.status} map={TIME_OFF_STATUS} />}
              </DialogTitle>
              <DialogDescription>
                {valid ? `${rangeLabel(form.startDate, form.endDate)} · ${workDays} ${workDays === 1 ? "zi lucrătoare" : "zile lucrătoare"}` : "Alege perioada și tipul concediului."}
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <fieldset disabled={!editable} className="space-y-4">
                <Field label="Persoană" required error={errors.memberId}>
                  {canApprove ? (
                    <Combobox options={memberOptions(members)} value={form.memberId} onChange={(v) => set("memberId", v)} placeholder="Alege colegul…" disabled={!editable} />
                  ) : (
                    <div className="flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-sm">
                      {member && <Avatar name={member.name} color={member.color} size="xs" className="ring-0" />}
                      {member?.name ?? "Tu"}
                    </div>
                  )}
                </Field>
                <Field label="Tip">
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {Object.entries(TIME_OFF_TYPE).map(([k, t]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => set("type", k)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[12.5px] font-medium transition-all",
                          form.type === k ? "border-transparent shadow-soft ring-2" : "border-border text-muted-foreground hover:text-foreground",
                        )}
                        style={form.type === k ? { background: `color-mix(in oklab, ${t.color} 14%, var(--card))`, ["--tw-ring-color" as string]: t.color } : undefined}
                      >
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
                        {t.label}
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="De la" required error={errors.startDate}>
                    <Input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm((f) => ({ ...f, startDate: v, endDate: f.endDate && f.endDate >= v ? f.endDate : v }));
                      }}
                    />
                  </Field>
                  <Field label="Până la (inclusiv)" required error={errors.endDate}>
                    <Input type="date" value={form.endDate} min={form.startDate} onChange={(e) => set("endDate", e.target.value)} />
                  </Field>
                </div>
                {holidays.length > 0 && (
                  <p className="rounded-lg bg-primary-soft px-3 py-2 text-xs text-primary-soft-foreground">
                    Include {holidays.length === 1 ? "sărbătoarea legală" : "sărbătorile legale"}: {holidays.map((d) => holidayName(d)).join(", ")} — nu se scad din zilele de concediu.
                  </p>
                )}
                <Field label="Note">
                  <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Opțional — ex. înlocuitor, motiv" />
                </Field>
              </fieldset>
              {!existing && canApprove && <p className="text-xs text-muted-foreground">Cererile înregistrate de un manager sunt aprobate automat.</p>}
            </DialogBody>
            <DialogFooter className="sm:justify-between">
              <div className="flex gap-2">
                {existing && (canApprove || (own && form.status === "pending")) && (
                  <Button type="button" variant="destructive-soft" onClick={() => setConfirm(true)}>
                    <Trash2 /> {canApprove ? "Șterge" : "Anulează cererea"}
                  </Button>
                )}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                {existing && canApprove && form.status !== "rejected" && (
                  <Button type="button" variant="outline" className="hover:text-danger" onClick={() => decide("rejected")} disabled={pending}>
                    <X /> Respinge
                  </Button>
                )}
                {existing && canApprove && form.status !== "approved" && (
                  <Button type="button" variant="success" onClick={() => decide("approved")} loading={pending}>
                    <Check /> Aprobă
                  </Button>
                )}
                {editable ? (
                  <Button type="submit" loading={pending} variant={existing ? "outline" : "default"}>
                    {existing ? "Salvează" : canApprove ? "Înregistrează" : "Trimite cererea"}
                  </Button>
                ) : (
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Închide
                  </Button>
                )}
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {existing && (
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          destructive
          title="Ștergi cererea de concediu?"
          confirmLabel="Șterge"
          onConfirm={() =>
            new Promise<void>((resolve) =>
              run(() => deleteTimeOffAction(form.id!), {
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
