"use client";

import { Boxes, PackagePlus } from "lucide-react";
import { AnimatedBar, Stagger, StaggerItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/page";
import { UNITS } from "@/lib/constants";
import { formatMoney, formatNumber } from "@/lib/format";
import { STOCK_STATE_LABELS, stockState } from "@/lib/products/schema";
import { cn, round2 } from "@/lib/utils";
import type { LevelRow, NewDocKind, WarehouseInfo } from "./types";

const unitLabel = (u: string) => UNITS.find((x) => x.value === u)?.label ?? u;

export function StockLevelsTable({ rows, warehouses, onNew }: { rows: LevelRow[]; warehouses: WarehouseInfo[]; onNew: (k: NewDocKind) => void }) {
  const totalValue = warehouses.reduce((s, w) => s + Math.max(0, w.value), 0);

  const columns: Column<LevelRow>[] = [
    {
      key: "product",
      header: "Produs",
      sortValue: (r) => r.productName,
      csv: (r) => r.productName,
      cell: (r) => (
        <div className="min-w-0">
          <div className="max-w-[18rem] truncate font-medium">{r.productName}</div>
          {r.productCode && <div className="font-mono text-[11.5px] text-muted-foreground">{r.productCode}</div>}
          <div className="text-xs text-muted-foreground md:hidden">{r.warehouseName}</div>
        </div>
      ),
    },
    { key: "code", header: "Cod", cell: () => null, csv: (r) => r.productCode ?? "", className: "hidden", headerClassName: "hidden" },
    { key: "warehouse", header: "Gestiune", hideOnMobile: true, sortValue: (r) => r.warehouseName, cell: (r) => <span className="text-muted-foreground">{r.warehouseName}</span> },
    {
      key: "qty",
      header: "Cantitate",
      align: "right",
      sortValue: (r) => r.quantity,
      cell: (r) => {
        const st = stockState(r.quantity);
        return (
          <span className={cn("font-semibold tabular", st === "negative" && "text-danger", st === "low" && "text-warning", st === "out" && "text-muted-foreground")}>
            {formatNumber(r.quantity)} <span className="text-xs font-normal text-muted-foreground">{unitLabel(r.unit)}</span>
          </span>
        );
      },
    },
    { key: "avg", header: "Cost mediu", align: "right", hideOnMobile: true, sortValue: (r) => r.avgCost, cell: (r) => formatMoney(r.avgCost) },
    { key: "value", header: "Valoare", align: "right", sortValue: (r) => r.value, cell: (r) => <span className="font-medium">{formatMoney(r.value)}</span> },
    {
      key: "state",
      header: "Stare",
      hideOnMobile: true,
      sortValue: (r) => ["negative", "out", "low", "ok"].indexOf(stockState(r.quantity)),
      csv: (r) => STOCK_STATE_LABELS[stockState(r.quantity)].label,
      cell: (r) => {
        const st = stockState(r.quantity);
        return (
          <Badge tone={STOCK_STATE_LABELS[st].tone} dot pulse={st === "negative"}>
            {STOCK_STATE_LABELS[st].label}
          </Badge>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      {warehouses.length > 1 && (
        <Stagger className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {warehouses.map((w) => (
            <StaggerItem key={w.id}>
              <Card className="p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{w.name}</span>
                  <span className="text-xs text-muted-foreground tabular">{totalValue > 0 ? Math.round((Math.max(0, w.value) / totalValue) * 100) : 0}%</span>
                </div>
                <div className="mt-1 text-lg font-semibold tracking-tight tabular">{formatMoney(w.value)}</div>
                <AnimatedBar value={totalValue > 0 ? (Math.max(0, w.value) / totalValue) * 100 : 0} className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted" />
                <div className="mt-2 text-xs text-muted-foreground">{w.productCount} produse în stoc</div>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.key}
        rowHref={(r) => `/stocuri?tab=fisa&produs=${r.productId}&gestiune=${r.warehouseId}`}
        search={(r) => `${r.productName} ${r.productCode ?? ""} ${r.warehouseName}`}
        searchPlaceholder="Caută produs sau cod…"
        filters={[
          ...(warehouses.length > 1 && warehouses.length <= 5
            ? [{ key: "wh", label: "Gestiune", options: warehouses.map((w) => ({ value: w.id, label: w.name })), predicate: (r: LevelRow, v: string) => r.warehouseId === v }]
            : []),
          {
            key: "state",
            label: "Stare",
            options: [
              { value: "low", label: "Stoc scăzut" },
              { value: "out", label: "Epuizat" },
              { value: "negative", label: "Negativ" },
            ],
            predicate: (r, v) => stockState(r.quantity) === v,
          },
        ]}
        csvFilename="situatie-stocuri"
        defaultSort={{ key: "product", dir: "asc" }}
        rowClassName={(r) => (r.quantity < 0 ? "bg-danger-soft/40" : undefined)}
        footer={(list) => (
          <tr>
            {columns.map((c, i) => (
              <td key={c.key} className={cn("px-3 py-3 text-sm first:pl-5 last:pr-5", c.align === "right" && "text-right tabular", c.hideOnMobile && "hidden md:table-cell", c.className)}>
                {i === 0 ? <span className="text-xs text-muted-foreground">{list.length} poziții</span> : c.key === "value" ? formatMoney(round2(list.reduce((s, r) => s + r.value, 0))) : null}
              </td>
            ))}
          </tr>
        )}
        empty={
          rows.length === 0 ? (
            <EmptyState
              icon={<Boxes />}
              title="Niciun produs cu gestiune de stoc"
              description="Activează „Gestiune de stoc” pe produsele fizice, apoi recepționează marfa prin NIR."
              action={
                <Button onClick={() => onNew("nir")}>
                  <PackagePlus /> NIR nou
                </Button>
              }
            />
          ) : undefined
        }
      />
    </div>
  );
}
