"use client";

import { ClipboardCheck, Search } from "lucide-react";
import * as React from "react";
import { createInventoryAction } from "@/app/(app)/stocuri/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Segmented } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { UNITS } from "@/lib/constants";
import { formatMoney, formatNumber, todayIso } from "@/lib/format";
import { cn, round2 } from "@/lib/utils";
import type { LevelRow, TrackedProductInfo, WarehouseInfo } from "./types";

const unitLabel = (u: string) => UNITS.find((x) => x.value === u)?.label ?? u;

/**
 * Inventar: pentru gestiunea aleasă se listează produsele gestionate cu stocul scriptic;
 * se introduce cantitatea faptică, iar diferența se salvează ca mișcare de inventar.
 */
export function InventoryDialog({
  open,
  onOpenChange,
  products,
  warehouses,
  levels,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  products: TrackedProductInfo[];
  warehouses: WarehouseInfo[];
  levels: LevelRow[];
}) {
  const defaultWh = (warehouses.find((w) => w.isDefault) ?? warehouses[0])?.id ?? "";
  const [warehouseId, setWarehouseId] = React.useState(defaultWh);
  const [date, setDate] = React.useState(todayIso());
  const [notes, setNotes] = React.useState("");
  const [counted, setCounted] = React.useState<Record<string, string>>({});
  const [query, setQuery] = React.useState("");
  const [view, setView] = React.useState<"all" | "diff">("all");
  const { run, pending } = useAction();

  const rows = React.useMemo(
    () =>
      products
        .map((p) => {
          const lvl = levels.find((l) => l.productId === p.id && l.warehouseId === warehouseId);
          return { ...p, scriptic: lvl?.quantity ?? 0, avgCost: lvl?.avgCost || p.purchasePrice || 0 };
        })
        .filter((p) => p.active || p.scriptic !== 0),
    [products, levels, warehouseId],
  );

  React.useEffect(() => {
    if (!open) return;
    setWarehouseId(defaultWh);
    setDate(todayIso());
    setNotes("");
    setQuery("");
    setView("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // la schimbarea gestiunii, faptic = scriptic (se modifică doar diferențele)
  React.useEffect(() => {
    setCounted(Object.fromEntries(rows.map((r) => [r.id, String(r.scriptic)])));
  }, [rows]);

  const withDiff = rows.map((r) => {
    const c = counted[r.id];
    const value = c === undefined || c === "" ? r.scriptic : Number(c);
    const delta = round2((Number.isFinite(value) ? value : r.scriptic) - r.scriptic);
    return { ...r, value, delta };
  });
  const diffs = withDiff.filter((r) => Math.abs(r.delta) >= 0.005);
  const deltaValue = round2(diffs.reduce((s, r) => s + r.delta * r.avgCost, 0));
  const q = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const shown = withDiff.filter(
    (r) =>
      (view === "all" || Math.abs(r.delta) >= 0.005) &&
      (!q ||
        `${r.name} ${r.code ?? ""}`
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .includes(q)),
  );

  const submit = () =>
    run(
      () =>
        createInventoryAction({
          date,
          warehouseId,
          notes,
          counts: diffs.map((r) => ({ productId: r.id, counted: r.value })),
        }),
      { onSuccess: () => onOpenChange(false), refresh: true, success: (d) => `${d.number}: ${d.differences} ${d.differences === 1 ? "diferență înregistrată" : "diferențe înregistrate"}` },
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-5 text-primary" /> Inventar
          </DialogTitle>
          <DialogDescription>Introdu cantitățile numărate fizic. Se salvează doar diferențele față de stocul scriptic, la cost mediu.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Gestiune">
              <NativeSelect value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Data inventarului" hint="Stocul scriptic afișat este cel curent.">
              <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className="dark:[color-scheme:dark]" />
            </Field>
            <Field label="Comisie / observații">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ex. inventar anual" />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Caută produs…" className="h-8 pl-9" />
            </div>
            <Segmented
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: "all", label: `Toate (${rows.length})` },
                { value: "diff", label: `Diferențe (${diffs.length})` },
              ]}
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-border">
            <div className="scrollbar-thin max-h-[42vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-subtle">
                  <tr className="border-b border-border text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    <th className="px-3 py-2 text-left">Produs</th>
                    <th className="px-3 py-2 text-right">Scriptic</th>
                    <th className="w-32 px-3 py-2 text-right">Faptic</th>
                    <th className="px-3 py-2 text-right">Diferență</th>
                    <th className="hidden px-3 py-2 text-right sm:table-cell">Valoare</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} className={cn("border-b border-border/60 last:border-0", Math.abs(r.delta) >= 0.005 && "bg-warning-soft/40")}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.name}</div>
                        {r.code && <div className="font-mono text-[11px] text-muted-foreground">{r.code}</div>}
                      </td>
                      <td className={cn("px-3 py-2 text-right whitespace-nowrap tabular", r.scriptic < 0 && "text-danger")}>
                        {formatNumber(r.scriptic)} <span className="text-xs text-muted-foreground">{unitLabel(r.unit)}</span>
                      </td>
                      <td className="px-3 py-1.5">
                        <Input
                          type="number"
                          step="any"
                          min={0}
                          value={counted[r.id] ?? ""}
                          onChange={(e) => setCounted((c) => ({ ...c, [r.id]: e.target.value }))}
                          className="h-8 text-right"
                          aria-label={`Cantitate faptică ${r.name}`}
                        />
                      </td>
                      <td className={cn("px-3 py-2 text-right font-medium tabular", r.delta > 0 && "text-success", r.delta < 0 && "text-danger", r.delta === 0 && "text-muted-foreground")}>
                        {r.delta > 0 ? "+" : ""}
                        {formatNumber(r.delta)}
                      </td>
                      <td className="hidden px-3 py-2 text-right text-muted-foreground tabular sm:table-cell">{r.delta ? formatMoney(round2(r.delta * r.avgCost)) : "—"}</td>
                    </tr>
                  ))}
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        {view === "diff" ? "Nicio diferență încă — modifică stocul faptic acolo unde nu corespunde." : "Niciun produs gestionat."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </DialogBody>
        <DialogFooter className="sm:items-center sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {diffs.length} {diffs.length === 1 ? "diferență" : "diferențe"} · impact{" "}
            <span className={cn("font-semibold tabular", deltaValue < 0 ? "text-danger" : deltaValue > 0 ? "text-success" : "text-foreground")}>{formatMoney(deltaValue)}</span>
          </span>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Renunță
            </Button>
            <Button onClick={submit} loading={pending} disabled={!diffs.length || withDiff.some((r) => r.value < 0)}>
              <ClipboardCheck /> Înregistrează inventarul
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
