"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarClock,
  FileCheck2,
  Info,
  Loader2,
  NotebookPen,
  Package,
  RefreshCw,
  Save,
  Truck,
  User,
  UserPlus,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { PartnerDialog } from "@/components/partners/partner-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Field, Input, InputGroup, NativeSelect, Textarea } from "@/components/ui/input";
import { ColorDot, Kbd } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page";
import { useAction } from "@/hooks/use-action";
import { CURRENCIES } from "@/lib/constants";
import type { DocKind, Partner } from "@/lib/db/schema";
import { computeTotals } from "@/lib/documents/totals";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getExchangeRateAction, saveDocumentAction, type DocumentFormInput } from "./actions";
import { blankLine, fromEditorLine, LinesEditor, meaningfulLines, toEditorLine, type EditorLine } from "./lines-editor";
import {
  addDaysIso,
  defaultVatFor,
  docHref,
  KIND_META,
  parseNum,
  type CompanyDefaults,
  type LineValue,
  type PartnerOption,
  type ProductOption,
  type SeriesOption,
} from "./shared";
import { TotalsSummary } from "./totals-summary";

export type DocumentInitial = {
  partnerId: string | null;
  seriesId: string | null;
  issueDate: string;
  dueDate: string | null;
  deliveryDate: string | null;
  currency: string;
  exchangeRate: number;
  notes: string | null;
  internalNotes: string | null;
  issuedBy: string | null;
  delegateName: string | null;
  delegateIdCard: string | null;
  transportMeans: string | null;
  warehouseId: string | null;
  projectId: string | null;
  lines: LineValue[];
};

type ProjectOption = { id: string; name: string; clientId: string | null; code: string | null; color: string };

const toPartnerOption = (p: Partner): PartnerOption => ({
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
});

