"use client";

import { Barcode, Boxes, Package, Trash2, Wrench } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, InputGroup, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { CURRENCIES, UNITS, VAT_CATEGORY_LABELS, VAT_RATES } from "@/lib/constants";
import type { Product } from "@/lib/db/schema";
import { priceWithoutVat } from "@/lib/documents/totals";
import { formatMoney } from "@/lib/format";
import { deleteProductAction, saveProductAction } from "@/lib/products/actions";
import type { ProductInput } from "@/lib/products/schema";
import { round2 } from "@/lib/utils";

/** Câmpurile necesare dialogului (un `Product` complet se potrivește). */
export type ProductLike = Pick<
  Product,
  | "id"
  | "code"
  | "name"
  | "description"
  | "type"
  | "unit"
  | "price"
  | "currency"
  | "vatRate"
  | "vatCategory"
  | "priceIncludesVat"
  | "trackStock"
  | "purchasePrice"
  | "ncCode"
  | "barcode"
  | "category"
  | "active"
>;

type Form = Omit<ProductInput, "price" | "purchasePrice" | "vatRate"> & { price: string; purchasePrice: string; vatRate: number };

function toForm(p: ProductLike | null | undefined, defaults?: Partial<Form>): Form {
  if (!p) {
    return {
      type: "product",
      code: "",
      name: "",
      description: "",
      unit: "buc",
      price: "",
      priceIncludesVat: false,
      currency: "RON",
      vatRate: 21,
      vatCategory: "S",
      trackStock: true,
      purchasePrice: "",
      ncCode: "",
      barcode: "",
      category: "",
      active: true,
      ...defaults,
    };
  }
  const rate = p.vatCategory === "S" ? p.vatRate : 0;
  // prețul se stochează fără TVA; dacă utilizatorul preferă introducerea cu TVA, îl reafișăm brut
  const shown = p.priceIncludesVat ? round2(p.price * (1 + rate / 100)) : p.price;
  return {
    id: p.id,
    type: p.type,
    code: p.code ?? "",
    name: p.name,
    description: p.description ?? "",
    unit: p.unit,
    price: String(shown),
    priceIncludesVat: p.priceIncludesVat,
    currency: (CURRENCIES as readonly string[]).includes(p.currency) ? (p.currency as Form["currency"]) : "RON",
    vatRate: p.vatRate,
    vatCategory: p.vatCategory,
    trackStock: p.trackStock,
    purchasePrice: p.purchasePrice != null ? String(p.purchasePrice) : "",
    ncCode: p.ncCode ?? "",
    barcode: p.barcode ?? "",
    category: p.category ?? "",
    active: p.active,
  };
}

