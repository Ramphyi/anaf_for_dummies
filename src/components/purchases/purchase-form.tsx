"use client";

import { addDays, format, parseISO } from "date-fns";
import { ArrowLeft, Building2, FileText, FolderKanban, Loader2, NotebookPen, Plus, RefreshCw, Save, Tags, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { exchangeRateAction, savePurchaseAction } from "@/app/(app)/cheltuieli/actions";
import { PartnerDialog } from "@/components/partners/partner-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import { Field, Input, InputGroup, NativeSelect, Textarea } from "@/components/ui/input";
import { ColorDot } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page";
import { Tooltip } from "@/components/ui/popover";
import { useAction } from "@/hooks/use-action";
import { CURRENCIES, EXPENSE_CATEGORY_LABELS, UNITS, VAT_RATES } from "@/lib/constants";
import { computeTotals } from "@/lib/documents/totals";
import { formatMoney } from "@/lib/format";
import type { PurchaseInput } from "@/lib/purchases/schema";
import { cn, round2 } from "@/lib/utils";

export type SupplierOption = {
  id: string;
  name: string;
  cui: string | null;
  city: string | null;
  paymentTermDays: number | null;
  defaultCurrency: string | null;
  lastCategory: string | null;
};
export type ProjectOption = { id: string; name: string; code: string | null; color: string; clientName: string | null };
export type ProductOption = { id: string; name: string; code: string | null; unit: string; price: number; purchasePrice: number | null; vatRate: number; trackStock: boolean };

type Line = { key: number; productId: string | null; name: string; unit: string; quantity: string; unitPrice: string; vatRate: number };

export type PurchaseFormInitial = {
  id?: string;
  supplierId: string | null;
  number: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  exchangeRate: number;
  category: string;
  projectId: string | null;
  notes: string | null;
  source?: "manual" | "spv";
  stockReceived?: boolean;
  lines: { productId: string | null; name: string; unit: string; quantity: number; unitPrice: number; vatRate: number }[];
};

const num = (s: string) => {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function PurchaseForm({
  initial,
  suppliers: initialSuppliers,
  projects,
  products,
}: {
  initial: PurchaseFormInitial;
  suppliers: SupplierOption[];
  projects: ProjectOption[];
  products: ProductOption[];
}) {
  const router = useRouter();
  const editing = !!initial.id;
  const keyRef = React.useRef(0);
  const nextKey = () => ++keyRef.current;
  const toLine = (l: PurchaseFormInitial["lines"][number]): Line => ({ ...l, key: nextKey(), quantity: String(l.quantity), unitPrice: String(l.unitPrice) });
  const emptyLine = (): Line => ({ key: nextKey(), productId: null, name: "", unit: "buc", quantity: "1", unitPrice: "", vatRate: 21 });

  const [suppliers, setSuppliers] = React.useState(initialSuppliers);
  const [supplierId, setSupplierId] = React.useState(initial.supplierId);
  const [number, setNumber] = React.useState(initial.number);
  const [issueDate, setIssueDate] = React.useState(initial.issueDate);
  const [dueDate, setDueDate] = React.useState(initial.dueDate ?? "");
  const [currency, setCurrency] = React.useState(initial.currency);
  const [rate, setRate] = React.useState(String(initial.exchangeRate));
  const [category, setCategory] = React.useState(initial.category);
  const [projectId, setProjectId] = React.useState(initial.projectId);
  const [notes, setNotes] = React.useState(initial.notes ?? "");
  const [lines, setLines] = React.useState<Line[]>(() => (initial.lines.length ? initial.lines.map(toLine) : [emptyLine()]));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [partnerOpen, setPartnerOpen] = React.useState(false);
  const [partnerName, setPartnerName] = React.useState("");
  const [fetchingRate, startRate] = React.useTransition();
  const { run, pending } = useAction();

  const supplier = suppliers.find((s) => s.id === supplierId) ?? null;

  const supplierOptions: ComboOption[] = suppliers.map((s) => ({
    value: s.id,
    label: s.name,
    description: [s.cui ? `CUI ${s.cui}` : null, s.city].filter(Boolean).join(" · ") || undefined,
    keywords: [s.cui ?? ""],
  }));
  const projectOptions: ComboOption[] = projects.map((p) => ({
    value: p.id,
    label: p.name,
    description: [p.code, p.clientName].filter(Boolean).join(" · ") || undefined,
    icon: <ColorDot color={p.color} />,
  }));
  const productOptions: ComboOption[] = products.map((p) => ({
    value: p.id,
    label: p.name,
    description: [p.code, p.trackStock ? "stoc" : null, p.purchasePrice != null ? `achiziție ${formatMoney(p.purchasePrice)}` : null].filter(Boolean).join(" · ") || undefined,
    keywords: [p.code ?? ""],
  }));

  const applySupplier = (id: string, list = suppliers) => {
    setSupplierId(id || null);
    const s = list.find((x) => x.id === id);
    if (!s || editing) return;
    if (s.paymentTermDays != null && issueDate) setDueDate(format(addDays(parseISO(issueDate), s.paymentTermDays), "yyyy-MM-dd"));
    if (s.defaultCurrency && (CURRENCIES as readonly string[]).includes(s.defaultCurrency)) changeCurrency(s.defaultCurrency);
    if (s.lastCategory) setCategory(s.lastCategory);
  };

  const fetchRate = React.useCallback(
    (cur: string, date: string) => {
      if (cur === "RON") {
        setRate("1");
        return;
      }
      startRate(async () => {
        const r = await exchangeRateAction(cur, date);
        if (r.ok) setRate(String(r.data.rate));
        else toast.error(r.error);
      });
    },
    [],
  );

  const changeCurrency = (cur: string) => {
    setCurrency(cur);
    fetchRate(cur, issueDate);
  };

  const changeIssueDate = (d: string) => {
    // păstrăm termenul de plată
    if (d && issueDate && dueDate) {
      const diff = Math.round((parseISO(dueDate).getTime() - parseISO(issueDate).getTime()) / 86_400_000);
      setDueDate(format(addDays(parseISO(d), diff), "yyyy-MM-dd"));
    }
    setIssueDate(d);
    if (currency !== "RON" && d) fetchRate(currency, d);
  };

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickProduct = (key: number, id: string) => {
    const p = products.find((x) => x.id === id);
    if (!p) return setLine(key, { productId: null });
    setLine(key, { productId: p.id, name: p.name, unit: p.unit, unitPrice: String(p.purchasePrice ?? p.price), vatRate: p.vatRate });
  };

  const totals = computeTotals(lines.map((l) => ({ quantity: num(l.quantity), unitPrice: num(l.unitPrice), vatRate: l.vatRate })));
  const rateNum = currency === "RON" ? 1 : num(rate);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!supplierId) errs.supplierId = "Alege furnizorul";
    if (!number.trim()) errs.number = "Numărul facturii este obligatoriu";
    if (!issueDate) errs.issueDate = "Data este obligatorie";
    if (dueDate && issueDate && dueDate < issueDate) errs.dueDate = "Scadența nu poate fi înainte de data facturii";
    const filled = lines.filter((l) => l.name.trim() || num(l.unitPrice));
    if (!filled.length) errs.lines = "Adaugă cel puțin o linie";
    filled.forEach((l) => {
      if (!l.name.trim()) errs[`line-${l.key}`] = "Denumire lipsă";
      else if (!num(l.quantity)) errs[`line-${l.key}`] = "Cantitate invalidă";
    });
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error(Object.values(errs)[0]);
      return;
    }
    const payload: PurchaseInput = {
      supplierId: supplierId!,
      number: number.trim(),
      issueDate,
      dueDate: dueDate || null,
      currency: currency as PurchaseInput["currency"],
      exchangeRate: rateNum || 1,
      category: category as PurchaseInput["category"],
      projectId: projectId || null,
      notes,
      lines: filled.map((l) => ({ productId: l.productId, name: l.name.trim(), unit: l.unit, quantity: num(l.quantity), unitPrice: num(l.unitPrice), vatRate: l.vatRate })),
    };
    run(() => savePurchaseAction(payload, initial.id), {
      onSuccess: (r) => router.push(`/cheltuieli/${r.id}`),
      onError: (_e, fieldErrors) => fieldErrors && setErrors(fieldErrors),
    });
  };

  const cancelHref = initial.id ? `/cheltuieli/${initial.id}` : "/cheltuieli";

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <PageHeader
        breadcrumbs={[{ label: "Cheltuieli", href: "/cheltuieli" }, ...(editing ? [{ label: initial.number, href: cancelHref }] : []), { label: editing ? "Editare" : "Cheltuială nouă" }]}
        title={editing ? `Editează factura ${initial.number}` : "Cheltuială nouă"}
        description={editing ? "Modificările recalculează totalurile și statusul plății." : "Înregistrează o factură primită de la un furnizor."}
        icon={<FileText />}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={cancelHref}>
                <ArrowLeft /> Renunță
              </Link>
            </Button>
            <Button type="submit" loading={pending}>
              {!pending && <Save />} {editing ? "Salvează" : "Înregistrează"}
            </Button>
          </>
        }
      />

      {editing && (initial.source === "spv" || initial.stockReceived) && (
        <div className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
          {initial.source === "spv" && "Factura a fost importată din SPV — XML-ul original rămâne neschimbat. "}
          {initial.stockReceived && "Marfa a fost deja recepționată în stoc: modificarea liniilor nu actualizează NIR-ul."}
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeaderRow title="Furnizor și factură" icon={<Building2 />} />
          <CardContent className="space-y-4">
            <Field label="Furnizor" required error={errors.supplierId}>
              <div className="flex gap-2">
                <Combobox
                  options={supplierOptions}
                  value={supplierId}
                  onChange={(v) => applySupplier(v)}
                  placeholder="Alege furnizorul…"
                  searchPlaceholder="Caută după nume sau CUI…"
                  emptyText="Niciun furnizor găsit"
                  onCreate={(q) => {
                    setPartnerName(q);
                    setPartnerOpen(true);
                  }}
                  createLabel="Adaugă furnizorul"
                  invalid={!!errors.supplierId}
                  className="flex-1"
                />
                <Tooltip content="Furnizor nou">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setPartnerName("");
                      setPartnerOpen(true);
                    }}
                    aria-label="Furnizor nou"
                  >
                    <Plus />
                  </Button>
                </Tooltip>
              </div>
            </Field>
            {supplier && (supplier.paymentTermDays != null || supplier.defaultCurrency) && !editing && (
              <p className="-mt-2 text-xs text-muted-foreground">
                {supplier.paymentTermDays != null && `Termen de plată ${supplier.paymentTermDays} zile`}
                {supplier.paymentTermDays != null && supplier.defaultCurrency && " · "}
                {supplier.defaultCurrency && `monedă ${supplier.defaultCurrency}`} — aplicate automat.
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Număr factură" required error={errors.number}>
                <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="ex. FCT-12345" aria-invalid={!!errors.number || undefined} className="tabular" />
              </Field>
              <Field label="Data facturii" required error={errors.issueDate}>
                <Input type="date" value={issueDate} onChange={(e) => changeIssueDate(e.target.value)} />
              </Field>
              <Field label="Scadență" error={errors.dueDate}>
                <Input type="date" value={dueDate} min={issueDate} onChange={(e) => setDueDate(e.target.value)} aria-invalid={!!errors.dueDate || undefined} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Monedă">
                <NativeSelect value={currency} onChange={(e) => changeCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </NativeSelect>
              </Field>
              <AnimatePresence initial={false}>
                {currency !== "RON" && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="sm:col-span-2">
                    <Field label="Curs de schimb" hint={`1 ${currency} = ${rateNum || "?"} RON (BNR, la data facturii)`}>
                      <div className="flex gap-2">
                        <InputGroup type="number" step="0.0001" min={0} value={rate} onChange={(e) => setRate(e.target.value)} suffix="RON" />
                        <Button type="button" variant="soft" onClick={() => fetchRate(currency, issueDate)} disabled={fetchingRate}>
                          {fetchingRate ? <Loader2 className="animate-spin" /> : <RefreshCw />} BNR
                        </Button>
                      </div>
                    </Field>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeaderRow title="Clasificare" icon={<FolderKanban />} />
          <CardContent className="space-y-4">
            <Field label="Categorie de cheltuială">
              <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)}>
                {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Proiect" hint="Costul se atribuie proiectului (profitabilitate).">
              <Combobox options={projectOptions} value={projectId} onChange={(v) => setProjectId(v || null)} placeholder="Fără proiect" searchPlaceholder="Caută proiect…" allowClear />
            </Field>
          </CardContent>
        </Card>

      </div>

      <Card>
        <CardHeaderRow
          title="Produse și servicii facturate"
          description="Prețurile unitare sunt fără TVA."
          icon={<Tags />}
          actions={
            <Button type="button" variant="soft" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
              <Plus /> Linie
            </Button>
          }
        />
        <CardContent className="space-y-3">
          {errors.lines && <p className="text-xs font-medium text-danger">{errors.lines}</p>}
          <div className="hidden grid-cols-[minmax(0,1fr)_5.5rem_6.5rem_7.5rem_5.5rem_8rem_2rem] gap-2 px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase md:grid">
            <span>Denumire / produs</span>
            <span className="text-right">Cant.</span>
            <span>UM</span>
            <span className="text-right">Preț unitar</span>
            <span>TVA</span>
            <span className="text-right">Total</span>
            <span />
          </div>
          <AnimatePresence initial={false}>
            {lines.map((l, i) => {
              const lt = totals.lines[i];
              const err = errors[`line-${l.key}`];
              return (
                <motion.div
                  key={l.key}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div
                    className={cn(
                      "grid grid-cols-2 gap-2 rounded-xl border border-border bg-subtle/40 p-3 md:grid-cols-[minmax(0,1fr)_5.5rem_6.5rem_7.5rem_5.5rem_8rem_2rem] md:items-start md:border-0 md:bg-transparent md:p-1",
                      err && "border-danger/40",
                    )}
                  >
                    <div className="col-span-2 space-y-1.5 md:col-span-1">
                      <Input
                        value={l.name}
                        onChange={(e) => setLine(l.key, { name: e.target.value })}
                        placeholder={`Linia ${i + 1} — denumire`}
                        aria-invalid={!!err || undefined}
                      />
                      <Combobox
                        options={productOptions}
                        value={l.productId}
                        onChange={(v) => pickProduct(l.key, v)}
                        placeholder="Asociază cu un produs (opțional)"
                        searchPlaceholder="Caută produs…"
                        allowClear
                        className="h-8 text-xs"
                      />
                      {err && <p className="text-xs font-medium text-danger">{err}</p>}
                    </div>
                    <Field label={<span className="md:hidden">Cantitate</span>}>
                      <Input type="number" step="any" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} className="text-right" />
                    </Field>
                    <Field label={<span className="md:hidden">UM</span>}>
                      <NativeSelect value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value })} className="px-2 pr-7">
                        {!UNITS.some((u) => u.value === l.unit) && <option value={l.unit}>{l.unit}</option>}
                        {UNITS.map((u) => (
                          <option key={u.value} value={u.value}>
                            {u.label}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label={<span className="md:hidden">Preț unitar</span>}>
                      <Input type="number" step="any" value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: e.target.value })} placeholder="0,00" className="text-right" />
                    </Field>
                    <Field label={<span className="md:hidden">TVA</span>}>
                      <NativeSelect value={String(l.vatRate)} onChange={(e) => setLine(l.key, { vatRate: Number(e.target.value) })} className="px-2 pr-7">
                        {VAT_RATES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.value}%
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <div className="flex items-end justify-between gap-2 md:block md:pt-2 md:text-right">
                      <span className="text-xs text-muted-foreground md:hidden">Total linie</span>
                      <div>
                        <div className="text-sm font-semibold tabular">{formatMoney(lt?.totalAmount ?? 0, currency)}</div>
                        <div className="text-[11px] text-muted-foreground tabular">TVA {formatMoney(lt?.vatAmount ?? 0, currency)}</div>
                      </div>
                    </div>
                    <div className="flex items-end justify-end md:pt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [emptyLine()]))}
                        aria-label="Șterge linia"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          <Button type="button" variant="ghost" size="sm" className="w-full border border-dashed border-border" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
            <Plus /> Adaugă o linie
          </Button>
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeaderRow title="Note interne" icon={<NotebookPen />} />
          <CardContent>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="ex. abonament anual, contract nr. …, observații pentru contabilitate" />
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="space-y-2 p-5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total fără TVA</span>
                <span className="tabular">{formatMoney(totals.subtotal, currency)}</span>
              </div>
              {totals.breakdown
                .filter((b) => b.rate > 0 || totals.breakdown.length > 1)
                .map((b) => (
                  <div key={`${b.category}-${b.rate}`} className="flex justify-between text-muted-foreground">
                    <span>
                      TVA {b.rate}% <span className="text-xs">(bază {formatMoney(b.taxable, currency)})</span>
                    </span>
                    <span className="tabular">{formatMoney(b.vat, currency)}</span>
                  </div>
                ))}
            </div>
            <div className="flex items-baseline justify-between border-t border-border bg-subtle/60 px-5 py-4">
              <span className="font-medium">Total de plată</span>
              <motion.span key={totals.total} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-xl font-semibold tracking-tight tabular">
                {formatMoney(totals.total, currency)}
              </motion.span>
            </div>
            {currency !== "RON" && (
              <div className="border-t border-border px-5 py-2.5 text-right text-xs text-muted-foreground tabular">≈ {formatMoney(round2(totals.total * rateNum))}</div>
            )}
          </Card>

          <Button type="submit" className="w-full" size="lg" loading={pending}>
            {!pending && <Save />} {editing ? "Salvează modificările" : "Înregistrează cheltuiala"}
          </Button>
        </div>
      </div>

      <PartnerDialog
        kind="supplier"
        open={partnerOpen}
        onOpenChange={setPartnerOpen}
        defaultName={partnerName}
        onSaved={(p) => {
          const opt: SupplierOption = { id: p.id, name: p.name, cui: p.cui, city: p.city, paymentTermDays: p.paymentTermDays, defaultCurrency: p.defaultCurrency, lastCategory: null };
          const list = [...suppliers.filter((s) => s.id !== p.id), opt].sort((a, b) => a.name.localeCompare(b.name, "ro"));
          setSuppliers(list);
          applySupplier(p.id, list);
        }}
      />
    </form>
  );
}
