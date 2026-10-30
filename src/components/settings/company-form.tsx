"use client";

import { AlertTriangle, BadgeCheck, Building2, Check, Coins, ImageUp, Landmark, Loader2, MapPin, Palette, RefreshCcw, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { toast } from "sonner";
import { lookupCompanyCuiAction, saveCompanyAction, type CompanySettingsInput } from "@/app/(app)/setari/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { Field, Input, InputGroup, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { useAction } from "@/hooks/use-action";
import { COUNTIES, CURRENCIES, PALETTE, VAT_RATES } from "@/lib/constants";
import { cn, isValidCui, isValidIban } from "@/lib/utils";

export type CompanyFormData = {
  name: string;
  cui: string;
  regCom: string | null;
  vatPayer: boolean;
  vatOnCollection: boolean;
  address: string | null;
  city: string | null;
  county: string | null;
  postalCode: string | null;
  iban: string | null;
  bank: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  shareCapital: string | null;
  logoDataUrl: string | null;
  brandColor: string;
  defaultCurrency: string;
  defaultVatRate: number;
  defaultDueDays: number;
  invoiceFooter: string | null;
};

const MAX_LOGO_BYTES = 300 * 1024;

/** Citește imaginea ca data URL; imaginile raster prea mari sunt redimensionate (max. 600 px). */
async function readLogo(file: File): Promise<string> {
  const asDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("Fișierul nu a putut fi citit."));
      r.readAsDataURL(blob);
    });
  if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) throw new Error("Folosește o imagine PNG, JPG, WebP, GIF sau SVG.");
  if (file.size <= MAX_LOGO_BYTES) return asDataUrl(file);
  if (file.type === "image/svg+xml") throw new Error("Fișierul SVG depășește 300 KB.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Imaginea nu a putut fi deschisă."));
      i.src = url;
    });
    const scale = Math.min(1, 600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.88));
    if (!blob || blob.size > MAX_LOGO_BYTES) throw new Error("Logo-ul depășește 300 KB chiar și după redimensionare.");
    toast.info("Logo-ul a fost redimensionat automat la 600 px.");
    return asDataUrl(blob);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function CompanyForm({ initial }: { initial: CompanyFormData }) {
  const [form, setForm] = React.useState<CompanyFormData>(initial);
  const [saved, setSaved] = React.useState<CompanyFormData>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [lookup, setLookup] = React.useState<{ inactive: boolean; eInvoiceRegistered: boolean; splitVat: boolean; caen: string | null; fiscalOffice: string | null } | null>(null);
  const [looking, startLooking] = React.useTransition();
  const [dragging, setDragging] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const { run, pending } = useAction();

  const set = <K extends keyof CompanyFormData>(k: K, v: CompanyFormData[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => {
      if (!e[k as string]) return e;
      const { [k as string]: _omit, ...rest } = e;
      return rest;
    });
  };
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const cuiOk = isValidCui(form.cui);
  const ibanOk = !form.iban || isValidIban(form.iban);

  const doLookup = () =>
    startLooking(async () => {
      const r = await lookupCompanyCuiAction(form.cui);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const d = r.data;
      setForm((f) => ({
        ...f,
        name: d.name || f.name,
        cui: d.cui,
        regCom: d.regCom ?? f.regCom,
        vatPayer: d.vatPayer,
        vatOnCollection: d.vatOnCollection,
        address: d.street ?? d.address ?? f.address,
        city: d.city ?? f.city,
        county: d.county ?? f.county,
        postalCode: d.postalCode ?? f.postalCode,
        phone: f.phone || d.phone,
        iban: f.iban || d.iban,
      }));
      setLookup({ inactive: d.inactive, eInvoiceRegistered: d.eInvoiceRegistered, splitVat: d.splitVat, caen: d.caen, fiscalOffice: d.fiscalOffice });
      toast.success("Datele au fost actualizate din registrul ANAF — verifică și salvează.");
    });

  const onFile = async (file?: File | null) => {
    if (!file) return;
    try {
      set("logoDataUrl", await readLogo(file));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Logo invalid");
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => saveCompanyAction(form as CompanySettingsInput), {
      onSuccess: () => {
        setSaved(form);
        setErrors({});
      },
      onError: (_, fe) => fe && setErrors(fe),
    });
  };

  const customColor = !PALETTE.includes(form.brandColor);

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardHeaderRow
          title="Date de identificare"
          description="Apar pe facturi și în XML-ul e-Factura. Le poți prelua direct din registrul ANAF."
          icon={<Building2 />}
          actions={
            <Button type="button" variant="soft" size="sm" onClick={doLookup} disabled={!cuiOk || looking}>
              {looking ? <Loader2 className="animate-spin" /> : <RefreshCcw />}
              <span className="hidden sm:inline">Actualizează de la ANAF</span>
              <span className="sm:hidden">ANAF</span>
            </Button>
          }
        />
        <CardContent className="space-y-4">
          <AnimatePresence>
            {lookup && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-subtle/60 p-3 text-xs">
                  {lookup.inactive ? (
                    <Badge tone="danger" dot>
                      Contribuabil inactiv
                    </Badge>
                  ) : (
                    <Badge tone="success" dot>
                      Activ fiscal
                    </Badge>
                  )}
                  <Badge tone={lookup.eInvoiceRegistered ? "success" : "neutral"}>{lookup.eInvoiceRegistered ? "Înregistrat în RO e-Factura" : "Neînregistrat în RO e-Factura"}</Badge>
                  {lookup.splitVat && <Badge tone="warning">Split TVA</Badge>}
                  {lookup.caen && <span className="text-muted-foreground">CAEN {lookup.caen}</span>}
                  {lookup.fiscalOffice && <span className="truncate text-muted-foreground">{lookup.fiscalOffice}</span>}
                  <button type="button" onClick={() => setLookup(null)} className="ml-auto rounded p-0.5 text-muted-foreground hover:text-foreground">
                    <X className="size-3.5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field label="Denumire" required error={errors.name} className="sm:col-span-2">
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
            </Field>
            <Field label="CUI / CIF" required error={errors.cui ?? (!cuiOk && form.cui ? "Cifra de control nu corespunde" : undefined)} hint="Fără prefixul RO">
              <InputGroup
                value={form.cui}
                onChange={(e) => set("cui", e.target.value)}
                aria-invalid={!cuiOk}
                suffix={cuiOk ? <BadgeCheck className="size-4 text-success" /> : undefined}
              />
            </Field>
            <Field label="Nr. Reg. Com." error={errors.regCom}>
              <Input value={form.regCom ?? ""} onChange={(e) => set("regCom", e.target.value)} placeholder="J12/1234/2020" />
            </Field>
            <Field label="Capital social" error={errors.shareCapital}>
              <Input value={form.shareCapital ?? ""} onChange={(e) => set("shareCapital", e.target.value)} placeholder="200 RON" />
            </Field>
            <div className="grid gap-3 rounded-lg border border-border p-3 sm:col-span-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3">
                <Switch checked={form.vatPayer} onCheckedChange={(v) => set("vatPayer", v)} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">Plătitor de TVA</span>
                  <span className="block text-xs text-muted-foreground">Facturile includ TVA; codul fiscal apare cu prefixul RO.</span>
                </span>
              </label>
              <label className={cn("flex cursor-pointer items-start gap-3", !form.vatPayer && "opacity-50")}>
                <Switch checked={form.vatOnCollection} onCheckedChange={(v) => set("vatOnCollection", v)} disabled={!form.vatPayer} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">TVA la încasare</span>
                  <span className="block text-xs text-muted-foreground">Mențiunea „TVA la încasare” apare pe facturi (art. 282 Cod fiscal).</span>
                </span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeaderRow title="Sediu și contact" description="Adresa sediului social și datele de contact de pe documente." icon={<MapPin />} />
        <CardContent className="grid items-start gap-4 sm:grid-cols-2">
          <Field label="Adresă" error={errors.address} className="sm:col-span-2">
            <Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} placeholder="Str. Exemplu nr. 1" />
          </Field>
          <Field label="Localitate" error={errors.city} hint={form.county === "B" ? "Pentru București folosește „Sector 1”…„Sector 6”" : undefined}>
            <Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <div className="grid grid-cols-[1fr_7rem] gap-4">
            <Field label="Județ" error={errors.county}>
              <NativeSelect value={form.county ?? ""} onChange={(e) => set("county", e.target.value || null)}>
                <option value="">Alege județul</option>
                {COUNTIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Cod poștal" error={errors.postalCode}>
              <Input value={form.postalCode ?? ""} onChange={(e) => set("postalCode", e.target.value)} inputMode="numeric" maxLength={6} />
            </Field>
          </div>
          <Field label="Email" error={errors.email}>
            <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder="facturare@firma.ro" />
          </Field>
          <Field label="Telefon" error={errors.phone}>
            <Input type="tel" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Website" error={errors.website} className="sm:col-span-2">
            <Input value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} placeholder="https://firma.ro" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeaderRow title="Cont bancar" description="Contul în care clienții plătesc facturile." icon={<Landmark />} />
        <CardContent className="grid items-start gap-4 sm:grid-cols-2">
          <Field label="IBAN" error={errors.iban ?? (!ibanOk ? "IBAN invalid — verifică cifrele" : undefined)}>
            <InputGroup
              value={form.iban ?? ""}
              onChange={(e) => set("iban", e.target.value.toUpperCase())}
              placeholder="RO49 AAAA 1B31 0075 9384 0000"
              aria-invalid={!ibanOk}
              className="font-mono"
              suffix={form.iban && ibanOk ? <Check className="size-4 text-success" /> : undefined}
            />
          </Field>
          <Field label="Banca" error={errors.bank}>
            <Input value={form.bank ?? ""} onChange={(e) => set("bank", e.target.value)} placeholder="Banca Transilvania" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeaderRow title="Branding" description="Logo-ul și culoarea apar pe facturi, emailuri și în PDF-uri." icon={<Palette />} />
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-[13px] font-medium">Logo</p>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  onFile(e.dataTransfer.files?.[0]);
                }}
                className={cn(
                  "flex items-center gap-4 rounded-xl border border-dashed border-input p-4 transition-colors",
                  dragging && "border-primary bg-primary-soft/50",
                )}
              >
                <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-white">
                  {form.logoDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.logoDataUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <ImageUp className="size-6 text-muted-foreground/60" />
                  )}
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{form.logoDataUrl ? "Logo încărcat" : "Trage imaginea aici"}</p>
                  <p className="text-xs text-muted-foreground">PNG, JPG, WebP sau SVG · max. 300 KB (redimensionăm automat)</p>
                  <div className="mt-2 flex gap-2">
                    <Button type="button" size="xs" variant="outline" onClick={() => fileRef.current?.click()}>
                      <ImageUp /> {form.logoDataUrl ? "Schimbă" : "Alege fișier"}
                    </Button>
                    {form.logoDataUrl && (
                      <Button type="button" size="xs" variant="ghost" onClick={() => set("logoDataUrl", null)}>
                        <Trash2 /> Elimină
                      </Button>
                    )}
                  </div>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    onFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
              {errors.logoDataUrl && <p className="mt-1 text-xs font-medium text-danger">{errors.logoDataUrl}</p>}
            </div>
            <div>
              <p className="mb-1.5 text-[13px] font-medium">Culoare de brand</p>
              <div className="flex flex-wrap items-center gap-2">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set("brandColor", c)}
                    className={cn(
                      "grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-card transition-transform hover:scale-110",
                      form.brandColor.toLowerCase() === c && "ring-2 ring-foreground/70",
                    )}
                    style={{ background: c }}
                    aria-label={`Culoare ${c}`}
                  >
                    {form.brandColor.toLowerCase() === c && <Check className="size-4 text-white" />}
                  </button>
                ))}
                <label
                  className={cn(
                    "relative grid size-8 cursor-pointer place-items-center overflow-hidden rounded-full bg-[conic-gradient(from_0deg,#f43f5e,#f59e0b,#22c55e,#06b6d4,#6d5dfc,#ec4899,#f43f5e)] ring-offset-2 ring-offset-card",
                    customColor && "ring-2 ring-foreground/70",
                  )}
                  title="Culoare personalizată"
                >
                  <input type="color" value={form.brandColor} onChange={(e) => set("brandColor", e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
                  {customColor && <span className="size-4 rounded-full ring-2 ring-white" style={{ background: form.brandColor }} />}
                </label>
                <Input
                  value={form.brandColor}
                  onChange={(e) => set("brandColor", e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`)}
                  className="h-8 w-24 font-mono text-xs"
                  maxLength={7}
                  aria-invalid={!!errors.brandColor}
                />
              </div>
            </div>
          </div>
          {/* previzualizare antet factură */}
          <div className="overflow-hidden rounded-xl border border-border bg-white text-[#111] shadow-soft">
            <div className="h-1.5" style={{ background: form.brandColor }} />
            <div className="flex items-start justify-between gap-4 p-5">
              <div className="min-w-0">
                {form.logoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.logoDataUrl} alt="" className="mb-2 h-10 max-w-40 object-contain object-left" />
                ) : (
                  <div className="mb-2 grid size-10 place-items-center rounded-lg text-sm font-bold text-white" style={{ background: form.brandColor }}>
                    {form.name.slice(0, 1).toUpperCase() || "F"}
                  </div>
                )}
                <div className="truncate text-sm font-semibold">{form.name || "Denumirea firmei"}</div>
                <div className="text-[11px] text-[#666]">
                  {form.vatPayer ? "RO" : ""}
                  {form.cui} · {form.regCom || "J00/000/0000"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: form.brandColor }}>
                  Factură
                </div>
                <div className="text-lg font-bold">PXD0142</div>
                <div className="text-[11px] text-[#666]">Scadență: {form.defaultDueDays} zile</div>
              </div>
            </div>
            <div className="mx-5 mb-5 rounded-md px-3 py-2 text-[11px] text-white" style={{ background: form.brandColor }}>
              Total de plată · {form.defaultCurrency}
            </div>
            {form.invoiceFooter && <div className="border-t border-[#eee] px-5 py-2 text-[10px] text-[#888]">{form.invoiceFooter}</div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeaderRow title="Valori implicite" description="Precompletate la fiecare document nou; le poți schimba pe document." icon={<Coins />} />
        <CardContent className="grid items-start gap-4 sm:grid-cols-3">
          <Field label="Moneda implicită">
            <NativeSelect value={form.defaultCurrency} onChange={(e) => set("defaultCurrency", e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Cota TVA implicită">
            <NativeSelect value={String(form.defaultVatRate)} onChange={(e) => set("defaultVatRate", Number(e.target.value))}>
              {VAT_RATES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Termen de plată" error={errors.defaultDueDays}>
            <InputGroup
              type="number"
              min={0}
              max={365}
              value={form.defaultDueDays}
              onChange={(e) => set("defaultDueDays", Math.max(0, Math.round(Number(e.target.value) || 0)))}
              suffix="zile"
            />
          </Field>
          <Field label="Text subsol factură" hint="Ex.: „Factura circulă fără semnătură și ștampilă conform Legii 227/2015.”" error={errors.invoiceFooter} className="sm:col-span-3">
            <Textarea value={form.invoiceFooter ?? ""} onChange={(e) => set("invoiceFooter", e.target.value)} rows={2} maxLength={1000} />
          </Field>
        </CardContent>
      </Card>

      {/* bara de salvare */}
      <div className="sticky bottom-4 z-20">
        <AnimatePresence>
          {(dirty || pending) && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="glass flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 shadow-lift"
            >
              <span className="flex items-center gap-2 text-sm">
                <AlertTriangle className="size-4 text-warning" /> Ai modificări nesalvate
              </span>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setForm(saved)} disabled={pending}>
                  Renunță
                </Button>
                <Button type="submit" size="sm" loading={pending} disabled={!cuiOk || !ibanOk}>
                  Salvează
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </form>
  );
}