/** Editorul comun pentru facturi, proforme și avize (creare + editare). */
export function DocumentEditor({
  kind,
  documentId,
  status,
  fullNumber,
  initial,
  partners: initialPartners,
  products,
  series,
  warehouses,
  projects,
  company,
  rates,
  warning,
}: {
  kind: DocKind;
  documentId?: string | null;
  status?: string | null;
  fullNumber?: string | null;
  initial: DocumentInitial;
  partners: PartnerOption[];
  products: ProductOption[];
  series: SeriesOption[];
  warehouses: { id: string; name: string; isDefault: boolean }[];
  projects: ProjectOption[];
  company: CompanyDefaults;
  rates: Record<string, number>;
  warning?: string | null;
}) {
  const router = useRouter();
  const meta = KIND_META[kind];
  const isEdit = !!documentId;
  const isDraft = !isEdit || status === "draft";
  const { run, pending } = useAction();
  const [submitMode, setSubmitMode] = React.useState<"draft" | "issue" | null>(null);

  const [partners, setPartners] = React.useState(initialPartners);
  const [partnerId, setPartnerId] = React.useState(initial.partnerId ?? "");
  const [seriesId, setSeriesId] = React.useState(initial.seriesId ?? series.find((s) => s.isDefault)?.id ?? series[0]?.id ?? "");
  const [issueDate, setIssueDate] = React.useState(initial.issueDate);
  const [dueDate, setDueDate] = React.useState(initial.dueDate ?? "");
  const [dueAuto, setDueAuto] = React.useState(!isEdit);
  const [deliveryDate, setDeliveryDate] = React.useState(initial.deliveryDate ?? "");
  const [currency, setCurrency] = React.useState(initial.currency);
  const [rate, setRate] = React.useState(String(initial.exchangeRate ?? 1).replace(".", ","));
  const [rateInfo, setRateInfo] = React.useState<string | null>(null);
  const [rateLoading, startRate] = React.useTransition();
  const [notes, setNotes] = React.useState(initial.notes ?? "");
  const [internalNotes, setInternalNotes] = React.useState(initial.internalNotes ?? "");
  const [issuedBy, setIssuedBy] = React.useState(initial.issuedBy ?? "");
  const [delegateName, setDelegateName] = React.useState(initial.delegateName ?? "");
  const [delegateIdCard, setDelegateIdCard] = React.useState(initial.delegateIdCard ?? "");
  const [transportMeans, setTransportMeans] = React.useState(initial.transportMeans ?? "");
  const [warehouseId, setWarehouseId] = React.useState(initial.warehouseId ?? warehouses.find((w) => w.isDefault)?.id ?? "");
  const [projectId, setProjectId] = React.useState(initial.projectId ?? "");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [clientDialog, setClientDialog] = React.useState(false);
  const [clientDraftName, setClientDraftName] = React.useState("");
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const partner = partners.find((p) => p.id === partnerId) ?? null;
  const vatDefault = defaultVatFor(company, partner);
  const [lines, setLines] = React.useState<EditorLine[]>(() =>
    initial.lines.length
      ? initial.lines.map(toEditorLine)
      : [
          blankLine(
            defaultVatFor(
              company,
              initialPartners.find((p) => p.id === initial.partnerId),
            ),
          ),
        ],
  );

  const rateNum = currency === "RON" ? 1 : parseNum(rate);
  const totals = React.useMemo(() => computeTotals(lines.map(fromEditorLine)), [lines]);

  const termDays = (p: PartnerOption | null) => p?.paymentTermDays ?? company.defaultDueDays;

  const fetchRate = React.useCallback((cur: string, date: string) => {
    if (cur === "RON") {
      setRate("1");
      setRateInfo(null);
      return;
    }
    startRate(async () => {
      const r = await getExchangeRateAction(cur, date);
      if (r.ok) {
        setRate(String(r.data.rate).replace(".", ","));
        setRateInfo(`Curs BNR din ${formatDate(r.data.date)}`);
      } else {
        setRateInfo(null);
        toast.error(r.error);
      }
    });
  }, []);

  // La documentele noi în valută, preluăm cursul BNR la montare.
  React.useEffect(() => {
    if (!isEdit && initial.currency !== "RON") fetchRate(initial.currency, initial.issueDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (kind !== "notice" && !isEdit && !initial.dueDate) setDueDate(addDaysIso(initial.issueDate, termDays(partner)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectPartner = (id: string, list = partners) => {
    const next = list.find((p) => p.id === id) ?? null;
    const prevVat = defaultVatFor(company, partner);
    const nextVat = defaultVatFor(company, next);
    setPartnerId(id);
    setErrors((e) => ({ ...e, partnerId: "" }));
    if (dueAuto && kind !== "notice") setDueDate(addDaysIso(issueDate, termDays(next)));
    if (prevVat.category !== nextVat.category) {
      setLines((ls) =>
        ls.map((l) =>
          l.vatCategory === prevVat.category && (prevVat.category !== "S" || l.vatRate === prevVat.rate)
            ? { ...l, vatCategory: nextVat.category, vatRate: nextVat.category === "S" ? nextVat.rate : 0 }
            : l,
        ),
      );
    }
    if (!isEdit && next?.defaultCurrency && next.defaultCurrency !== currency) {
      setCurrency(next.defaultCurrency);
      fetchRate(next.defaultCurrency, issueDate);
    }
    if (projectId) {
      const pr = projects.find((p) => p.id === projectId);
      if (pr?.clientId && pr.clientId !== id) setProjectId("");
    }
  };

  const changeIssueDate = (d: string) => {
    setIssueDate(d);
    if (dueAuto && d && kind !== "notice") setDueDate(addDaysIso(d, termDays(partner)));
    if (currency !== "RON" && d) fetchRate(currency, d);
  };

  const changeCurrency = (c: string) => {
    setCurrency(c);
    fetchRate(c, issueDate);
  };

  const submit = (issue: boolean) => {
    const filled = meaningfulLines(lines);
    const errs: Record<string, string> = {};
    if (!partnerId) errs.partnerId = "Alege clientul";
    if (!filled.length) errs.lines = "Adaugă cel puțin un produs sau serviciu";
    filled.forEach((l) => {
      const i = lines.indexOf(l);
      if (!l.name.trim()) errs[`lines.${i}.name`] = "Denumirea este obligatorie";
      if (parseNum(l.quantity) === 0) errs[`lines.${i}.quantity`] = "Cantitatea nu poate fi 0";
    });
    if (Object.keys(errs).length) {
      setErrors(errs);
      toast.error(Object.values(errs)[0]);
      return;
    }
    // Indexurile erorilor de la server se raportează la liniile trimise.
    if (filled.length !== lines.length) setLines(filled);
    const input: DocumentFormInput = {
      id: documentId ?? null,
      kind,
      partnerId,
      seriesId: seriesId || null,
      issueDate,
      dueDate: kind === "notice" ? null : dueDate || null,
      deliveryDate: deliveryDate || null,
      currency,
      exchangeRate: rateNum,
      notes,
      internalNotes,
      issuedBy,
      delegateName,
      delegateIdCard,
      transportMeans,
      warehouseId: warehouseId || null,
      projectId: projectId || null,
      issue: issue && isDraft,
      lines: filled.map(fromEditorLine),
    };
    setSubmitMode(issue ? "issue" : "draft");
    run(() => saveDocumentAction(input), {
      success: (r) =>
        isEdit && !(issue && isDraft)
          ? "Modificările au fost salvate"
          : r.status === "draft"
            ? "Ciorna a fost salvată"
            : `${meta.one} ${r.fullNumber} a fost emis${kind === "notice" ? "" : "ă"}`,
      onSuccess: (r) => router.push(docHref(kind, r.id)),
      onError: (_e, fe) => setErrors(fe ?? {}),
    });
  };

  // Scurtături: ⌘S = salvează, ⌘↵ = emite
  const submitRef = React.useRef(submit);
  submitRef.current = submit;
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        submitRef.current(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        submitRef.current(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const partnerOptions = partners.map((p) => ({
    value: p.id,
    label: p.name,
    description: [p.cui ? (p.entityType === "pf" ? "CNP" : "CUI") + ` ${p.cui}` : null, p.city, p.country !== "RO" ? p.country : null]
      .filter(Boolean)
      .join(" · "),
    keywords: [p.cui ?? ""],
    icon: p.entityType === "pf" ? <User className="size-4 text-muted-foreground" /> : <Building2 className="size-4 text-muted-foreground" />,
  }));
  const projectOptions = projects
    .filter((p) => !partnerId || !p.clientId || p.clientId === partnerId)
    .map((p) => ({ value: p.id, label: p.name, description: p.code ?? undefined, icon: <ColorDot color={p.color} /> }));
  const selectedSeries = series.find((s) => s.id === seriesId);
  const nextNumberPreview = selectedSeries ? `${selectedSeries.prefix}${String(selectedSeries.nextNumber).padStart(selectedSeries.padding, "0")}` : null;

  const title = isEdit ? `Editează ${meta.one.toLowerCase()} ${fullNumber ?? ""}`.trim() : meta.newLabel;
  const primaryLabel = isDraft ? (kind === "notice" ? "Emite avizul" : kind === "proforma" ? "Emite proforma" : "Emite factura") : "Salvează modificările";

  const buttons = (full?: boolean) => (
    <>
      {isDraft && (
        <Button
          type="button"
          variant="outline"
          onClick={() => submit(false)}
          loading={pending && submitMode === "draft"}
          disabled={pending}
          className={cn(full && "w-full")}
        >
          {!(pending && submitMode === "draft") && <Save />} Salvează ciornă
        </Button>
      )}
      <Button
        type="button"
        variant="gradient"
        onClick={() => submit(isDraft)}
        loading={pending && submitMode === "issue"}
        disabled={pending}
        className={cn(full && "w-full")}
      >
        {!(pending && submitMode === "issue") && <FileCheck2 />} {primaryLabel}
      </Button>
    </>
  );

  return (
    <>
      <PageHeader
        title={title}
        description={isEdit ? `${meta.one} pentru ${partner?.name ?? "—"}` : `Completează datele, iar totalurile și TVA-ul se calculează automat.`}
        breadcrumbs={[
          { label: meta.many, href: meta.path },
          ...(isEdit && documentId ? [{ label: fullNumber ?? "", href: docHref(kind, documentId) }] : []),
          { label: isEdit ? "Editare" : "Nou" },
        ]}
        icon={<NotebookPen />}
        actions={
          <>
            <Button variant="ghost" asChild>
              <Link href={isEdit && documentId ? docHref(kind, documentId) : meta.path}>
                <ArrowLeft /> Renunță
              </Link>
            </Button>
            <div className="hidden items-center gap-2 sm:flex">{buttons()}</div>
          </>
        }
      />

      <AnimatePresence>
        {warning && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning-soft-foreground"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{warning}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeaderRow title="Client și detalii document" icon={<Building2 />} />
            <CardContent className="space-y-5">
              <Field label="Client" required error={errors.partnerId || null}>
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <Combobox
                      options={partnerOptions}
                      value={partnerId}
                      onChange={(v) => selectPartner(v)}
                      placeholder="Alege clientul…"
                      searchPlaceholder="Caută după nume sau CUI…"
                      emptyText="Niciun client găsit"
                      invalid={!!errors.partnerId}
                      onCreate={(q) => {
                        setClientDraftName(q);
                        setClientDialog(true);
                      }}
                      createLabel="Client nou"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="soft"
                    onClick={() => {
                      setClientDraftName("");
                      setClientDialog(true);
                    }}
                  >
                    <UserPlus /> <span className="hidden sm:inline">Client nou</span>
                  </Button>
                </div>
              </Field>

              <AnimatePresence initial={false}>
                {partner && (
                  <motion.div
                    key={partner.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-subtle px-3.5 py-2.5 text-xs">
                      <span className="font-medium text-foreground">{partner.name}</span>
                      {partner.cui && (
                        <span className="text-muted-foreground">
                          {partner.entityType === "pf" ? "CNP" : "CUI"} {partner.cui}
                        </span>
                      )}
                      {partner.city && <span className="text-muted-foreground">· {partner.city}</span>}
                      <span className="ml-auto flex flex-wrap gap-1.5">
                        {partner.country !== "RO" && <Badge tone="info">{partner.country}</Badge>}
                        {partner.entityType === "pf" ? (
                          <Badge>Persoană fizică</Badge>
                        ) : (
                          <Badge tone={partner.vatPayer ? "success" : "neutral"}>{partner.vatPayer ? "Plătitor TVA" : "Neplătitor TVA"}</Badge>
                        )}
                        <Badge tone="brand">
                          <CalendarClock className="size-3" /> {termDays(partner)} zile
                        </Badge>
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Serie" hint={isDraft && nextNumberPreview ? `Următorul nr.: ${nextNumberPreview}` : undefined}>
                  {isDraft ? (
                    <NativeSelect value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
                      {series.length === 0 && <option value="">Implicită</option>}
                      {series.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.prefix}
                          {s.isDefault ? " (implicită)" : ""}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <Input value={fullNumber ?? ""} disabled />
                  )}
                </Field>
                <Field label="Data emiterii" required>
                  <Input type="date" value={issueDate} onChange={(e) => changeIssueDate(e.target.value)} />
                </Field>
                {kind !== "notice" ? (
                  <Field
                    label={kind === "proforma" ? "Valabilă până la" : "Data scadenței"}
                    error={errors.dueDate || null}
                    hint={dueAuto && partner ? `Automat: +${termDays(partner)} zile` : undefined}
                  >
                    <Input
                      type="date"
                      value={dueDate}
                      min={issueDate}
                      onChange={(e) => {
                        setDueDate(e.target.value);
                        setDueAuto(false);
                      }}
                    />
                  </Field>
                ) : (
                  <Field label="Data expedierii">
                    <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
                  </Field>
                )}
                {kind === "invoice" ? (
                  <Field label="Data livrării" hint="Opțional">
                    <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
                  </Field>
                ) : (
                  <Field label="Proiect" hint="Opțional">
                    <Combobox options={projectOptions} value={projectId} onChange={setProjectId} placeholder="Fără proiect" allowClear />
                  </Field>
                )}
              </div>

              <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Monedă">
                  <NativeSelect value={currency} onChange={(e) => changeCurrency(e.target.value)}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <AnimatePresence initial={false}>
                  {currency !== "RON" && (
                    <motion.div key="rate" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}>
                      <Field label={`Curs ${currency}/RON`} hint={rateInfo ?? "Editabil — implicit cursul BNR"}>
                        <div className="flex gap-2">
                          <InputGroup
                            inputMode="decimal"
                            value={rate}
                            onChange={(e) => {
                              setRate(e.target.value);
                              setRateInfo("Curs introdus manual");
                            }}
                            suffix="RON"
                            className="tabular"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => fetchRate(currency, issueDate)}
                            disabled={rateLoading}
                            aria-label="Preia cursul BNR"
                          >
                            {rateLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                          </Button>
                        </div>
                      </Field>
                    </motion.div>
                  )}
                </AnimatePresence>
                {kind === "invoice" && (
                  <Field label="Proiect" hint="Opțional — leagă factura de un proiect" className={cn(currency === "RON" ? "lg:col-span-3" : "lg:col-span-2")}>
                    <Combobox options={projectOptions} value={projectId} onChange={setProjectId} placeholder="Fără proiect" allowClear />
                  </Field>
                )}
                {kind !== "invoice" && warehouses.length > 1 && (
                  <Field label="Gestiune">
                    <NativeSelect value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeaderRow
              title="Produse și servicii"
              description={`${lines.length} ${lines.length === 1 ? "linie" : "linii"}`}
              icon={<Package />}
              actions={
                vatDefault.reason ? (
                  <Badge tone="info" className="hidden max-w-xs truncate md:inline-flex" title={vatDefault.reason}>
                    <Info className="size-3" /> {vatDefault.category === "AE" ? "Taxare inversă" : "Fără TVA"}
                  </Badge>
                ) : undefined
              }
            />
            <CardContent className="px-3">
              <AnimatePresence initial={false}>
                {vatDefault.reason && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-3 flex items-center gap-2 overflow-hidden rounded-lg bg-info-soft px-3 py-2 text-xs text-info-soft-foreground"
                  >
                    <Info className="size-3.5 shrink-0" /> {vatDefault.reason}
                  </motion.p>
                )}
              </AnimatePresence>
              {errors.lines && <p className="mb-3 text-xs font-medium text-danger">{errors.lines}</p>}
              <LinesEditor
                lines={lines}
                onChange={setLines}
                products={products}
                currency={currency}
                exchangeRate={rateNum}
                rates={rates}
                defaultVat={{ rate: vatDefault.rate, category: vatDefault.category }}
                errors={errors}
              />
            </CardContent>
          </Card>

          {kind === "notice" && (
            <Card>
              <CardHeaderRow title="Expediție și delegat" description="Datele apar pe aviz și pot fi preluate în e-Transport." icon={<Truck />} />
              <CardContent className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Nume delegat">
                  <Input value={delegateName} onChange={(e) => setDelegateName(e.target.value)} placeholder="Ion Popescu" />
                </Field>
                <Field label="Act identitate (BI/CI)">
                  <Input value={delegateIdCard} onChange={(e) => setDelegateIdCard(e.target.value)} placeholder="RX 123456" />
                </Field>
                <Field label="Mijloc de transport">
                  <Input value={transportMeans} onChange={(e) => setTransportMeans(e.target.value.toUpperCase())} placeholder="B-123-ABC" />
                </Field>
                <Field label="Gestiune">
                  <NativeSelect value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                    {warehouses.length === 0 && <option value="">Gestiunea implicită</option>}
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeaderRow title="Mențiuni" icon={<NotebookPen />} />
            <CardContent className="grid items-start gap-4 lg:grid-cols-2">
              <Field label="Mențiuni pe document" hint="Apar pe documentul tipărit și în XML-ul e-Factura.">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: Conform contractului nr. 12/2026" rows={3} />
              </Field>
              <div className="grid gap-4">
                <Field label="Notă internă" hint="Vizibilă doar în aplicație.">
                  <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2} className="min-h-14" />
                </Field>
                <Field label="Întocmit de">
                  <Input value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} />
                </Field>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 xl:sticky xl:top-20">
          <Card className="overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-primary to-accent" />
            <CardHeaderRow title="Total document" description={currency !== "RON" ? `Valori în ${currency}` : "Valori în RON"} />
            <CardContent>
              <TotalsSummary totals={totals} currency={currency} exchangeRate={rateNum} />
              <div className="mt-5 hidden flex-col gap-2 sm:flex xl:flex">{buttons(true)}</div>
              <p className="mt-3 hidden items-center justify-center gap-1.5 text-[11px] text-muted-foreground xl:flex">
                <Kbd>⌘</Kbd>
                <Kbd>S</Kbd> salvează · <Kbd>⌘</Kbd>
                <Kbd>↵</Kbd> {isDraft ? "emite" : "salvează"}
              </p>
            </CardContent>
          </Card>
          {isDraft && kind === "invoice" && (
            <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              Ciornele nu consumă numere din serie. La emitere, factura primește numărul definitiv și poate fi transmisă în SPV.
            </p>
          )}
        </div>
      </div>

      {/* Bară fixă pe mobil (portal: wrapper-ul de tranziție are `filter`, care ar „captura” position: fixed) */}
      <div className="h-20 sm:hidden" />
      {mounted &&
        createPortal(
          <div className="glass fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-border px-4 py-3 sm:hidden">
            <div className="mr-auto min-w-0">
              <p className="text-[11px] text-muted-foreground">Total de plată</p>
              <p className="truncate text-base font-semibold tabular">
                {totals.total.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
              </p>
            </div>
            {isDraft && (
              <Button type="button" variant="outline" size="icon" onClick={() => submit(false)} disabled={pending} aria-label="Salvează ciornă">
                {pending && submitMode === "draft" ? <Loader2 className="animate-spin" /> : <Save />}
              </Button>
            )}
            <Button type="button" variant="gradient" onClick={() => submit(isDraft)} loading={pending && submitMode === "issue"} disabled={pending}>
              {!(pending && submitMode === "issue") && <FileCheck2 />} {isDraft ? "Emite" : "Salvează"}
            </Button>
          </div>,
          document.body,
        )}

      <PartnerDialog
        kind="client"
        open={clientDialog}
        onOpenChange={setClientDialog}
        defaultName={clientDraftName}
        onSaved={(p) => {
          const opt = toPartnerOption(p);
          const list = [...partners.filter((x) => x.id !== opt.id), opt].sort((a, b) => a.name.localeCompare(b.name, "ro"));
          setPartners(list);
          selectPartner(opt.id, list);
        }}
      />
    </>
  );
}
