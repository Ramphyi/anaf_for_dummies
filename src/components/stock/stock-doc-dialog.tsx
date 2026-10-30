"use client";

import { ArrowLeftRight, PackageMinus, PackagePlus, Plus, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { createStockDocAction } from "@/app/(app)/stocuri/actions";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, InputGroup, NativeSelect } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { UNITS } from "@/lib/constants";
import { formatMoney, formatNumber, todayIso } from "@/lib/format";
import { cn, round2 } from "@/lib/utils";
import type { LevelRow, SupplierLite, TrackedProductInfo, WarehouseInfo } from "./types";

type Kind = "nir" | "consumption" | "transfer";
type Line = { key: number; productId: string | null; quantity: string; unitCost: string };

const META: Record<Kind, { title: string; description: string; icon: React.ReactNode; submit: string }> = {
  nir: { title: "NIR — notă de intrare-recepție", description: "Intrare de marfă în gestiune, la costul de achiziție (fără TVA).", icon: <PackagePlus />, submit: "Generează NIR" },
  consumption: { title: "Bon de consum", description: "Scoatere din gestiune pentru consum intern, la cost mediu ponderat.", icon: <PackageMinus />, submit: "Emite bonul" },
  transfer: { title: "Transfer între gestiuni", description: "Mută marfa dintr-o gestiune în alta, la cost mediu.", icon: <ArrowLeftRight />, submit: "Transferă" },
};

const unitLabel = (u: string) => UNITS.find((x) => x.value === u)?.label ?? u;

