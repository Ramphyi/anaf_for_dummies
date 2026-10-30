"use client";

import { ArrowDownLeft, ArrowUpRight, Scale, ScrollText } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Stagger, StaggerItem } from "@/components/motion";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DataTable, type Column } from "@/components/ui/data-table";
import { NativeSelect } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/page";
import { STOCK_DOC_LABELS, UNITS } from "@/lib/constants";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { cn, round2 } from "@/lib/utils";
import { StockDocTypeBadge } from "./stock-documents";
import type { StockCardRow, TrackedProductInfo, WarehouseInfo } from "./types";

const unitLabel = (u: string) => UNITS.find((x) => x.value === u)?.label ?? u;

/** Fișa magaziei: mișcările cronologice ale unui produs, cu sold cumulat. */
export function StockCardPanel({
  rows,
  products,
  warehouses,
  productId,
  warehouseId,
  onOpenDoc,
}: {
  rows: StockCardRow[] | null;
  products: TrackedProductInfo[];
  warehouses: WarehouseInfo[];
  productId: string | null;
  warehouseId: string | null;
  onOpenDoc: (id: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const product = products.find((p) => p.id === productId) ?? null;
  const unit = product ? unitLabel(product.unit) : "";

  const go = (p: string | null, w: string | null) => {
    const q = new URLSearchParams({ tab: "fisa" });
    if (p) q.set("produs", p);
    if (w) q.set("gestiune", w);
    startTransition(() => router.replace(`/stocuri?${q.toString()}`, { scroll: false }));
  };

  const list = rows ?? [];
  const totalIn = round2(list.reduce((s, r) => s + r.in, 0));
  const totalOut = round2(list.reduce((s, r) => s + r.out, 0));
  const balance = list.length ? list[list.length - 1].balance : 0;
  const avgCost = list.length ? list[list.length - 1].avgCost : (product?.purchasePrice ?? 0);

  const columns: Column<StockCardRow>[] = [
    { key: "date", header: "Data", cell: (r) => <span className="tabular">{formatDate(r.date)}</span>, csv: (r) => r.date },
    {
      key: "doc",
      header: "Document",
      csv: (r) => r.docNumber,
      cell: (r) => (
        <div className="flex items-center gap-2">
          <StockDocTypeBadge type={r.docType} />
          <div className="min-w-0">
            <div className="font-medium tabular">{r.docNumber}</div>
            <div className="max-w-[16rem] truncate text-xs text-muted-foreground">{r.notes ?? STOCK_DOC_LABELS[r.docType]?.label}</div>
          </div>
        </div>
      ),
    },
    ...(warehouseId ? [] : [{ key: "wh", header: "Gestiune", hideOnMobile: true, csv: (r: StockCardRow) => r.warehouseName, cell: (r: StockCardRow) => <span className="text-muted-foreground">{r.warehouseName}</span> }]),
    {
      key: "in",
      header: "Intrări",
      align: "right",
      csv: (r) => r.in,
      cell: (r) => (r.in ? <span className="font-medium text-success">+{formatNumber(r.in)}</span> : <span className="text-muted-foreground/50">—</span>),
    },
    {
      key: "out",
      header: "Ieșiri",
      align: "right",
      csv: (r) => r.out,
      cell: (r) => (r.out ? <span className="font-medium text-danger">−{formatNumber(r.out)}</span> : <span className="text-muted-foreground/50">—</span>),
    },
    { key: "cost", header: "Cost unitar", align: "right", hideOnMobile: true, csv: (r) => r.unitCost, cell: (r) => formatMoney(r.unitCost) },
    {
      key: "balance",
      header: "Sold",
      align: "right",
      csv: (r) => r.balance,
      cell: (r) => (
        <span className={cn("font-semibold", r.balance < 0 && "text-danger")}>
          {formatNumber(r.balance)} <span className="text-xs font-normal text-muted-foreground">{unit}</span>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <Combobox
            options={products.map((p) => ({ value: p.id, label: p.name, description: p.code ?? undefined, keywords: [p.code ?? ""] }))}
            value={productId}
            onChange={(v) => go(v || null, warehouseId)}
            placeholder="Alege produsul pentru fișa magaziei…"
            searchPlaceholder="Caută după denumire sau cod…"
          />
        </div>
        <div className="shrink-0 sm:w-56">
          <NativeSelect value={warehouseId ?? ""} onChange={(e) => go(productId, e.target.value || null)} aria-label="Gestiune">
            <option value="">Toate gestiunile</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </Card>

      {!product ? (
        <Card>
          <EmptyState
            icon={<ScrollText />}
            title="Alege un produs"
            description="Fișa magaziei arată toate intrările și ieșirile produsului, în ordine cronologică, cu soldul după fiecare mișcare."
          />
        </Card>
      ) : (
        <div className={cn("space-y-4 transition-opacity", pending && "opacity-60")}>
          <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4" key={`${productId}-${warehouseId}`}>
            {[
              { label: "Total intrări", value: `+${formatNumber(totalIn)} ${unit}`, icon: <ArrowDownLeft />, cls: "text-success" },
              { label: "Total ieșiri", value: `−${formatNumber(totalOut)} ${unit}`, icon: <ArrowUpRight />, cls: "text-danger" },
              { label: "Sold final", value: `${formatNumber(balance)} ${unit}`, icon: <Scale />, cls: balance < 0 ? "text-danger" : "" },
              { label: "Cost mediu ponderat", value: formatMoney(avgCost), icon: <ScrollText />, cls: "" },
            ].map((k) => (
              <StaggerItem key={k.label}>
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground [&_svg]:size-3.5">
                    {k.icon} {k.label}
                  </div>
                  <div className={cn("mt-1.5 text-lg font-semibold tracking-tight tabular", k.cls)}>{k.value}</div>
                </Card>
              </StaggerItem>
            ))}
          </Stagger>
          <DataTable
            rows={list}
            columns={columns}
            getRowId={(r) => r.id}
            onRowClick={(r) => onOpenDoc(r.docId)}
            pageSize={50}
            dense
            csvFilename={`fisa-magaziei-${product.code ?? product.name}`}
            empty={<EmptyState compact icon={<ScrollText />} title="Nicio mișcare" description="Produsul nu are încă intrări sau ieșiri în această gestiune." />}
            footer={
              list.length
                ? () => (
                    <tr>
                      {columns.map((c, i) => (
                        <td key={c.key} className={cn("px-3 py-2.5 text-sm first:pl-5 last:pr-5", c.align === "right" && "text-right tabular", c.hideOnMobile && "hidden md:table-cell")}>
                          {i === 0 ? (
                            <span className="text-xs text-muted-foreground">{list.length} mișcări</span>
                          ) : c.key === "in" ? (
                            <span className="text-success">+{formatNumber(totalIn)}</span>
                          ) : c.key === "out" ? (
                            <span className="text-danger">−{formatNumber(totalOut)}</span>
                          ) : c.key === "balance" ? (
                            <span className="font-semibold">{formatNumber(balance)}</span>
                          ) : null}
                        </td>
                      ))}
                    </tr>
                  )
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
