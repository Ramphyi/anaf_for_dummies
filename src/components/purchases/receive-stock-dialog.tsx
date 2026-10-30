"use client";

import { PackageCheck } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { receivePurchaseStockAction } from "@/app/(app)/cheltuieli/actions";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { useAction } from "@/hooks/use-action";
import { formatMoney } from "@/lib/format";
import { guessProduct, type TrackedProduct } from "@/lib/purchases/match";
import { cn, round2 } from "@/lib/utils";

export type ReceiveLine = { id: string; name: string; unit: string; quantity: number; unitPrice: number; productId: string | null };
export type { TrackedProduct };
export type WarehouseOption = { id: string; name: string; isDefault: boolean };

/** Recepție în stoc (NIR) pentru liniile unei facturi primite. */
export function ReceiveStockDialog({
  purchase,
  lines,
  products,
  warehouses,
  open,
  onOpenChange,
}: {
  purchase: { id: string; number: string; supplierName: string; issueDate: string; currency: string; exchangeRate: number };
  lines: ReceiveLine[];
  products: TrackedProduct[];
  warehouses: WarehouseOption[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  type Row = { lineId: string; include: boolean; productId: string | null; quantity: string; unitCost: string };
  const build = React.useCallback(
    (): Row[] =>
      lines.map((l) => {
        const productId = guessProduct(l, products);
        return {
          lineId: l.id,
          include: !!productId && l.quantity > 0,
          productId,
          quantity: String(Math.abs(l.quantity)),
          unitCost: String(round2(l.unitPrice * purchase.exchangeRate)),
        };
      }),
    [lines, products, purchase.exchangeRate],
  );
  const [rows, setRows] = React.useState<Row[]>(build);
  const [warehouseId, setWarehouseId] = React.useState(() => (warehouses.find((w) => w.isDefault) ?? warehouses[0])?.id ?? "");
  const [date, setDate] = React.useState(purchase.issueDate);
  const { run, pending } = useAction();

  React.useEffect(() => {
    if (open) setRows(build());
  }, [open, build]);

  const set = (lineId: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.lineId === lineId ? { ...r, ...patch } : r)));
  const chosen = rows.filter((r) => r.include && r.productId);
  const value = round2(chosen.reduce((s, r) => s + Number(r.quantity) * Number(r.unitCost), 0));
  const options = products.map((p) => ({ value: p.id, label: p.name, description: p.code ?? undefined, keywords: [p.code ?? ""] }));

  const submit = () =>
    run(
      () =>
        receivePurchaseStockAction({
          purchaseInvoiceId: purchase.id,
          warehouseId,
          date,
          lines: chosen.map((r) => ({ lineId: r.lineId, productId: r.productId!, quantity: Number(r.quantity), unitCost: Number(r.unitCost) })),
        }),
      { onSuccess: () => onOpenChange(false), refresh: true },
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="size-5 text-primary" /> Recepție în stoc (NIR)
          </DialogTitle>
          <DialogDescription>
            Asociază liniile facturii {purchase.number} ({purchase.supplierName}) cu produsele gestionate. Costul de intrare se calculează în RON
            {purchase.currency !== "RON" && ` (curs ${purchase.exchangeRate})`}.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {products.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nu ai produse cu gestiune de stoc.{" "}
              <Link href="/produse?nou=1" className="font-medium text-primary hover:underline">
                Adaugă un produs
              </Link>{" "}
              și activează „Gestiune de stoc”.
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Gestiune">
                  <NativeSelect value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                        {w.isDefault ? " (implicită)" : ""}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Data recepției">
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="dark:[color-scheme:dark]" />
                </Field>
              </div>
              <div className="space-y-2">
                {lines.map((l) => {
                  const r = rows.find((x) => x.lineId === l.id)!;
                  return (
                    <div
                      key={l.id}
                      className={cn(
                        "grid gap-3 rounded-xl border p-3 transition-colors sm:grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_6rem_7rem] sm:items-center",
                        r.include ? "border-primary/30 bg-primary-soft/40" : "border-border bg-subtle/40",
                      )}
                    >
                      <Checkbox checked={r.include} onCheckedChange={(v) => set(l.id, { include: !!v })} aria-label="Include linia" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{l.name}</div>
                        <div className="text-xs text-muted-foreground tabular">
                          {l.quantity} {l.unit} × {formatMoney(l.unitPrice, purchase.currency)}
                        </div>
                      </div>
                      <Combobox
                        options={options}
                        value={r.productId}
                        onChange={(v) => set(l.id, { productId: v || null, include: !!v })}
                        placeholder="Alege produsul…"
                        searchPlaceholder="Caută produs gestionat…"
                        className="h-8 text-[13px]"
                      />
                      <Input type="number" step="any" value={r.quantity} onChange={(e) => set(l.id, { quantity: e.target.value })} className="h-8 text-right" aria-label="Cantitate" disabled={!r.include} />
                      <Input type="number" step="0.01" value={r.unitCost} onChange={(e) => set(l.id, { unitCost: e.target.value })} className="h-8 text-right" aria-label="Cost unitar RON" disabled={!r.include} />
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">Liniile fără produs asociat (ex. transport, servicii) nu intră în stoc. Coloanele: cantitate, cost unitar fără TVA (RON).</p>
            </>
          )}
        </DialogBody>
        <DialogFooter className="sm:items-center sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {chosen.length} {chosen.length === 1 ? "poziție" : "poziții"} · valoare <span className="font-semibold text-foreground tabular">{formatMoney(value)}</span>
          </span>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Renunță
            </Button>
            <Button onClick={submit} loading={pending} disabled={!chosen.length || !warehouseId}>
              <PackageCheck /> Generează NIR
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
