"use client";

import { ArrowRight, FileStack, PackagePlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/page";
import { STOCK_DOC_LABELS, type Tone } from "@/lib/constants";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { NewDocKind, StockDocRow } from "./types";

export const STOCK_DOC_TONE: Record<string, Tone> = {
  nir: "success",
  opening: "success",
  sale_return: "info",
  consumption: "warning",
  sale: "brand",
  transfer: "info",
  inventory: "neutral",
};

export function StockDocTypeBadge({ type }: { type: string }) {
  const l = STOCK_DOC_LABELS[type];
  return <Badge tone={STOCK_DOC_TONE[type] ?? "neutral"}>{l?.short ?? type}</Badge>;
}

export function StockDocumentsTable({ rows, onOpen, onNew }: { rows: StockDocRow[]; onOpen: (id: string) => void; onNew: (k: NewDocKind) => void }) {
  const columns: Column<StockDocRow>[] = [
    {
      key: "number",
      header: "Document",
      sortValue: (r) => r.number,
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <StockDocTypeBadge type={r.type} />
          <div className="min-w-0">
            <div className="font-medium tabular">{r.number}</div>
            <div className="text-xs text-muted-foreground">{STOCK_DOC_LABELS[r.type]?.label ?? r.type}</div>
          </div>
        </div>
      ),
    },
    { key: "date", header: "Data", sortValue: (r) => r.date, cell: (r) => <span className="tabular">{formatDate(r.date)}</span> },
    {
      key: "warehouse",
      header: "Gestiune",
      sortValue: (r) => r.warehouseName,
      csv: (r) => (r.targetWarehouseName ? `${r.warehouseName} → ${r.targetWarehouseName}` : r.warehouseName),
      cell: (r) =>
        r.targetWarehouseName ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            {r.warehouseName} <ArrowRight className="size-3.5 text-muted-foreground" /> {r.targetWarehouseName}
          </span>
        ) : (
          r.warehouseName
        ),
    },
    {
      key: "partner",
      header: "Partener / sursă",
      hideOnMobile: true,
      sortValue: (r) => r.partnerName ?? "",
      cell: (r) => (
        <div className="max-w-[16rem] min-w-0">
          <div className="truncate">{r.partnerName ?? <span className="text-muted-foreground">—</span>}</div>
          {r.notes && <div className="truncate text-xs text-muted-foreground">{r.notes}</div>}
        </div>
      ),
    },
    { key: "lines", header: "Poziții", align: "right", hideOnMobile: true, sortValue: (r) => r.lines, cell: (r) => formatNumber(r.lines) },
    {
      key: "value",
      header: "Valoare",
      align: "right",
      sortValue: (r) => r.value,
      cell: (r) => <span className={cn("font-medium", r.type === "inventory" && r.value < 0 && "text-danger")}>{formatMoney(r.value)}</span>,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(r) => r.id}
      onRowClick={(r) => onOpen(r.id)}
      search={(r) => `${r.number} ${r.partnerName ?? ""} ${r.warehouseName} ${r.targetWarehouseName ?? ""} ${r.notes ?? ""}`}
      searchPlaceholder="Caută număr, partener, gestiune…"
      filters={[
        {
          key: "type",
          label: "Tip",
          options: [
            { value: "in", label: "Intrări" },
            { value: "out", label: "Ieșiri" },
            { value: "transfer", label: "Transferuri" },
            { value: "inventory", label: "Inventare" },
          ],
          predicate: (r, v) =>
            v === "in" ? ["nir", "opening", "sale_return"].includes(r.type) : v === "out" ? ["sale", "consumption"].includes(r.type) : r.type === v,
        },
      ]}
      csvFilename="documente-stoc"
      defaultSort={{ key: "date", dir: "desc" }}
      empty={
        rows.length === 0 ? (
          <EmptyState
            icon={<FileStack />}
            title="Niciun document de stoc"
            description="Recepțiile (NIR), bonurile de consum, transferurile și inventarele apar aici. Ieșirile din facturi se generează automat."
            action={
              <Button onClick={() => onNew("nir")}>
                <PackagePlus /> Primul NIR
              </Button>
            }
          />
        ) : undefined
      }
    />
  );
}
