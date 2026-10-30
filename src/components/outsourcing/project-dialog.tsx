"use client";

import { Banknote, CalendarRange, Clock, Infinity as InfinityIcon, Repeat, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/misc";
import { useAction } from "@/hooks/use-action";
import { BILLING_TYPE_LABELS, CURRENCIES, PALETTE, PROJECT_STATUS } from "@/lib/constants";
import { todayIso } from "@/lib/format";
import type { ClientOption, MemberLite, ProjectFormData } from "@/lib/outsourcing/types";
import { cn } from "@/lib/utils";
import { saveProjectAction } from "@/app/(app)/proiecte/actions";
import { ColorPicker, DecimalInput, memberOptions } from "./shared";

const BILLING_ICONS: Record<string, React.ReactNode> = {
  time_materials: <Clock />,
  fixed: <Banknote />,
  retainer: <Repeat />,
  non_billable: <InfinityIcon />,
};

function emptyProject(): ProjectFormData {
  return {
    name: "",
    code: "",
    clientId: null,
    description: "",
    status: "active",
    billingType: "time_materials",
    hourlyRate: null,
    currency: "EUR",
    budgetHours: null,
    budgetAmount: null,
    monthlyRetainer: null,
    startDate: todayIso(),
    endDate: null,
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    managerId: null,
  };
}

export function ProjectDialog({
  project,
  clients,
  members,
  trigger,
  open: openProp,
  onOpenChange,
}: {
  project?: ProjectFormData | null;
  clients: ClientOption[];
  members: MemberLite[];
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const router = useRouter();
  const [inner, setInner] = React.useState(false);
  const open = openProp ?? inner;
  const setOpen = onOpenChange ?? setInner;
  const [form, setForm] = React.useState<ProjectFormData>(() => project ?? emptyProject());
  const [team, setTeam] = React.useState<string[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const { run, pending } = useAction();

  React.useEffect(() => {
    if (open) {
      setForm(project ?? emptyProject());
      setTeam([]);
      setErrors({});
    }
  }, [open, project]);

  const set = <K extends keyof ProjectFormData>(k: K, v: ProjectFormData[K]) => setForm((f) => ({ ...f, [k]: v }));
  const active = members.filter((m) => m.active);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(
      () =>
        saveProjectAction({
          ...form,
          status: form.status as never,
          billingType: form.billingType as never,
          memberIds: project?.id ? undefined : team,
        }),
      {
        onSuccess: ({ id }) => {
          setOpen(false);
          if (!project?.id) router.push(`/proiecte/${id}`);
        },
        onError: (_, fe) => setErrors(fe ?? {}),
      },
    );
  };

  const bt = form.billingType;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent size="lg">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <span className="size-3 rounded-full" style={{ background: form.color }} />
              {project?.id ? `Editează ${project.name}` : "Proiect nou"}
            </DialogTitle>
            <DialogDescription>Client, model de facturare, buget și echipă. Le poți schimba oricând.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
              <Field label="Nume proiect" required error={errors.name}>
                <Input autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="ex. Atlas — platformă tracking" />
              </Field>
              <Field label="Cod" hint="Scurt, ex. ATL">
                <Input value={form.code ?? ""} onChange={(e) => set("code", e.target.value.toUpperCase().slice(0, 8))} className="font-mono uppercase" placeholder="ATL" />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Client">
                <Combobox
                  options={clients.map((c) => ({ value: c.id, label: c.name }))}
                  value={form.clientId}
                  onChange={(v) => {
                    set("clientId", v || null);
                    const c = clients.find((x) => x.id === v);
                    if (c?.currency && !project?.id) set("currency", c.currency);
                  }}
                  placeholder="Intern / fără client"
                  allowClear
                />
              </Field>
              <Field label="Status">
                <NativeSelect value={form.status} onChange={(e) => set("status", e.target.value)}>
                  {Object.entries(PROJECT_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            <div className="space-y-2">
              <span className="text-[13px] font-medium">Model de facturare</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(BILLING_TYPE_LABELS).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => set("billingType", k)}
                    className={cn(
                      "relative flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left text-[13px] font-medium transition-all [&_svg]:size-4",
                      bt === k ? "border-primary/50 bg-primary-soft text-primary-soft-foreground" : "border-border hover:border-input hover:bg-muted/50",
                    )}
                  >
                    {BILLING_ICONS[k]}
                    <span className="leading-tight">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <AnimatePresence initial={false} mode="popLayout">
              {bt !== "non_billable" && (
                <motion.div
                  key="money"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="grid gap-4 overflow-hidden sm:grid-cols-3"
                >
                  <Field label="Monedă">
                    <NativeSelect value={form.currency} onChange={(e) => set("currency", e.target.value)}>
                      {CURRENCIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label="Tarif implicit / oră" hint="Folosit dacă membrul nu are tarif">
                    <DecimalInput value={form.hourlyRate} onChange={(v) => set("hourlyRate", v)} suffix={form.currency} />
                  </Field>
                  {bt === "retainer" ? (
                    <Field label="Retainer lunar" error={errors.monthlyRetainer}>
                      <DecimalInput value={form.monthlyRetainer} onChange={(v) => set("monthlyRetainer", v)} suffix={form.currency} />
                    </Field>
                  ) : bt === "fixed" ? (
                    <Field label="Valoare contract">
                      <DecimalInput value={form.budgetAmount} onChange={(v) => set("budgetAmount", v)} suffix={form.currency} />
                    </Field>
                  ) : (
                    <Field label="Buget ore">
                      <DecimalInput value={form.budgetHours} onChange={(v) => set("budgetHours", v)} suffix="h" />
                    </Field>
                  )}
                  {bt === "fixed" && (
                    <Field label="Buget ore (estimare)">
                      <DecimalInput value={form.budgetHours} onChange={(v) => set("budgetHours", v)} suffix="h" />
                    </Field>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Start">
                <Input type="date" value={form.startDate ?? ""} onChange={(e) => set("startDate", e.target.value || null)} />
              </Field>
              <Field label="Final estimat" error={errors.endDate}>
                <Input type="date" value={form.endDate ?? ""} onChange={(e) => set("endDate", e.target.value || null)} />
              </Field>
              <Field label="Manager proiect">
                <Combobox options={memberOptions(active)} value={form.managerId} onChange={(v) => set("managerId", v || null)} placeholder="Alege…" allowClear />
              </Field>
            </div>

            <Field label="Culoare">
              <ColorPicker value={form.color} onChange={(c) => set("color", c)} />
            </Field>

            {!project?.id && (
              <div className="space-y-2">
                <span className="flex items-center gap-1.5 text-[13px] font-medium">
                  <Users className="size-4 text-muted-foreground" /> Echipă inițială
                  {team.length > 0 && <span className="text-muted-foreground">· {team.length}</span>}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {active.map((m) => {
                    const on = team.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setTeam((t) => (on ? t.filter((x) => x !== m.id) : [...t, m.id]))}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-xs font-medium transition-all",
                          on ? "border-primary/40 bg-primary-soft text-primary-soft-foreground" : "border-border text-muted-foreground hover:border-input hover:text-foreground",
                        )}
                      >
                        <Avatar name={m.name} color={m.color} size="xs" className="ring-0" />
                        {m.name.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <Field label="Descriere">
              <Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Scop, livrabile, note pentru echipă…" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Renunță
            </Button>
            <Button type="submit" loading={pending}>
              <CalendarRange /> {project?.id ? "Salvează" : "Creează proiectul"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