const num = (s: string) => {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Dialog de creare/editare produs sau serviciu.
 *   <ProductDialog open={o} onOpenChange={setO} product={p} onSaved={(p) => …} />
 * Prețul se salvează mereu fără TVA (conversie automată când „Preț cu TVA inclus” e activ).
 */
export function ProductDialog({
  open,
  onOpenChange,
  product,
  template,
  onSaved,
  onDeleted,
  categories = [],
  defaultName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  product?: ProductLike | null;
  /** Valori de pornire pentru un produs nou (ex. „Duplică”). */
  template?: ProductLike | null;
  onSaved?: (p: Product) => void;
  onDeleted?: (r: { archived: boolean }) => void;
  categories?: string[];
  defaultName?: string;
}) {
  const initialForm = React.useCallback(() => {
    if (product) return toForm(product);
    if (template) return { ...toForm(template), id: null };
    return toForm(null, { name: defaultName ?? "" });
  }, [product, template, defaultName]);
  const [form, setForm] = React.useState<Form>(initialForm);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const { run, pending } = useAction();

  React.useEffect(() => {
    if (open) setForm(initialForm());
  }, [open, initialForm]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const isProduct = form.type === "product";
  const effectiveRate = (form.vatCategory ?? "S") === "S" ? form.vatRate : 0;
  const entered = num(form.price);
  const net = form.priceIncludesVat ? priceWithoutVat(entered, effectiveRate) : entered;
  const gross = form.priceIncludesVat ? entered : round2(entered * (1 + effectiveRate / 100));
  const purchase = num(form.purchasePrice);
  const margin = isProduct && purchase > 0 && net > 0 && form.currency === "RON" ? ((net - purchase) / net) * 100 : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: ProductInput = {
      ...form,
      price: entered,
      purchasePrice: form.purchasePrice === "" ? null : purchase,
      trackStock: isProduct && !!form.trackStock,
    };
    run(() => saveProductAction(payload), {
      onSuccess: (p) => {
        onOpenChange(false);
        onSaved?.(p);
      },
    });
  };

  const remove = async () => {
    if (!product) return;
    const r = await deleteProductAction(product.id);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(r.data.archived ? "Produsul apare pe documente, așa că a fost dezactivat." : "Produs șters");
    onOpenChange(false);
    onDeleted?.(r.data);
  };

  const listId = React.useId();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{product ? `Editează ${product.name}` : isProduct ? "Produs nou" : "Serviciu nou"}</DialogTitle>
            <DialogDescription>Datele se preiau automat pe facturi, avize și în e-Factura.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            <Segmented
              value={form.type}
              onChange={(v) => setForm((f) => ({ ...f, type: v, unit: v === "service" && f.unit === "buc" ? "ora" : v === "product" && f.unit === "ora" ? "buc" : f.unit, trackStock: v === "product" }))}
              options={[
                { value: "product", label: "Produs", icon: <Package /> },
                { value: "service", label: "Serviciu", icon: <Wrench /> },
              ]}
            />

            <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
              <Field label="Cod">
                <Input value={form.code ?? ""} onChange={(e) => set("code", e.target.value)} placeholder="ex. HW-001" className="font-mono text-[13px]" />
              </Field>
              <Field label="Denumire" required>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} required autoFocus={!product} />
              </Field>
            </div>
            <Field label="Descriere" hint="Apare sub denumire pe factură (opțional).">
              <Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={2} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Unitate de măsură">
                <NativeSelect value={form.unit} onChange={(e) => set("unit", e.target.value)}>
                  {UNITS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label} ({u.code})
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Categorie">
                <Input value={form.category ?? ""} onChange={(e) => set("category", e.target.value)} list={listId} placeholder="ex. Hardware" />
                <datalist id={listId}>
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-subtle/60 p-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
                <Field label={form.priceIncludesVat ? "Preț de vânzare (cu TVA)" : "Preț de vânzare (fără TVA)"}>
                  <InputGroup
                    type="number"
                    step="0.0001"
                    min={0}
                    inputMode="decimal"
                    value={form.price}
                    onChange={(e) => set("price", e.target.value)}
                    suffix={form.currency}
                    placeholder="0,00"
                  />
                </Field>
                <Field label="Monedă">
                  <NativeSelect value={form.currency} onChange={(e) => set("currency", e.target.value as Form["currency"])}>
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                <span>
                  Preț cu TVA inclus
                  <span className="block text-xs text-muted-foreground">Introduci prețul final; calculăm automat valoarea fără TVA.</span>
                </span>
                <Switch checked={!!form.priceIncludesVat} onCheckedChange={(v) => set("priceIncludesVat", v)} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Cotă TVA">
                  <NativeSelect value={String(form.vatRate)} onChange={(e) => set("vatRate", Number(e.target.value))} disabled={form.vatCategory !== "S"}>
                    {VAT_RATES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Categorie TVA">
                  <NativeSelect value={form.vatCategory} onChange={(e) => set("vatCategory", e.target.value as Form["vatCategory"])}>
                    {Object.entries(VAT_CATEGORY_LABELS).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center text-xs">
                <div>
                  <div className="text-muted-foreground">Fără TVA</div>
                  <div className="mt-0.5 text-sm font-semibold tabular">{formatMoney(net, form.currency)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">TVA {effectiveRate}%</div>
                  <div className="mt-0.5 text-sm font-semibold tabular">{formatMoney(round2(gross - net), form.currency)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Cu TVA</div>
                  <div className="mt-0.5 text-sm font-semibold tabular">{formatMoney(gross, form.currency)}</div>
                </div>
              </div>
            </div>

            <AnimatePresence initial={false}>
              {isProduct && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="space-y-4 rounded-xl border border-border p-4">
                    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2.5">
                        <span className="grid size-8 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground">
                          <Boxes className="size-4" />
                        </span>
                        <span>
                          Gestiune de stoc
                          <span className="block text-xs text-muted-foreground">Intrări prin NIR, ieșiri automate la facturare.</span>
                        </span>
                      </span>
                      <Switch checked={!!form.trackStock} onCheckedChange={(v) => set("trackStock", v)} />
                    </label>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label="Preț de achiziție" hint={margin != null ? `Marjă ${margin.toFixed(0)}%` : "fără TVA, RON"}>
                        <InputGroup type="number" step="0.01" min={0} inputMode="decimal" value={form.purchasePrice} onChange={(e) => set("purchasePrice", e.target.value)} suffix="RON" />
                      </Field>
                      <Field label="Cod NC" hint="Pentru e-Transport">
                        <Input value={form.ncCode ?? ""} onChange={(e) => set("ncCode", e.target.value.replace(/\D/g, ""))} placeholder="84713000" className="font-mono text-[13px]" inputMode="numeric" />
                      </Field>
                      <Field label="Cod de bare">
                        <InputGroup prefix={<Barcode />} value={form.barcode ?? ""} onChange={(e) => set("barcode", e.target.value)} placeholder="EAN-13" className="font-mono text-[13px]" />
                      </Field>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
              <span>
                Activ
                <span className="block text-xs text-muted-foreground">Produsele inactive nu mai apar la facturare.</span>
              </span>
              <Switch checked={!!form.active} onCheckedChange={(v) => set("active", v)} />
            </label>
          </DialogBody>
          <DialogFooter className="sm:justify-between">
            {product ? (
              <Button type="button" variant="destructive-soft" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Șterge
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Renunță
              </Button>
              <Button type="submit" loading={pending}>
                {product ? "Salvează modificările" : "Adaugă"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
      {product && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          destructive
          title={`Ștergi „${product.name}”?`}
          description="Dacă produsul apare pe facturi, cheltuieli sau în stoc, va fi doar dezactivat — istoricul rămâne intact."
          confirmLabel="Șterge"
          onConfirm={remove}
        />
      )}
    </Dialog>
  );
}
