"use client";

import { ArrowRightLeft, BadgeCheck, Building2, Check, Loader2, PenLine, Plus, Search, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { switchCompanyAction } from "@/app/(app)/shell-actions";
import { createCompanyAction, lookupNewCompanyAction, type NewCompanyFormInput } from "@/app/(app)/setari/firme-noi/actions";
import { Stagger, StaggerItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeaderRow } from "@/components/ui/card";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { useAction } from "@/hooks/use-action";
import { COUNTIES, ROLE_LABELS } from "@/lib/constants";
import { cn, isValidCui, isValidIban } from "@/lib/utils";

type CompanyItem = { id: string; name: string; cui: string; role: string; current: boolean };

const emptyForm = (): Required<{ [K in keyof NewCompanyFormInput]: NonNullable<NewCompanyFormInput[K]> }> => ({
  name: "",
  cui: "",
  regCom: "",
  vatPayer: true,
  vatOnCollection: false,
  address: "",
  city: "",
  county: "",
  postalCode: "",
  email: "",
  phone: "",
  iban: "",
  bank: "",
});

export function NewCompany({ companies }: { companies: CompanyItem[] }) {
  const router = useRouter();
  const [form, setForm] = React.useState(emptyForm);
  const [step, setStep] = React.useState<"cui" | "details">("cui");
  const [found, setFound] = React.useState<{ inactive: boolean; eInvoiceRegistered: boolean } | null>(null);
  const [looking, startLooking] = React.useTransition();
  const [switching, startSwitch] = React.useTransition();
  const [switchingId, setSwitchingId] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const { run, pending } = useAction();
  const set = <K extends keyof ReturnType<typeof emptyForm>>(k: K, v: ReturnType<typeof emptyForm>[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };
  const cuiOk = isValidCui(form.cui);
  const already = companies.find((c) => c.cui.replace(/\D/g, "") === form.cui.replace(/\D/g, "") && cuiOk);

  const lookup = () =>
    startLooking(async () => {
      const r = await lookupNewCompanyAction(form.cui);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const d = r.data;
      setForm((f) => ({
        ...f,
        name: d.name,
        cui: d.cui,
        regCom: d.regCom ?? "",
        vatPayer: d.vatPayer,
        vatOnCollection: d.vatOnCollection,
        address: d.street ?? d.address ?? "",
        city: d.city ?? "",
        county: d.county ?? "",
        postalCode: d.postalCode ?? "",
        phone: d.phone ?? "",
        iban: d.iban ?? "",
      }));
      setFound({ inactive: d.inactive, eInvoiceRegistered: d.eInvoiceRegistered });
      setStep("details");
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => createCompanyAction(form), {
      success: (d) => `Firma ${d.name} a fost creată — bun venit!`,
      onSuccess: () => {
        router.replace("/dashboard");
        router.refresh();
      },
      onError: (_, fe) => fe && setErrors(fe),
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <form onSubmit={submit}>
        <Card className="overflow-hidden">
          <CardHeaderRow
            title="Adaugă o firmă"
            description="Introdu CUI-ul — preluăm denumirea, adresa și statusul TVA din registrul ANAF. Vei fi proprietarul noii firme."
            icon={<Plus />}
          />
          <CardContent className="space-y-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <Field label="CUI / CIF" className="flex-1" error={form.cui && !cuiOk ? "CUI invalid (cifra de control)" : undefined}>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={form.cui}
                    onChange={(e) => {
                      set("cui", e.target.value);
                      setFound(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && step === "cui") {
                        e.preventDefault();
                        if (cuiOk) lookup();
                      }
                    }}
                    className="pl-9 font-mono"
                    placeholder="ex. RO43182658"
                    autoFocus
                    aria-invalid={!!form.cui && !cuiOk}
                  />
                </div>
              </Field>
              <Button type="button" variant={step === "cui" ? "default" : "soft"} onClick={lookup} disabled={!cuiOk || looking} className="sm:mt-[25px]">
                {looking ? <Loader2 className="animate-spin" /> : <Sparkles />} Caută la ANAF
              </Button>
            </div>

            {already && (
              <p className="rounded-lg bg-info-soft px-3 py-2 text-sm text-info-soft-foreground">
                Ai deja acces la <strong>{already.name}</strong> — o găsești în lista din dreapta.
              </p>
            )}

            {step === "cui" && (
              <button type="button" onClick={() => setStep("details")} className="inline-flex items-start gap-1.5 text-left text-sm text-muted-foreground hover:text-foreground">
                <PenLine className="mt-0.5 size-3.5 shrink-0" /> Completează manual (firmă nouă, încă neînregistrată la ANAF)
              </button>
            )}

            <AnimatePresence initial={false}>
              {step === "details" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="space-y-4 pt-1">
                    {found && (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-success/25 bg-success-soft px-3 py-2 text-sm text-success-soft-foreground">
                        <BadgeCheck className="size-4" /> Date preluate din registrul ANAF
                        {found.inactive && <Badge tone="danger">Contribuabil inactiv</Badge>}
                        {found.eInvoiceRegistered && <Badge tone="success">RO e-Factura</Badge>}
                      </div>
                    )}
                    <div className="grid items-start gap-4 sm:grid-cols-2">
                      <Field label="Denumire" required error={errors.name} className="sm:col-span-2">
                        <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Firma Mea SRL" aria-invalid={!!errors.name} />
                      </Field>
                      <Field label="Nr. Reg. Com." error={errors.regCom}>
                        <Input value={form.regCom} onChange={(e) => set("regCom", e.target.value)} placeholder="J12/1234/2024" />
                      </Field>
                      <Field label="Email facturare" error={errors.email}>
                        <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="Implicit: emailul tău" />
                      </Field>
                      <Field label="Adresă" error={errors.address} className="sm:col-span-2">
                        <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
                      </Field>
                      <Field label="Localitate" error={errors.city}>
                        <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
                      </Field>
                      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
                        <Field label="Județ">
                          <NativeSelect value={form.county} onChange={(e) => set("county", e.target.value)}>
                            <option value="">—</option>
                            {COUNTIES.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.name}
                              </option>
                            ))}
                          </NativeSelect>
                        </Field>
                        <Field label="Cod poștal">
                          <Input value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} maxLength={6} />
                        </Field>
                      </div>
                      <Field label="IBAN" error={errors.iban ?? (form.iban && !isValidIban(form.iban) ? "IBAN invalid" : undefined)}>
                        <Input value={form.iban} onChange={(e) => set("iban", e.target.value.toUpperCase())} className="font-mono text-[13px]" />
                      </Field>
                      <Field label="Banca">
                        <Input value={form.bank} onChange={(e) => set("bank", e.target.value)} />
                      </Field>
                      <Field label="Telefon">
                        <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                      </Field>
                      <div className="flex flex-col justify-end gap-3 pb-1">
                        <label className="flex cursor-pointer items-center gap-3 text-sm">
                          <Switch checked={form.vatPayer} onCheckedChange={(v) => set("vatPayer", v)} /> Plătitor de TVA
                        </label>
                        <label className={cn("flex cursor-pointer items-center gap-3 text-sm", !form.vatPayer && "opacity-50")}>
                          <Switch checked={form.vatOnCollection} onCheckedChange={(v) => set("vatOnCollection", v)} disabled={!form.vatPayer} /> TVA la încasare
                        </label>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
          {step === "details" && (
            <CardFooter className="justify-between">
              <span className="hidden text-xs text-muted-foreground sm:block">Primești automat serii de documente, o gestiune și conexiunea ANAF în modul simulare.</span>
              <Button type="submit" loading={pending} disabled={!cuiOk || form.name.trim().length < 2 || !!already}>
                <Building2 /> Creează firma
              </Button>
            </CardFooter>
          )}
        </Card>
      </form>

      <Card className="h-fit">
        <CardHeaderRow title="Firmele tale" description={`${companies.length} ${companies.length === 1 ? "firmă" : "firme"} în contul tău`} icon={<ArrowRightLeft />} />
        <Stagger className="space-y-2 px-5 pb-5">
          {companies.map((c) => (
            <StaggerItem key={c.id}>
              <div className={cn("flex items-center gap-3 rounded-xl border p-3 transition-colors", c.current ? "border-primary/40 bg-primary-soft/40" : "border-border")}>
                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-sm font-semibold">{c.name.slice(0, 1).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    CUI {c.cui} · {ROLE_LABELS[c.role] ?? c.role}
                  </div>
                </div>
                {c.current ? (
                  <Badge tone="brand">
                    <Check className="size-3" /> Activă
                  </Badge>
                ) : (
                  <Button
                    size="xs"
                    variant="outline"
                    loading={switching && switchingId === c.id}
                    disabled={switching}
                    onClick={() => {
                      setSwitchingId(c.id);
                      startSwitch(() => switchCompanyAction(c.id));
                    }}
                  >
                    Comută
                  </Button>
                )}
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </Card>
    </div>
  );
}
