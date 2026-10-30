"use client";

import { AlertTriangle, BadgeCheck, Building2, Loader2, Search, User } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { COUNTIES, CURRENCIES } from "@/lib/constants";
import type { Partner } from "@/lib/db/schema";
import { lookupPartnerCuiAction, savePartnerAction, type PartnerInput } from "@/lib/partners/actions";

const COUNTRIES = [
  ["RO", "România"],
  ["DE", "Germania"],
  ["NL", "Olanda"],
  ["FR", "Franța"],
  ["IT", "Italia"],
  ["ES", "Spania"],
  ["AT", "Austria"],
  ["BE", "Belgia"],
  ["BG", "Bulgaria"],
  ["HU", "Ungaria"],
  ["PL", "Polonia"],
  ["MD", "Republica Moldova"],
  ["GB", "Marea Britanie"],
  ["US", "SUA"],
  ["CH", "Elveția"],
] as const;

type Kind = "client" | "supplier" | "both";

function emptyPartner(kind: Kind): PartnerInput {
  return { kind, entityType: "pj", name: "", cui: "", regCom: "", vatPayer: true, address: "", city: "", county: "", country: "RO", email: "", phone: "", iban: "", bank: "", contactPerson: "", paymentTermDays: null, notes: "" };
}

/**
 * Dialog reutilizabil pentru adăugarea/editarea unui client sau furnizor,
 * cu preluare automată a datelor de la ANAF după CUI.
 *   <PartnerDialog kind="client" trigger={<Button>Client nou</Button>} onSaved={(p) => ...} />
 */
