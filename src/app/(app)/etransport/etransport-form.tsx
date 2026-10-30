"use client";

import { ArrowDown, ArrowRight, Building2, CalendarDays, FileInput, MapPin, Package, Plus, Save, Send, Trash2, Truck, TriangleAlert, UserPlus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { EASE_OUT } from "@/components/motion";
import { PartnerDialog } from "@/components/partners/partner-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { ETRANSPORT_OPERATIONS, ETRANSPORT_PURPOSES } from "@/lib/anaf/etransport";
import { COUNTIES, UNITS } from "@/lib/constants";
import { formatMoney, formatNumber } from "@/lib/format";
import { cn, round2 } from "@/lib/utils";
import { saveEtransportAction, type EtransportInput } from "./actions";
import type { FormCompany, FormDocument, FormPartner, FormProduct } from "./form-data";

type Item = {
  key: string;
  name: string;
  ncCode: string;
  quantity: number | "";
  unitCode: string;
  netWeight: number | "";
  grossWeight: number | "";
  valueRon: number | "";
  purposeCode: string;
};

const UNIT_CODES = UNITS.filter((u, i, all) => all.findIndex((x) => x.code === u.code) === i);
const newKey = () => Math.random().toString(36).slice(2, 10);
const blankItem = (): Item => ({ key: newKey(), name: "", ncCode: "", quantity: 1, unitCode: "H87", netWeight: "", grossWeight: "", valueRon: "", purposeCode: "101" });
const n = (v: number | "") => (v === "" ? 0 : v);

function toItems(input: EtransportInput["items"]): Item[] {
  return (input ?? []).map((it) => ({
    key: newKey(),
    name: it.name ?? "",
    ncCode: it.ncCode ?? "",
    quantity: (it.quantity as number) ?? 1,
    unitCode: it.unitCode ?? "H87",
    netWeight: (it.netWeight as number) || "",
    grossWeight: (it.grossWeight as number) || "",
    valueRon: (it.valueRon as number) || "",
    purposeCode: it.purposeCode ?? "101",
  }));
}

function LocationFields({
  title,
  prefix,
  value,
  onChange,
  errors,
  action,
  accent,
}: {
  title: string;
  prefix: "start" | "end";
  value: { county: string; city: string; address: string };
  onChange: (v: Partial<{ county: string; city: string; address: string }>) => void;
  errors: Record<string, string>;
  action?: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="min-w-0 flex-1 space-y-3 rounded-xl border border-border bg-subtle/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span className={cn("grid size-6 place-items-center rounded-full text-white [&_svg]:size-3.5", accent)}>
            <MapPin />
          </span>
          {title}
        </p>
        {action}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Județ" required error={errors[`${prefix}County`]}>
          <NativeSelect value={value.county} onChange={(e) => onChange({ county: e.target.value })} aria-invalid={!!errors[`${prefix}County`] || undefined}>
            <option value="">Alege județul</option>
            {COUNTIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Localitate" required error={errors[`${prefix}City`]}>
          <Input value={value.city} onChange={(e) => onChange({ city: e.target.value })} aria-invalid={!!errors[`${prefix}City`] || undefined} />
        </Field>
        <Field label="Stradă, număr" className="sm:col-span-2">
          <Input value={value.address} onChange={(e) => onChange({ address: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}

export function EtransportForm({
  initial,
  partners: initialPartners,
  products,
  documents,
  company,
  prefillNote,
}: {
  initial: EtransportInput;
  partners: FormPartner[];
  products: FormProduct[];
  documents: FormDocument[];
  company: FormCompany;
  prefillNote?: string | null;
}) {
  const router = useRouter();
  const [partners, setPartners] = React.useState(initialPartners);
  const [form, setForm] = React.useState(() => ({
    id: initial.id ?? null,
    operationType: initial.operationType ?? "30",
    transportDate: initial.transportDate,
    partnerId: initial.partnerId ?? "",
    partnerName: initial.partnerName ?? "",
    vehicleNumber: initial.vehicleNumber ?? "",
    trailer1: initial.trailer1 ?? "",
    carrierName: initial.carrierName ?? "",
    carrierCui: initial.carrierCui ?? "",
    startCounty: initial.startCounty ?? "",
    startCity: initial.startCity ?? "",
    startAddress: initial.startAddress ?? "",
    endCounty: initial.endCounty ?? "",
    endCity: initial.endCity ?? "",
    endAddress: initial.endAddress ?? "",
    documentId: initial.documentId ?? "",
    documentNumber: initial.documentNumber ?? "",
  }));
  const [items, setItems] = React.useState<Item[]>(() => {
    const it = toItems(initial.items);
    return it.length ? it : [blankItem()];
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [partnerDialog, setPartnerDialog] = React.useState<{ open: boolean; name: string }>({ open: false, name: "" });
  const [mode, setMode] = React.useState<"draft" | "declare" | null>(null);
  const { run, pending } = useAction();

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k as string]) setErrors(({ [k as string]: _, ...rest }) => rest);
  };
  const setItem = (key: string, patch: Partial<Item>) => setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const itemError = (i: number, field: string) => errors[`items.${i}.${field}`];

  const pickPartner = (id: string, list = partners) => {
    const p = list.find((x) => x.id === id);
    if (!p) {
      setForm((f) => ({ ...f, partnerId: "", partnerName: "" }));
      return;
    }
    setForm((f) => ({
      ...f,
      partnerId: p.id,
      partnerName: p.name,
      ...(f.endCity ? {} : { endCounty: p.county ?? "", endCity: p.city ?? "", endAddress: p.address ?? "" }),
    }));
    setErrors(({ partnerName: _, ...rest }) => rest);
  };

  const addProduct = (id: string) => {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    const unit = UNITS.find((u) => u.value === p.unit)?.code ?? "H87";
    setItems((list) => {
      const base = list.length === 1 && !list[0].name ? [] : list;
      return [...base, { ...blankItem(), name: p.name, ncCode: p.ncCode ?? "", unitCode: unit, valueRon: p.currency === "RON" ? p.price : "" }];
    });
  };

  const totals = {
    net: round2(items.reduce((s, it) => s + n(it.netWeight), 0)),
    gross: round2(items.reduce((s, it) => s + n(it.grossWeight), 0)),
    value: round2(items.reduce((s, it) => s + n(it.valueRon), 0)),
  };

  const payload = (): EtransportInput => ({
    ...form,
    items: items.map(({ key: _k, ...it }) => ({ ...it, quantity: n(it.quantity), netWeight: n(it.netWeight), grossWeight: n(it.grossWeight), valueRon: n(it.valueRon) })),
  });

  const save = (declare: boolean) => {
    setMode(declare ? "declare" : "draft");
    setErrors({});
    run(() => saveEtransportAction(payload(), declare), {
      onSuccess: (r) => {
        if (r.invalid) {
          setErrors(r.fieldErrors);
          toast.error("Declarația nu este completă", { description: r.message });
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        if (!r.declared) toast.success("Ciorna a fost salvată");
        else if (r.ok) toast.success("Transport declarat la ANAF", { description: r.uit ? `Cod UIT: ${r.uit}` : undefined, duration: 8000 });
        else toast.error("ANAF a respins declarația", { description: r.errors.join(" · "), duration: 10_000 });
        router.push(`/etransport/${r.id}`);
      },
    });
  };

  const partnerOptions = partners.map((p) => ({
    value: p.id,
    label: p.name,
    description: [p.cui, p.city].filter(Boolean).join(" · "),
    keywords: [p.cui ?? ""],
  }));

  return (
    <div className="space-y-6 pb-28">
      <AnimatePresence>
        {prefillNote && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary-soft/50 px-4 py-3 text-[13px] text-primary-soft-foreground"
          >
            <FileInput className="mt-0.5 size-4 shrink-0" />
            <span>{prefillNote}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeaderRow icon={<CalendarDays />} title="Operațiune" description="Tipul transportului și documentul justificativ." />
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Tip operațiune" required className="sm:col-span-2" error={errors.operationType}>
              <NativeSelect value={form.operationType} onChange={(e) => set("operationType", e.target.value)}>
                {Object.entries(ETRANSPORT_OPERATIONS).map(([code, label]) => (
                  <option key={code} value={code}>
                    {code} — {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Data transportului" required error={errors.transportDate} hint={form.operationType === "30" ? "UIT valabil 5 zile de la această dată" : "UIT valabil 15 zile de la această dată"}>
              <Input type="date" value={form.transportDate} onChange={(e) => set("transportDate", e.target.value)} />
            </Field>
            <Field label="Nr. document (factură / aviz)">
              <Input value={form.documentNumber} onChange={(e) => set("documentNumber", e.target.value)} placeholder="ex. PXD0153" />
            </Field>
            <Field label="Preia datele dintr-un document emis" className="sm:col-span-2" hint="Completează automat partenerul, destinația și bunurile (cu codurile NC din nomenclator).">
              <Combobox
                options={documents.map((d) => ({ value: d.id, label: d.label, description: d.description }))}
                value={form.documentId || null}
                onChange={(id) => id && router.push(`${window.location.pathname}?document=${id}`)}
                placeholder="Alege o factură sau un aviz…"
                searchPlaceholder="Caută după număr sau client…"
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeaderRow icon={<Building2 />} title="Partener comercial" description="Beneficiarul sau furnizorul bunurilor transportate." />
          <CardContent className="space-y-4">
            <Field label="Partener" required error={errors.partnerName}>
              <Combobox
                options={partnerOptions}
                value={form.partnerId || null}
                onChange={(id) => pickPartner(id)}
                placeholder={form.partnerName || "Alege partenerul…"}
                searchPlaceholder="Caută după nume sau CUI…"
                onCreate={(q) => setPartnerDialog({ open: true, name: q })}
                createLabel="Adaugă partener"
                invalid={!!errors.partnerName}
              />
            </Field>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border px-3 py-2.5 text-[13px] text-muted-foreground">
              <span>Partenerul nu există în nomenclator?</span>
              <Button type="button" size="xs" variant="soft" onClick={() => setPartnerDialog({ open: true, name: "" })}>
                <UserPlus /> Partener nou
              </Button>
            </div>
            <PartnerDialog
              kind="client"
              open={partnerDialog.open}
              onOpenChange={(o) => setPartnerDialog((s) => ({ ...s, open: o }))}
              defaultName={partnerDialog.name}
              onSaved={(p) => {
                const fp: FormPartner = { id: p.id, name: p.name, cui: p.cui, country: p.country, county: p.county, city: p.city, address: p.address, kind: p.kind };
                const next = [...partners.filter((x) => x.id !== p.id), fp];
                setPartners(next);
                pickPartner(p.id, next);
              }}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeaderRow
          icon={<Truck />}
          title="Vehicul și transportator"
          description="Numărul de înmatriculare apare pe UIT și este verificat în trafic."
          actions={
            <Button type="button" size="sm" variant="outline" onClick={() => setForm((f) => ({ ...f, carrierName: company.name, carrierCui: company.cui }))}>
              Transport propriu
            </Button>
          }
        />
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Nr. înmatriculare" required error={errors.vehicleNumber}>
            <Input
              value={form.vehicleNumber}
              onChange={(e) => set("vehicleNumber", e.target.value.toUpperCase())}
              placeholder="B123ABC"
              className="font-mono uppercase"
              aria-invalid={!!errors.vehicleNumber || undefined}
            />
          </Field>
          <Field label="Remorcă (opțional)">
            <Input value={form.trailer1} onChange={(e) => set("trailer1", e.target.value.toUpperCase())} placeholder="B45XYZ" className="font-mono uppercase" />
          </Field>
          <Field label="Transportator">
            <Input value={form.carrierName} onChange={(e) => set("carrierName", e.target.value)} placeholder="Denumire firmă transport" />
          </Field>
          <Field label="CUI transportator">
            <Input value={form.carrierCui} onChange={(e) => set("carrierCui", e.target.value)} placeholder="RO12345678" className="font-mono" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeaderRow icon={<MapPin />} title="Traseu" description="Locul de încărcare și cel de descărcare a bunurilor." />
        <CardContent>
          <div className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-center">
            <LocationFields
              title="Plecare"
              prefix="start"
              accent="bg-primary"
              errors={errors}
              value={{ county: form.startCounty, city: form.startCity, address: form.startAddress }}
              onChange={(v) => {
                if (v.county !== undefined) set("startCounty", v.county);
                if (v.city !== undefined) set("startCity", v.city);
                if (v.address !== undefined) set("startAddress", v.address);
              }}
              action={
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => setForm((f) => ({ ...f, startCounty: company.county ?? "", startCity: company.city ?? "", startAddress: company.address ?? "" }))}
                >
                  Sediul firmei
                </Button>
              }
            />
            <div className="grid place-items-center text-primary">
              <span className="grid size-9 place-items-center rounded-full border border-border bg-card shadow-soft">
                <ArrowRight className="hidden size-4 lg:block" />
                <ArrowDown className="size-4 lg:hidden" />
              </span>
            </div>
            <LocationFields
              title="Destinație"
              prefix="end"
              accent="bg-success"
              errors={errors}
              value={{ county: form.endCounty, city: form.endCity, address: form.endAddress }}
              onChange={(v) => {
                if (v.county !== undefined) set("endCounty", v.county);
                if (v.city !== undefined) set("endCity", v.city);
                if (v.address !== undefined) set("endAddress", v.address);
              }}
              action={
                form.partnerId ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      const p = partners.find((x) => x.id === form.partnerId);
                      if (p) setForm((f) => ({ ...f, endCounty: p.county ?? "", endCity: p.city ?? "", endAddress: p.address ?? "" }));
                    }}
                  >
                    Adresa partenerului
                  </Button>
                ) : undefined
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeaderRow
          icon={<Package />}
          title="Bunuri transportate"
          description="Codul NC (nomenclatura combinată, 8 cifre) se preia din fișa produsului."
          actions={
            products.length ? (
              <div className="hidden w-64 sm:block">
                <Combobox
                  options={products.map((p) => ({ value: p.id, label: p.name, description: p.ncCode ? `NC ${p.ncCode}` : "fără cod NC" }))}
                  value={null}
                  onChange={addProduct}
                  placeholder="Adaugă din nomenclator…"
                  searchPlaceholder="Caută produs…"
                />
              </div>
            ) : undefined
          }
        />
        <CardContent className="space-y-3">
          {errors.items && (
            <p className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger-soft-foreground">
              <TriangleAlert className="size-4" /> {errors.items}
            </p>
          )}
          <div className="hidden grid-cols-[minmax(0,2fr)_104px_84px_116px_84px_84px_112px_minmax(0,1.2fr)_32px] gap-2 px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase xl:grid">
            <span>Denumire marfă</span>
            <span>Cod NC</span>
            <span>Cantitate</span>
            <span>UM</span>
            <span>Netă kg</span>
            <span>Brută kg</span>
            <span>Valoare RON</span>
            <span>Scop</span>
            <span />
          </div>
          <AnimatePresence initial={false}>
            {items.map((it, i) => (
              <motion.div
                key={it.key}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-subtle/40 p-3 sm:grid-cols-4 xl:grid-cols-[minmax(0,2fr)_104px_84px_116px_84px_84px_112px_minmax(0,1.2fr)_32px] xl:border-0 xl:bg-transparent xl:p-1">
                  <Field label={<span className="xl:hidden">Denumire marfă</span>} className="col-span-2 sm:col-span-4 xl:col-span-1" error={itemError(i, "name")}>
                    <Input value={it.name} onChange={(e) => setItem(it.key, { name: e.target.value })} placeholder="Denumirea bunului" aria-invalid={!!itemError(i, "name") || undefined} />
                  </Field>
                  <Field label={<span className="xl:hidden">Cod NC</span>} error={itemError(i, "ncCode")}>
                    <Input
                      value={it.ncCode}
                      onChange={(e) => setItem(it.key, { ncCode: e.target.value.replace(/\D/g, "").slice(0, 8) })}
                      placeholder="84713000"
                      inputMode="numeric"
                      className="font-mono"
                      aria-invalid={!!itemError(i, "ncCode") || undefined}
                    />
                  </Field>
                  <Field label={<span className="xl:hidden">Cantitate</span>} error={itemError(i, "quantity")}>
                    <Input type="number" min={0} step="any" value={it.quantity} onChange={(e) => setItem(it.key, { quantity: e.target.value === "" ? "" : Number(e.target.value) })} />
                  </Field>
                  <Field label={<span className="xl:hidden">UM</span>}>
                    <NativeSelect value={it.unitCode} onChange={(e) => setItem(it.key, { unitCode: e.target.value })}>
                      {UNIT_CODES.map((u) => (
                        <option key={u.code} value={u.code}>
                          {u.label} · {u.code}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label={<span className="xl:hidden">Netă kg</span>}>
                    <Input type="number" min={0} step="any" value={it.netWeight} onChange={(e) => setItem(it.key, { netWeight: e.target.value === "" ? "" : Number(e.target.value) })} />
                  </Field>
                  <Field label={<span className="xl:hidden">Brută kg</span>} error={itemError(i, "grossWeight")}>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={it.grossWeight}
                      onChange={(e) => setItem(it.key, { grossWeight: e.target.value === "" ? "" : Number(e.target.value) })}
                      aria-invalid={!!itemError(i, "grossWeight") || undefined}
                    />
                  </Field>
                  <Field label={<span className="xl:hidden">Valoare RON (fără TVA)</span>} error={itemError(i, "valueRon")}>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={it.valueRon}
                      onChange={(e) => setItem(it.key, { valueRon: e.target.value === "" ? "" : Number(e.target.value) })}
                      aria-invalid={!!itemError(i, "valueRon") || undefined}
                    />
                  </Field>
                  <Field label={<span className="xl:hidden">Scop</span>} className="col-span-2 sm:col-span-1 xl:col-span-1">
                    <NativeSelect value={it.purposeCode} onChange={(e) => setItem(it.key, { purposeCode: e.target.value })}>
                      {Object.entries(ETRANSPORT_PURPOSES).map(([code, label]) => (
                        <option key={code} value={code}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <div className="col-span-2 flex justify-end sm:col-span-4 xl:col-span-1 xl:items-start">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setItems((list) => (list.length === 1 ? [blankItem()] : list.filter((x) => x.key !== it.key)))}
                      aria-label="Șterge articolul"
                      className="text-muted-foreground hover:text-danger"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <Button type="button" variant="outline" size="sm" onClick={() => setItems((l) => [...l, blankItem()])}>
            <Plus /> Adaugă articol
          </Button>
        </CardContent>
      </Card>

      <div className="sticky bottom-24 z-20 bg-card/95 sm:bottom-5 sm:mr-20 backdrop-blur-md flex flex-col gap-3 rounded-2xl border border-border p-3 shadow-lift sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
          <span className="text-muted-foreground">
            {items.length} {items.length === 1 ? "articol" : "articole"}
          </span>
          <span>
            <span className="text-muted-foreground">Brut: </span>
            <span className="font-semibold tabular">{formatNumber(totals.gross)} kg</span>
          </span>
          <span>
            <span className="text-muted-foreground">Valoare: </span>
            <span className="font-semibold tabular">{formatMoney(totals.value)}</span>
          </span>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => save(false)} loading={pending && mode === "draft"} disabled={pending} className="flex-1 sm:flex-none">
            {!(pending && mode === "draft") && <Save />} Salvează ciorna
          </Button>
          <Button type="button" variant="gradient" onClick={() => save(true)} loading={pending && mode === "declare"} disabled={pending} className="flex-1 sm:flex-none">
            {!(pending && mode === "declare") && <Send />} Declară la ANAF
          </Button>
        </div>
      </div>
    </div>
  );
}
