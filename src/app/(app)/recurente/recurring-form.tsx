"use client";

import { ArrowLeft, Building2, CalendarDays, FileText, Mail, Package, Repeat, Save, Send, Settings2, UserPlus, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { blankLine, fromEditorLine, LinesEditor, meaningfulLines, toEditorLine, type EditorLine } from "@/components/documents/lines-editor";
import {
  advanceDate,
  defaultVatFor,
  FREQUENCY_LABELS,
  RECURRING_PLACEHOLDERS,
  type CompanyDefaults,
  type Frequency,
  type LineValue,
  type PartnerOption,
  type ProductOption,
  type SeriesOption,
} from "@/components/documents/shared";
import { TotalsSummary } from "@/components/documents/totals-summary";
import { PartnerDialog } from "@/components/partners/partner-dialog";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Field, Input, InputGroup, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page";
import { Segmented } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { CURRENCIES, DOC_STATUS } from "@/lib/constants";
import { computeTotals } from "@/lib/documents/totals";
import { formatDate, formatDateLong, formatMoney, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveRecurringAction } from "./actions";
import { useGenerateNow } from "./recurring-table";

export type RecurringInitial = {
  id: string | null;
  name: string;
  partnerId: string | null;
  seriesId: string | null;
  frequency: Frequency;
  intervalCount: number;
  startDate: string;
  nextRunDate: string;
  endDate: string | null;
  dueDays: number;
  currency: string;
  notes: string | null;
  autoIssue: boolean;
  autoSendEmail: boolean;
  autoSendEfactura: boolean;
  active: boolean;
  lines: LineValue[];
};

type HistoryRow = { id: string; fullNumber: string; issueDate: string; total: number; currency: string; status: string };

function Toggle({ icon, title, description, checked, onChange, disabled }: { icon: React.ReactNode; title: string; description: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3.5 transition-colors hover:bg-muted/40", checked && !disabled && "border-primary/30 bg-primary-soft/40", disabled && "cursor-not-allowed opacity-50")}>
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <Switch checked={checked && !disabled} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}

export function RecurringForm({
  initial,
  partners: initialPartners,
  products,
  series,
  company,
  rates,
  history,
}: {
  initial: RecurringInitial;
  partners: PartnerOption[];
  products: ProductOption[];
  series: SeriesOption[];
  company: CompanyDefaults;
  rates: Record<string, number>;
  history: HistoryRow[];
}) {
  const router = useRouter();
  const isEdit = !!initial.id;
  const { run, pending } = useAction();
  const gen = useGenerateNow();
  const [partners, setPartners] = React.useState(initialPartners);
  const [clientDialog, setClientDialog] = React.useState(false);
  const [f, setF] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const set = <K extends keyof RecurringInitial>(k: K, v: RecurringInitial[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };
  const partner = partners.find((p) => p.id === f.partnerId) ?? null;
  const vat = defaultVatFor(company, partner);
  const [lines, setLines] = React.useState<EditorLine[]>(() => (initial.lines.length ? initial.lines.map(toEditorLine) : [blankLine(vat, "luna")]));
  const rate = f.currency === "RON" ? 1 : (rates[f.currency] ?? 0);
  const totals = React.useMemo(() => computeTotals(lines.map(fromEditorLine)), [lines]);

  const schedule = React.useMemo(() => {
    const out: string[] = [];
    let d = f.nextRunDate;
    for (let i = 0; i < 5 && d; i++) {
      if (f.endDate && d > f.endDate) break;
      out.push(d);
      d = advanceDate(d, f.frequency, f.intervalCount);
    }
    return out;
  }, [f.nextRunDate, f.frequency, f.intervalCount, f.endDate]);

  const selectPartner = (id: string, list = partners) => {
    const p = list.find((x) => x.id === id);
    const prevVat = defaultVatFor(company, partner);
    const nextVat = defaultVatFor(company, p);
    setF((x) => ({
      ...x,
      partnerId: id,
      name: x.name || (p ? `Abonament ${p.name}` : ""),
      dueDays: !isEdit && p?.paymentTermDays != null ? p.paymentTermDays : x.dueDays,
      currency: !isEdit && p?.defaultCurrency ? p.defaultCurrency : x.currency,
    }));
    setErrors((e) => ({ ...e, partnerId: "" }));
    if (prevVat.category !== nextVat.category) {
      setLines((ls) => ls.map((l) => (l.vatCategory === prevVat.category ? { ...l, vatCategory: nextVat.category, vatRate: nextVat.category === "S" ? nextVat.rate : 0 } : l)));
    }
  };

  const submit = () => {
    const filled = meaningfulLines(lines);
    const errs: Record<string, string> = {};
    if (!f.partnerId) errs.partnerId = "Alege clientul";
    if (!f.name.trim()) errs.name = "Denumirea este obligatorie";
    if (!filled.length) errs.lines = "Adaugă cel puțin o linie";
    if (Object.keys(errs).length) {
      setErrors(errs);
      toast.error(Object.values(errs)[0]);
      return;
    }
    if (filled.length !== lines.length) setLines(filled);
    run(
      () =>
        saveRecurringAction({
          ...f,
          partnerId: f.partnerId ?? "",
          nextRunDate: isEdit ? f.nextRunDate : f.startDate,
          lines: filled.map(fromEditorLine),
        }),
      {
        onSuccess: (r) => router.push(isEdit ? `/recurente/${r.id}` : "/recurente"),
        onError: (_e, fe) => setErrors(fe ?? {}),
      },
    );
  };

  const partnerOptions = partners.map((p) => ({
    value: p.id,
    label: p.name,
    description: [p.cui, p.city].filter(Boolean).join(" · "),
    keywords: [p.cui ?? ""],
  }));

  return (
    <>
      <PageHeader
        title={isEdit ? initial.name : "Șablon recurent nou"}
        description={isEdit ? `${partner?.name ?? ""} · ${FREQUENCY_LABELS[f.frequency].one.toLowerCase()}` : "Factura se generează automat la fiecare perioadă, din liniile de mai jos."}
        breadcrumbs={[{ label: "Facturi recurente", href: "/recurente" }, { label: isEdit ? "Editare" : "Nou" }]}
        icon={<Repeat />}
        actions={
          <>
            <Button variant="ghost" asChild>
              <Link href="/recurente">
                <ArrowLeft /> Renunță
              </Link>
            </Button>
            {isEdit && (
              <Button variant="outline" onClick={() => gen.generate(initial.id!)} loading={gen.pending}>
                {!gen.pending && <Zap />} Generează acum
              </Button>
            )}
            <Button onClick={submit} loading={pending}>
              {!pending && <Save />} Salvează șablonul
            </Button>
          </>
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeaderRow title="Client și facturare" icon={<Building2 />} />
            <CardContent className="space-y-4">
              <div className="grid items-start gap-4 lg:grid-cols-2">
                <Field label="Client" required error={errors.partnerId || null}>
                  <div className="flex gap-2">
                    <div className="min-w-0 flex-1">
                      <Combobox options={partnerOptions} value={f.partnerId} onChange={(v) => selectPartner(v)} placeholder="Alege clientul…" invalid={!!errors.partnerId} />
                    </div>
                    <Button type="button" variant="soft" size="icon" onClick={() => setClientDialog(true)} aria-label="Client nou">
                      <UserPlus />
                    </Button>
                  </div>
                </Field>
                <Field label="Denumire șablon" required error={errors.name || null}>
                  <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Retainer mentenanță lunar" />
                </Field>
              </div>
              <div className="grid items-start gap-4 sm:grid-cols-3">
                <Field label="Serie facturi">
                  <NativeSelect value={f.seriesId ?? ""} onChange={(e) => set("seriesId", e.target.value || null)}>
                    <option value="">Seria implicită</option>
                    {series.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.prefix}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Monedă" hint={f.currency !== "RON" ? "Cursul BNR se preia la generare" : undefined}>
                  <NativeSelect value={f.currency} onChange={(e) => set("currency", e.target.value)}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Termen de plată" error={errors.dueDays || null}>
                  <InputGroup type="number" min={0} max={365} value={f.dueDays} onChange={(e) => set("dueDays", Number(e.target.value) || 0)} suffix="zile" />
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeaderRow title="Programare" icon={<CalendarDays />} description="Când și cât de des se generează factura." />
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Segmented
                  value={f.frequency}
                  onChange={(v) => set("frequency", v)}
                  options={(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((k) => ({ value: k, label: FREQUENCY_LABELS[k].one }))}
                />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  la fiecare
                  <Input type="number" min={1} max={24} value={f.intervalCount} onChange={(e) => set("intervalCount", Math.max(1, Number(e.target.value) || 1))} className="h-8 w-16 text-center tabular" />
                  {FREQUENCY_LABELS[f.frequency].unit[f.intervalCount === 1 ? 0 : 1]}
                </div>
              </div>
              <div className="grid items-start gap-4 sm:grid-cols-3">
                <Field label="Data de început" required>
                  <Input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} />
                </Field>
                {isEdit ? (
                  <Field label="Următoarea generare" required>
                    <Input type="date" value={f.nextRunDate} onChange={(e) => set("nextRunDate", e.target.value)} />
                  </Field>
                ) : (
                  <Field label="Prima factură" hint="Se generează la data de început">
                    <Input value={formatDate(f.startDate)} disabled />
                  </Field>
                )}
                <Field label="Data de sfârșit" hint="Opțional — gol = nelimitat" error={errors.endDate || null}>
                  <Input type="date" value={f.endDate ?? ""} min={f.startDate} onChange={(e) => set("endDate", e.target.value || null)} />
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeaderRow title="Produse și servicii" icon={<Package />} description="Liniile copiate pe fiecare factură generată." />
            <CardContent className="px-3">
              <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                Variabile disponibile în denumiri și mențiuni:
                {RECURRING_PLACEHOLDERS.map((p) => (
                  <code key={p.token} title={p.label} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                    {p.token}
                  </code>
                ))}
              </div>
              {errors.lines && <p className="mb-3 text-xs font-medium text-danger">{errors.lines}</p>}
              <LinesEditor lines={lines} onChange={setLines} products={products} currency={f.currency} exchangeRate={rate} rates={rates} defaultVat={{ rate: vat.rate, category: vat.category }} errors={errors} />
            </CardContent>
          </Card>

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Card>
              <CardHeaderRow title="Mențiuni pe factură" icon={<FileText />} />
              <CardContent>
                <Textarea value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={5} placeholder="Ex.: Servicii de mentenanță aferente lunii {luna} {an}, conform contractului nr. 7/2026." />
              </CardContent>
            </Card>
            <Card>
              <CardHeaderRow title="Automatizări" icon={<Settings2 />} />
              <CardContent className="space-y-2">
                <Toggle icon={<Zap />} title="Emite automat" description="Altfel se creează o ciornă pentru verificare." checked={f.autoIssue} onChange={(v) => set("autoIssue", v)} />
                <Toggle icon={<Send />} title="Trimite automat în SPV" description="Transmite factura în e-Factura după emitere." checked={f.autoSendEfactura} onChange={(v) => set("autoSendEfactura", v)} disabled={!f.autoIssue} />
                <Toggle icon={<Mail />} title="Trimite pe email clientului" description={partner?.email ? `Către ${partner.email}` : "Clientul nu are email setat."} checked={f.autoSendEmail} onChange={(v) => set("autoSendEmail", v)} disabled={!f.autoIssue} />
                <Toggle icon={<Repeat />} title="Șablon activ" description="Pe pauză nu se mai generează facturi." checked={f.active} onChange={(v) => set("active", v)} />
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-4 xl:sticky xl:top-20">
          <Card className="overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-primary to-accent" />
            <CardHeaderRow title="Valoare per factură" description={`În ${f.currency}`} />
            <CardContent>
              <TotalsSummary totals={totals} currency={f.currency} exchangeRate={rate} />
              <Button onClick={submit} loading={pending} className="mt-5 w-full">
                {!pending && <Save />} Salvează șablonul
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeaderRow title="Următoarele generări" icon={<CalendarDays />} />
            <CardContent>
              {schedule.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nicio generare programată în intervalul ales.</p>
              ) : (
                <ol className="space-y-1">
                  <AnimatePresence initial={false} mode="popLayout">
                    {schedule.map((d, i) => (
                      <motion.li
                        key={d}
                        layout
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        transition={{ duration: 0.25, delay: i * 0.03 }}
                        className={cn("flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm", i === 0 ? "bg-primary-soft text-primary-soft-foreground" : "text-muted-foreground")}
                      >
                        <span className={cn(i === 0 && "font-medium")}>{formatDateLong(d)}</span>
                        {i === 0 && <span className="text-xs">{d <= todayIso() ? "scadentă" : "următoarea"}</span>}
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ol>
              )}
            </CardContent>
          </Card>

          {isEdit && (
            <Card>
              <CardHeaderRow title="Facturi generate" description={history.length ? `${history.length} facturi` : "Încă nicio factură"} icon={<FileText />} />
              {history.length > 0 && (
                <CardContent className="space-y-1">
                  {history.slice(0, 8).map((h) => (
                    <Link key={h.id} href={`/facturi/${h.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{h.fullNumber}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(h.issueDate)}</span>
                      </span>
                      <span className="flex flex-col items-end gap-0.5">
                        <span className="text-xs font-medium tabular">{formatMoney(h.total, h.currency)}</span>
                        <StatusBadge status={h.status} map={DOC_STATUS} className="text-[10px]" />
                      </span>
                    </Link>
                  ))}
                </CardContent>
              )}
            </Card>
          )}
        </div>
      </div>

      <PartnerDialog
        kind="client"
        open={clientDialog}
        onOpenChange={setClientDialog}
        onSaved={(p) => {
          const opt: PartnerOption = {
            id: p.id,
            name: p.name,
            cui: p.cui,
            entityType: p.entityType,
            vatPayer: p.vatPayer,
            country: p.country,
            city: p.city,
            email: p.email,
            paymentTermDays: p.paymentTermDays,
            defaultCurrency: p.defaultCurrency,
          };
          const list = [...partners.filter((x) => x.id !== p.id), opt].sort((a, b) => a.name.localeCompare(b.name, "ro"));
          setPartners(list);
          selectPartner(p.id, list);
        }}
      />
    </>
  );
}