export function PartnerDialog({
  kind = "client",
  partner,
  trigger,
  open: openProp,
  onOpenChange,
  onSaved,
  defaultName,
}: {
  kind?: Kind;
  partner?: Partner | null;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  onSaved?: (p: Partner) => void;
  defaultName?: string;
}) {
  const [inner, setInner] = React.useState(false);
  const open = openProp ?? inner;
  const setOpen = onOpenChange ?? setInner;
  const [form, setForm] = React.useState<PartnerInput>(() => (partner ? { ...partner } : { ...emptyPartner(kind), name: defaultName ?? "" }));
  const [lookup, setLookup] = React.useState<{ inactive: boolean; vatOnCollection: boolean; eInvoiceRegistered: boolean; splitVat: boolean } | null>(null);
  const [looking, startLooking] = React.useTransition();
  const { run, pending } = useAction();

  React.useEffect(() => {
    if (open) {
      setForm(partner ? { ...partner } : { ...emptyPartner(kind), name: defaultName ?? "" });
      setLookup(null);
    }
  }, [open, partner, kind, defaultName]);

  const set = <K extends keyof PartnerInput>(k: K, v: PartnerInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const isRo = (form.country ?? "RO") === "RO";

  const doLookup = () =>
    startLooking(async () => {
      const r = await lookupPartnerCuiAction(String(form.cui ?? ""));
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const d = r.data;
      setForm((f) => ({
        ...f,
        name: d.name,
        cui: d.cui,
        regCom: d.regCom ?? f.regCom,
        vatPayer: d.vatPayer,
        address: d.street ?? d.address ?? f.address,
        city: d.city ?? f.city,
        county: d.county ?? f.county,
        postalCode: d.postalCode ?? f.postalCode,
        phone: f.phone || d.phone || "",
        iban: f.iban || d.iban || "",
        eInvoiceRegistered: d.eInvoiceRegistered,
      }));
      setLookup({ inactive: d.inactive, vatOnCollection: d.vatOnCollection, eInvoiceRegistered: d.eInvoiceRegistered, splitVat: d.splitVat });
      toast.success("Date preluate din registrul ANAF");
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => savePartnerAction(form), {
      onSuccess: (p) => {
        setOpen(false);
        onSaved?.(p);
      },
    });
  };

  const title = partner ? `Editează ${partner.name}` : kind === "supplier" ? "Furnizor nou" : "Client nou";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent size="lg">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Introdu CUI-ul și preia automat denumirea, adresa și statusul TVA de la ANAF.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <Segmented
                value={form.entityType ?? "pj"}
                onChange={(v) => set("entityType", v)}
                options={[
                  { value: "pj", label: "Persoană juridică", icon: <Building2 /> },
                  { value: "pf", label: "Persoană fizică", icon: <User /> },
                ]}
              />
              {!partner && kind !== "both" && (
                <NativeSelect value={form.kind} onChange={(e) => set("kind", e.target.value as Kind)} className="h-9 w-40">
                  <option value="client">Client</option>
                  <option value="supplier">Furnizor</option>
                  <option value="both">Client și furnizor</option>
                </NativeSelect>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_1.4fr]">
              <Field label="Țară">
                <NativeSelect value={form.country ?? "RO"} onChange={(e) => set("country", e.target.value)}>
                  {COUNTRIES.map(([c, n]) => (
                    <option key={c} value={c}>
                      {n}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field
                label={form.entityType === "pf" ? "CNP (opțional)" : isRo ? "CUI / CIF" : "Cod TVA (VAT ID)"}
                hint={form.entityType === "pf" ? "Fără CNP, în e-Factura se trimite 0000000000000" : undefined}
              >
                <div className="flex gap-2">
                  <Input value={form.cui ?? ""} onChange={(e) => set("cui", e.target.value)} placeholder={isRo ? "RO12345678" : "DE123456789"} />
                  {isRo && form.entityType === "pj" && (
                    <Button type="button" variant="soft" onClick={doLookup} disabled={!form.cui || looking}>
                      {looking ? <Loader2 className="animate-spin" /> : <Search />} ANAF
                    </Button>
                  )}
                </div>
              </Field>
            </div>

            <AnimatePresence>
              {lookup && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-subtle p-3">
                    <BadgeCheck className="size-4 text-success" />
                    <span className="text-sm font-medium">Verificat ANAF</span>
                    <Badge tone={form.vatPayer ? "success" : "neutral"}>{form.vatPayer ? "Plătitor TVA" : "Neplătitor TVA"}</Badge>
                    {lookup.vatOnCollection && <Badge tone="warning">TVA la încasare</Badge>}
                    {lookup.splitVat && <Badge tone="warning">Split TVA</Badge>}
                    <Badge tone={lookup.eInvoiceRegistered ? "brand" : "neutral"}>{lookup.eInvoiceRegistered ? "Înregistrat RO e-Factura" : "Neînregistrat RO e-Factura"}</Badge>
                    {lookup.inactive && (
                      <Badge tone="danger">
                        <AlertTriangle className="size-3" /> Contribuabil INACTIV
                      </Badge>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <Field label={form.entityType === "pf" ? "Nume și prenume" : "Denumire"} required>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} required autoFocus={!partner} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              {form.entityType === "pj" && (
                <Field label="Nr. Reg. Comerțului">
                  <Input value={form.regCom ?? ""} onChange={(e) => set("regCom", e.target.value)} placeholder="J40/1234/2020" />
                </Field>
              )}
              <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm sm:self-end">
                <span>Plătitor de TVA</span>
                <Switch checked={!!form.vatPayer} onCheckedChange={(v) => set("vatPayer", v)} />
              </label>
            </div>

            <Field label="Adresă (stradă, număr)">
              <Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} placeholder="Str. Exemplu nr. 10, bl. A, ap. 3" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Localitate" hint={isRo && form.county === "B" ? "Pentru București: Sector 1–6" : undefined}>
                <Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />
              </Field>
              {isRo && (
                <Field label="Județ">
                  <NativeSelect value={form.county ?? ""} onChange={(e) => set("county", e.target.value)}>
                    <option value="">—</option>
                    {COUNTIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              )}
              <Field label="Cod poștal">
                <Input value={form.postalCode ?? ""} onChange={(e) => set("postalCode", e.target.value)} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email (pentru trimiterea facturilor)">
                <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
              </Field>
              <Field label="Telefon">
                <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label="Persoană de contact">
                <Input value={form.contactPerson ?? ""} onChange={(e) => set("contactPerson", e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Termen plată (zile)">
                  <Input type="number" min={0} value={form.paymentTermDays ?? ""} onChange={(e) => set("paymentTermDays", e.target.value === "" ? null : Number(e.target.value))} />
                </Field>
                <Field label="Monedă implicită">
                  <NativeSelect value={form.defaultCurrency ?? ""} onChange={(e) => set("defaultCurrency", e.target.value || null)}>
                    <option value="">—</option>
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <Field label="IBAN">
                <Input value={form.iban ?? ""} onChange={(e) => set("iban", e.target.value)} className="font-mono text-[13px]" />
              </Field>
              <Field label="Bancă">
                <Input value={form.bank ?? ""} onChange={(e) => set("bank", e.target.value)} />
              </Field>
            </div>
            <Field label="Note interne">
              <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={2} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Renunță
            </Button>
            <Button type="submit" loading={pending}>
              {partner ? "Salvează modificările" : "Adaugă"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
