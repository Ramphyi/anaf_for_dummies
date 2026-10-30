"use client";

import { Trash2, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Avatar, Switch } from "@/components/ui/misc";
import { useAction } from "@/hooks/use-action";
import { CURRENCIES, DEPARTMENTS, EMPLOYMENT_TYPE_LABELS, PALETTE, SENIORITY_LABELS } from "@/lib/constants";
import type { MemberFormData } from "@/lib/outsourcing/types";
import { deleteMemberAction, saveMemberAction, type MemberInput } from "@/app/(app)/echipa/actions";
import { ColorPicker, DecimalInput } from "./shared";

function emptyMember(): MemberFormData {
  return {
    name: "",
    email: "",
    phone: "",
    position: "",
    department: "Engineering",
    seniority: "mid",
    employmentType: "cim",
    hourlyCost: 0,
    hourlyRate: 0,
    rateCurrency: "EUR",
    weeklyCapacity: 40,
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    skills: [],
    startDate: null,
    active: true,
  };
}

export function MemberDialog({
  member,
  trigger,
  open: openProp,
  onOpenChange,
  showMoney = true,
  redirectOnDelete,
}: {
  member?: MemberFormData | null;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  showMoney?: boolean;
  redirectOnDelete?: string;
}) {
  const router = useRouter();
  const [inner, setInner] = React.useState(false);
  const open = openProp ?? inner;
  const setOpen = onOpenChange ?? setInner;
  const [form, setForm] = React.useState<MemberFormData>(() => member ?? emptyMember());
  const [skill, setSkill] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [confirm, setConfirm] = React.useState(false);
  const { run, pending } = useAction();

  React.useEffect(() => {
    if (open) {
      setForm(member ?? emptyMember());
      setErrors({});
      setSkill("");
    }
  }, [open, member]);

  const set = <K extends keyof MemberFormData>(k: K, v: MemberFormData[K]) => setForm((f) => ({ ...f, [k]: v }));
  const addSkill = (raw: string) => {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setForm((f) => ({ ...f, skills: [...new Set([...f.skills, ...parts])] }));
    setSkill("");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: MemberInput = {
      ...form,
      seniority: form.seniority as MemberInput["seniority"],
      employmentType: form.employmentType as MemberInput["employmentType"],
      skills: skill.trim() ? [...new Set([...form.skills, skill.trim()])] : form.skills,
    };
    run(() => saveMemberAction(input), {
      onSuccess: ({ id }) => {
        setOpen(false);
        if (!member?.id) router.push(`/echipa/${id}`);
      },
      onError: (_, fe) => setErrors(fe ?? {}),
    });
  };

  const departments = [...new Set([...DEPARTMENTS, ...(form.department ? [form.department] : [])])];

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
        <DialogContent size="lg">
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <Avatar name={form.name || "?"} color={form.color} size="sm" />
                {member?.id ? `Editează ${member.name}` : "Membru nou"}
              </DialogTitle>
              <DialogDescription>Date de contact, rol, tarife și capacitate săptămânală.</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nume complet" required error={errors.name}>
                  <Input autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="ex. Ana Dumitrescu" />
                </Field>
                <Field label="Poziție">
                  <Input value={form.position ?? ""} onChange={(e) => set("position", e.target.value)} placeholder="ex. Senior Frontend Developer" />
                </Field>
                <Field label="Email" error={errors.email}>
                  <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder="nume@firma.ro" />
                </Field>
                <Field label="Telefon">
                  <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="07xx xxx xxx" />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Departament">
                  <Combobox
                    options={departments.map((d) => ({ value: d, label: d }))}
                    value={form.department}
                    onChange={(v) => set("department", v || null)}
                    onCreate={(q) => set("department", q)}
                    createLabel="Folosește"
                    placeholder="Alege…"
                  />
                </Field>
                <Field label="Senioritate">
                  <NativeSelect value={form.seniority} onChange={(e) => set("seniority", e.target.value)}>
                    {Object.entries(SENIORITY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Tip colaborare">
                  <NativeSelect value={form.employmentType} onChange={(e) => set("employmentType", e.target.value)}>
                    {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {showMoney && (
                  <>
                    <Field label="Tarif facturabil / oră" error={errors.hourlyRate}>
                      <div className="flex gap-2">
                        <DecimalInput value={form.hourlyRate} onChange={(v) => set("hourlyRate", v ?? 0)} />
                        <div className="w-24 shrink-0">
                          <NativeSelect value={form.rateCurrency} onChange={(e) => set("rateCurrency", e.target.value)}>
                            {CURRENCIES.map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </NativeSelect>
                        </div>
                      </div>
                    </Field>
                    <Field label="Cost intern / oră" hint="Salariu + taxe / oră" error={errors.hourlyCost}>
                      <DecimalInput value={form.hourlyCost} onChange={(v) => set("hourlyCost", v ?? 0)} suffix="RON" />
                    </Field>
                  </>
                )}
                <Field label="Capacitate săptămânală" error={errors.weeklyCapacity}>
                  <DecimalInput value={form.weeklyCapacity} onChange={(v) => set("weeklyCapacity", v ?? 0)} suffix="h" />
                </Field>
                <Field label="Data angajării">
                  <Input type="date" value={form.startDate ?? ""} onChange={(e) => set("startDate", e.target.value || null)} />
                </Field>
              </div>

              <Field label="Competențe" hint="Scrie și apasă Enter (sau virgulă)">
                <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-2 py-1.5 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
                  {form.skills.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1 rounded-md bg-primary-soft py-0.5 pr-1 pl-2 text-xs font-medium text-primary-soft-foreground">
                      {s}
                      <button
                        type="button"
                        aria-label={`Elimină ${s}`}
                        onClick={() => set("skills", form.skills.filter((x) => x !== s))}
                        className="rounded p-0.5 hover:bg-primary/15"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    value={skill}
                    onChange={(e) => {
                      if (e.target.value.endsWith(",")) addSkill(e.target.value);
                      else setSkill(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSkill(skill);
                      } else if (e.key === "Backspace" && !skill && form.skills.length) {
                        set("skills", form.skills.slice(0, -1));
                      }
                    }}
                    onBlur={() => addSkill(skill)}
                    placeholder={form.skills.length ? "" : "ex. React, Figma, Kubernetes"}
                    className="min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground/70"
                  />
                </div>
              </Field>

              <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto]">
                <Field label="Culoare">
                  <ColorPicker value={form.color} onChange={(c) => set("color", c)} />
                </Field>
                <label className="flex items-center gap-2.5 pb-1 text-[13px] font-medium">
                  <Switch checked={form.active} onCheckedChange={(v) => set("active", v)} />
                  Activ
                </label>
              </div>
            </DialogBody>
            <DialogFooter className="sm:justify-between">
              <div>
                {member?.id && (
                  <Button type="button" variant="destructive-soft" onClick={() => setConfirm(true)}>
                    <Trash2 /> Șterge
                  </Button>
                )}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Renunță
                </Button>
                <Button type="submit" loading={pending}>
                  <UserPlus /> {member?.id ? "Salvează" : "Adaugă membrul"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {member?.id && (
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          destructive
          title={`Ștergi pe ${member.name}?`}
          description="Dacă are pontaje sau cont de utilizator, va fi doar dezactivat (istoricul se păstrează)."
          confirmLabel="Șterge"
          onConfirm={() =>
            new Promise<void>((resolve) =>
              run(() => deleteMemberAction(member.id!), {
                success: (d) => (d.deactivated ? "Membrul a fost dezactivat" : "Membru șters"),
                onSuccess: (d) => {
                  resolve();
                  setOpen(false);
                  if (!d.deactivated && redirectOnDelete) router.push(redirectOnDelete);
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
