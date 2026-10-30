"use client";

import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { EfacturaBadge } from "@/components/anaf/efactura-badge";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column, type TableFilter } from "@/components/ui/data-table";
import { ColorDot } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/page";
import { DOC_STATUS, EFACTURA_STATUS } from "@/lib/constants";
import type { DocKind } from "@/lib/db/schema";
import { formatDate, formatMoney, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { docHref, KIND_META } from "./shared";

export type DocRow = {
  id: string;
  fullNumber: string;
  isCreditNote: boolean;
  clientName: string;
  clientCui: string | null;
  issueDate: string;
  dueDate: string | null;
  total: number;
  currency: string;
  exchangeRate: number;
  paidAmount: number;
  remaining: number;
  status: string;
  efacturaStatus: string;
  efacturaSimulated: boolean;
  projectName: string | null;
  projectColor: string | null;
};

const STATUS_FILTERS: Record<DocKind, [string, string][]> = {
  invoice: [
    ["draft", "Ciorne"],
    ["issued", "Emise"],
    ["partially_paid", "Parțial"],
    ["paid", "Încasate"],
    ["overdue", "Restante"],
    ["cancelled", "Anulate"],
    ["storned", "Stornate"],
  ],
  proforma: [
    ["draft", "Ciorne"],
    ["issued", "Emise"],
    ["converted", "Facturate"],
    ["cancelled", "Anulate"],
  ],
  notice: [
    ["draft", "Ciorne"],
    ["issued", "Nefacturate"],
    ["converted", "Facturate"],
    ["cancelled", "Anulate"],
  ],
};

export function DocumentsTable({ kind, rows, initialStatus }: { kind: DocKind; rows: DocRow[]; initialStatus?: string | null }) {
  const meta = KIND_META[kind];
  const isInvoice = kind === "invoice";
  const today = todayIso();

  const columns: Column<DocRow>[] = [
    {
      key: "number",
      header: "Număr",
      sortValue: (r) => r.fullNumber,
      cell: (r) => (
        <div className="flex items-center gap-2">
          <span className={cn("font-medium", r.status === "draft" && "text-muted-foreground")}>{r.fullNumber}</span>
          {r.isCreditNote && <Badge tone="danger">Storno</Badge>}
        </div>
      ),
    },
    {
      key: "client",
      header: "Client",
      sortValue: (r) => r.clientName,
      cell: (r) => (
        <div className="max-w-[260px] min-w-0">
          <p className="truncate">{r.clientName}</p>
          {r.projectName ? (
            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <ColorDot color={r.projectColor ?? "#6d5dfc"} className="size-2" /> {r.projectName}
            </p>
          ) : (
            r.clientCui && <p className="truncate text-xs text-muted-foreground">{r.clientCui}</p>
          )}
        </div>
      ),
    },
    {
      key: "date",
      header: "Dată",
      sortValue: (r) => r.issueDate,
      csv: (r) => formatDate(r.issueDate),
      cell: (r) => <span className="tabular">{formatDate(r.issueDate)}</span>,
      hideOnMobile: true,
    },
    ...(kind !== "notice"
      ? [
          {
            key: "due",
            header: kind === "proforma" ? "Valabilă până la" : "Scadență",
            sortValue: (r: DocRow) => r.dueDate ?? "",
            csv: (r: DocRow) => formatDate(r.dueDate),
            hideOnMobile: true,
            cell: (r: DocRow) => (
              <span
                className={cn(
                  "tabular",
                  r.status === "overdue" && "font-medium text-danger",
                  kind === "proforma" && r.status === "issued" && r.dueDate && r.dueDate < today && "text-warning",
                )}
              >
                {formatDate(r.dueDate)}
              </span>
            ),
          } satisfies Column<DocRow>,
        ]
      : []),
    {
      key: "total",
      header: "Total",
      align: "right",
      sortValue: (r) => r.total * r.exchangeRate,
      csv: (r) => r.total,
      cell: (r) => (
        <div>
          <p className={cn("font-medium", r.total < 0 && "text-danger")}>{formatMoney(r.total, r.currency)}</p>
          {r.currency !== "RON" && <p className="text-xs text-muted-foreground">{formatMoney(r.total * r.exchangeRate, "RON")}</p>}
        </div>
      ),
    },
    ...(isInvoice
      ? [
          {
            key: "remaining",
            header: "Rest de plată",
            align: "right",
            hideOnMobile: true,
            sortValue: (r: DocRow) => r.remaining * r.exchangeRate,
            csv: (r: DocRow) => r.remaining,
            cell: (r: DocRow) =>
              r.isCreditNote || ["draft", "cancelled", "storned"].includes(r.status) ? (
                <span className="text-muted-foreground">—</span>
              ) : r.remaining > 0 ? (
                <span className={cn("font-medium", r.status === "overdue" && "text-danger")}>{formatMoney(r.remaining, r.currency)}</span>
              ) : (
                <span className="text-success">0,00</span>
              ),
          } satisfies Column<DocRow>,
        ]
      : []),
    {
      key: "status",
      header: "Status",
      sortValue: (r) => DOC_STATUS[r.status]?.label ?? r.status,
      cell: (r) => <StatusBadge status={r.status} map={DOC_STATUS} />,
    },
    ...(isInvoice
      ? [
          {
            key: "efactura",
            header: "e-Factura",
            hideOnMobile: true,
            sortValue: (r: DocRow) => EFACTURA_STATUS[r.efacturaStatus]?.label ?? r.efacturaStatus,
            cell: (r: DocRow) =>
              r.status === "draft" ? (
                <span className="text-xs text-muted-foreground">—</span>
              ) : (
                <EfacturaBadge status={r.efacturaStatus} simulated={r.efacturaSimulated} />
              ),
          } satisfies Column<DocRow>,
        ]
      : []),
  ];

  const filters: TableFilter<DocRow>[] = [
    {
      key: "status",
      label: "Status",
      options: STATUS_FILTERS[kind].map(([value, label]) => ({ value, label })),
      predicate: (r, v) => r.status === v,
    },
    ...(isInvoice
      ? [
          {
            key: "efactura",
            label: "e-Factura",
            options: [
              { value: "none", label: "Netrimise" },
              { value: "processing", label: "În lucru" },
              { value: "ok", label: "Validate" },
              { value: "failed", label: "Respinse" },
            ],
            predicate: (r: DocRow, v: string) =>
              r.status !== "draft" &&
              (v === "failed"
                ? r.efacturaStatus === "nok" || r.efacturaStatus === "error"
                : v === "processing"
                  ? ["processing", "pending"].includes(r.efacturaStatus)
                  : r.efacturaStatus === v),
          } satisfies TableFilter<DocRow>,
        ]
      : []),
  ];

  const sumRon = (list: DocRow[], pick: (r: DocRow) => number) =>
    list.filter((r) => !["draft", "cancelled"].includes(r.status)).reduce((a, r) => a + pick(r) * r.exchangeRate, 0);

  return (
    <DataTable
      key={initialStatus ?? "all"}
      rows={rows}
      columns={columns}
      getRowId={(r) => r.id}
      rowHref={(r) => docHref(kind, r.id)}
      search={(r) => `${r.fullNumber} ${r.clientName} ${r.clientCui ?? ""} ${r.projectName ?? ""} ${r.total}`}
      searchPlaceholder={`Caută după număr, client sau CUI…`}
      filters={filters}
      defaultFilters={initialStatus ? { status: initialStatus } : undefined}
      defaultSort={{ key: "date", dir: "desc" }}
      csvFilename={`${meta.many.toLowerCase().replace(/\s+/g, "-")}-${today}`}
      rowClassName={(r) => (r.status === "cancelled" ? "opacity-60" : undefined)}
      empty={
        rows.length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title={{ invoice: "Nicio factură încă", proforma: "Nicio proformă încă", notice: "Niciun aviz încă" }[kind]}
            description={
              kind === "invoice"
                ? "Emite prima factură — numerotarea, TVA-ul și XML-ul e-Factura se generează automat."
                : kind === "proforma"
                  ? "Trimite oferte clienților și transformă-le în factură cu un singur clic."
                  : "Avizele însoțesc marfa la livrare și pot fi facturate ulterior."
            }
            action={
              <Button asChild>
                <Link href={`${meta.path}/nou`}>
                  <Plus /> {meta.newLabel}
                </Link>
              </Button>
            }
          />
        ) : undefined
      }
      footer={(list) => (
        <tr>
          {columns.map((c, i) => (
            <td
              key={c.key}
              className={cn("px-3 py-3 text-sm first:pl-5 last:pr-5", c.align === "right" && "text-right tabular", c.hideOnMobile && "hidden md:table-cell")}
            >
              {i === 0 ? (
                <span className="text-muted-foreground">{list.length} documente</span>
              ) : c.key === "total" ? (
                formatMoney(
                  sumRon(list, (r) => r.total),
                  "RON",
                )
              ) : c.key === "remaining" ? (
                formatMoney(
                  sumRon(list, (r) => (r.isCreditNote ? 0 : r.remaining)),
                  "RON",
                )
              ) : null}
            </td>
          ))}
        </tr>
      )}
    />
  );
}