export function StockDocDialog({
  kind,
  open,
  onOpenChange,
  products,
  warehouses,
  suppliers,
  levels,
  defaultSupplierId,
}: {
  kind: Kind;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  products: TrackedProductInfo[];
  warehouses: WarehouseInfo[];
  suppliers: SupplierLite[];
  levels: LevelRow[];
  defaultSupplierId?: string | null;
}) {
  const keyRef = React.useRef(0);
  const newLine = (): Line => ({ key: ++keyRef.current, productId: null, quantity: "1", unitCost: "" });
  const defaultWh = (warehouses.find((w) => w.isDefault) ?? warehouses[0])?.id ?? "";
  const [warehouseId, setWarehouseId] = React.useState(defaultWh);
  const [targetId, setTargetId] = React.useState("");
  const [date, setDate] = React.useState(todayIso());
  const [partnerId, setPartnerId] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const { run, pending } = useAction();
  const meta = META[kind];
  const isOut = kind !== "nir";

  React.useEffect(() => {
    if (!open) return;
    setWarehouseId(defaultWh);
    setTargetId(warehouses.find((w) => w.id !== defaultWh)?.id ?? "");
    setDate(todayIso());
    setPartnerId(defaultSupplierId && suppliers.some((s) => s.id === defaultSupplierId) ? defaultSupplierId : null);
    setNotes("");
    setLines([newLine()]);
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind]);

  const level = (productId: string | null) => levels.find((l) => l.productId === productId && l.warehouseId === warehouseId);
  const productOf = (id: string | null) => products.find((p) => p.id === id);
  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const options = products.map((p) => {
    const lvl = levels.find((l) => l.productId === p.id && l.warehouseId === warehouseId);
    return {
      value: p.id,
      label: p.name,
      description: [p.code, isOut ? `disponibil ${formatNumber(lvl?.quantity ?? 0)} ${unitLabel(p.unit)}` : p.purchasePrice != null ? `cost ${formatMoney(p.purchasePrice)}` : null]
        .filter(Boolean)
        .join(" · "),
      keywords: [p.code ?? ""],
    };
  });

  const costOf = (l: Line) => (isOut ? (level(l.productId)?.avgCost ?? productOf(l.productId)?.purchasePrice ?? 0) : Number(l.unitCost) || 0);
  const total = round2(lines.reduce((s, l) => s + (l.productId ? (Number(l.quantity) || 0) * costOf(l) : 0), 0));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!warehouseId) errs.warehouse = "Alege gestiunea";
    if (kind === "transfer" && (!targetId || targetId === warehouseId)) errs.target = "Alege o gestiune destinație diferită";
    const filled = lines.filter((l) => l.productId);
    if (!filled.length) errs.lines = "Adaugă cel puțin un produs";
    for (const l of filled) {
      const q = Number(l.quantity);
      if (!(q > 0)) errs[`l${l.key}`] = "Cantitate invalidă";
      else if (isOut) {
        const totalForProduct = filled.filter((x) => x.productId === l.productId).reduce((s, x) => s + (Number(x.quantity) || 0), 0);
        const avail = level(l.productId)?.quantity ?? 0;
        if (totalForProduct > avail + 1e-9) errs[`l${l.key}`] = `Disponibil doar ${formatNumber(avail)}`;
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    run(
      () =>
        createStockDocAction({
          type: kind,
          date,
          warehouseId,
          targetWarehouseId: kind === "transfer" ? targetId : null,
          partnerId: kind === "nir" ? partnerId : null,
          notes,
          lines: filled.map((l) => ({ productId: l.productId!, quantity: Number(l.quantity), unitCost: kind === "nir" ? Number(l.unitCost) || 0 : null })),
        }),
      { onSuccess: () => onOpenChange(false), refresh: true, success: (d) => `${d.number} a fost creat` },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 [&_svg]:size-5 [&_svg]:text-primary">
              {meta.icon} {meta.title}
            </DialogTitle>
            <DialogDescription>{meta.description}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={kind === "transfer" ? "Din gestiunea" : "Gestiune"} error={errors.warehouse}>
                <NativeSelect value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              {kind === "transfer" && (
                <Field label="În gestiunea" error={errors.target}>
                  <NativeSelect value={targetId} onChange={(e) => setTargetId(e.target.value)} aria-invalid={!!errors.target || undefined}>
                    <option value="">Alege…</option>
                    {warehouses
                      .filter((w) => w.id !== warehouseId)
                      .map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                  </NativeSelect>
                </Field>
              )}
              {kind === "nir" && (
                <Field label="Furnizor (opțional)">
                  <Combobox
                    options={suppliers.map((s) => ({ value: s.id, label: s.name, description: s.cui ? `CUI ${s.cui}` : undefined, keywords: [s.cui ?? ""] }))}
                    value={partnerId}
                    onChange={(v) => setPartnerId(v || null)}
                    placeholder="Fără furnizor"
                    searchPlaceholder="Caută furnizor…"
                    allowClear
                  />
                </Field>
              )}
              <Field label="Data">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="dark:[color-scheme:dark]" />
              </Field>
            </div>
            {kind === "transfer" && warehouses.length < 2 && (
              <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">Ai o singură gestiune. Adaugă încă una din tab-ul „Gestiuni” pentru a face transferuri.</p>
            )}

            <div className="space-y-2">
              <div className="hidden grid-cols-[minmax(0,1fr)_8rem_8.5rem_7rem_2rem] gap-2 px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase sm:grid">
                <span>Produs</span>
                <span className="text-right">Cantitate</span>
                <span className="text-right">{isOut ? "Cost mediu" : "Cost unitar"}</span>
                <span className="text-right">Valoare</span>
                <span />
              </div>
              {errors.lines && <p className="text-xs font-medium text-danger">{errors.lines}</p>}
              <AnimatePresence initial={false}>
                {lines.map((l) => {
                  const p = productOf(l.productId);
                  const lvl = level(l.productId);
                  const err = errors[`l${l.key}`];
                  const cost = costOf(l);
                  return (
                    <motion.div
                      key={l.key}
                      layout
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-2 gap-2 rounded-xl border border-border p-2.5 sm:grid-cols-[minmax(0,1fr)_8rem_8.5rem_7rem_2rem] sm:items-start sm:border-0 sm:p-0.5">
                        <div className="col-span-2 sm:col-span-1">
                          <Combobox
                            options={options}
                            value={l.productId}
                            onChange={(v) => {
                              const prod = productOf(v);
                              setLine(l.key, { productId: v || null, unitCost: l.unitCost || (prod?.purchasePrice != null ? String(prod.purchasePrice) : "") });
                            }}
                            placeholder="Alege produsul…"
                            searchPlaceholder="Caută după denumire sau cod…"
                            invalid={!!err}
                          />
                          {(err || (isOut && p)) && (
                            <p className={cn("mt-1 text-xs", err ? "font-medium text-danger" : "text-muted-foreground")}>
                              {err ?? `Disponibil în gestiune: ${formatNumber(lvl?.quantity ?? 0)} ${unitLabel(p!.unit)}`}
                            </p>
                          )}
                        </div>
                        <InputGroup
                          type="number"
                          step="any"
                          min={0}
                          value={l.quantity}
                          onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                          suffix={p ? unitLabel(p.unit) : undefined}
                          className="text-right"
                          aria-label="Cantitate"
                        />
                        {isOut ? (
                          <div className="flex h-9 items-center justify-end px-1 text-sm text-muted-foreground tabular">{formatMoney(cost)}</div>
                        ) : (
                          <InputGroup type="number" step="0.01" min={0} value={l.unitCost} onChange={(e) => setLine(l.key, { unitCost: e.target.value })} suffix="RON" className="text-right" aria-label="Cost unitar" />
                        )}
                        <div className="flex h-9 items-center justify-end px-1 text-sm font-semibold tabular">{formatMoney(round2((Number(l.quantity) || 0) * cost))}</div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="justify-self-end"
                          onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [newLine()]))}
                          aria-label="Șterge linia"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              <Button type="button" variant="ghost" size="sm" className="w-full border border-dashed border-border" onClick={() => setLines((ls) => [...ls, newLine()])}>
                <Plus /> Adaugă produs
              </Button>
            </div>

            <Field label="Observații">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={kind === "consumption" ? "ex. echipare birou nou" : kind === "nir" ? "ex. factura nr. …" : ""} />
            </Field>
          </DialogBody>
          <DialogFooter className="sm:items-center sm:justify-between">
            <span className="text-sm text-muted-foreground">
              Valoare totală <span className="font-semibold text-foreground tabular">{formatMoney(total)}</span>
            </span>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Renunță
              </Button>
              <Button type="submit" loading={pending} disabled={kind === "transfer" && warehouses.length < 2}>
                {meta.submit}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
