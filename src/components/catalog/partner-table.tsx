"use client";

import { Building2, Globe2, User, Users } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column, type TableFilter } from "@/components/ui/data-table";
import { Avatar } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/page";
import { Tooltip } from "@/components/ui/popover";
import { countyName } from "@/lib/constants";
import { formatDate, formatMoney, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NewPartnerButton } from "./new-partner-button";

export type PartnerRow = {
  id: string;
  name: string;
  cui: string | null;
  entityType: "pj" | "pf";
  country: string;
  city: string | null;
  county: string | null;
  vatPayer: boolean;
  eInvoiceRegistered: boolean;
  email: string | null;
  phone: string | null;
  kind: "client" | "supplier" | "both";
  total: number;
  balance: number;
  overdue: number;
  lastDate: string | null;
  count: number;
};

export type PartnerMode = "client" | "supplier";

const COPY = {
  client: {
    total: "Total facturat",
    balance: "Sold neîncasat",
    last: "Ultima factură",
    base: "/clienti",
    empty: "Niciun client încă",
    emptyDesc: "Adaugă primul client — preluăm automat datele firmei de la ANAF după CUI.",
    search: "Caută după nume, CUI, oraș…",
    csv: "clienti",
    overdue: "Cu restanțe",
    open: "Cu sold",
  },
  supplier: {
    total: "Total achiziții",
    balance: "Sold de plată",
    last: "Ultima factură",
    base: "/furnizori",
    empty: "Niciun furnizor încă",
    emptyDesc: "Furnizorii apar automat la importul facturilor din SPV sau îi poți adăuga manual.",
    search: "Caută după nume, CUI, oraș…",
    csv: "furnizori",
    overdue: "Scadențe depășite",
    open: "De plată",
  },
} as const;

export function partnerType(p: Pick<PartnerRow, "entityType" | "country">) {
  if (p.country !== "RO") return "extern" as const;
  return p.entityType;
}

export function PartnerTypeBadge({ row }: { row: Pick<PartnerRow, "entityType" | "country"> }) {
  const t = partnerType(row);
  if (t === "extern")
    return (
      <Badge tone="info">
        <Globe2 className="size-3" /> Extern · {row.country}
      </Badge>
    );
  return t === "pf" ? (
    <Badge>
      <User className="size-3" /> PF
    </Badge>
  ) : (
    <Badge>
      <Building2 className="size-3" /> PJ
    </Badge>
  );
}

/** Tabelul de clienți / furnizori (coloanele diferă doar prin etichete). */
export function PartnersTable({ rows, mode }: { rows: PartnerRow[]; mode: PartnerMode }) {
  const c = COPY[mode];

  const columns: Column<PartnerRow>[] = [
    {
      key: "name",
      header: mode === "client" ? "Client" : "Furnizor",
      sortValue: (r) => r.name,
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={r.name} size="sm" color={partnerType(r) === "pf" ? "#0ea5e9" : partnerType(r) === "extern" ? "#14b8a6" : undefined} />
          <div className="min-w-0">
            <div className="max-w-[10rem] truncate font-medium sm:max-w-[16rem]">{r.name}</div>
            <div className="text-xs text-muted-foreground tabular">
              {r.cui ? (r.entityType === "pf" ? `CNP ${r.cui}` : `${r.vatPayer && r.country === "RO" ? "RO" : ""}${r.cui}`) : "Fără CUI"}
            </div>
          </div>
        </div>
      ),
      csv: (r) => r.name,
    },
    // coloană ascunsă — doar pentru exportul CSV
    { key: "cui", header: "CUI", cell: () => null, csv: (r) => r.cui ?? "", className: "hidden", headerClassName: "hidden" },
    {
      key: "city",
      header: "Localitate",
      hideOnMobile: true,
      sortValue: (r) => r.city ?? "",
      cell: (r) =>
        r.city || r.county ? (
          <div className="min-w-0">
            <div className="truncate">{r.city ?? "—"}</div>
            <div className="text-xs text-muted-foreground">{r.country === "RO" ? countyName(r.county) : r.country}</div>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "type",
      header: "Tip",
      hideOnMobile: true,
      sortValue: (r) => partnerType(r),
      cell: (r) => <PartnerTypeBadge row={r} />,
    },
    {
      key: "total",
      header: c.total,
      align: "right",
      sortValue: (r) => r.total,
      cell: (r) =>
        r.count > 0 ? (
          <div>
            <div className="font-medium">{formatMoney(r.total)}</div>
            <div className="text-xs text-muted-foreground">{r.count === 1 ? "1 factură" : `${r.count} facturi`}</div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">fără facturi</span>
        ),
    },
    {
      key: "balance",
      header: c.balance,
      align: "right",
      sortValue: (r) => r.balance,
      cell: (r) =>
        r.balance > 0 ? (
          <div>
            <div className={cn("font-medium", r.overdue > 0 ? "text-danger" : "text-foreground")}>{formatMoney(r.balance)}</div>
            {r.overdue > 0 && (
              <div className="text-xs text-danger/80">{r.overdue + 0.01 >= r.balance ? "scadență depășită" : `${formatMoney(r.overdue)} restant`}</div>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "last",
      header: c.last,
      hideOnMobile: true,
      sortValue: (r) => r.lastDate ?? "",
      cell: (r) =>
        r.lastDate ? (
          <Tooltip content={formatRelative(r.lastDate)}>
            <span className="tabular">{formatDate(r.lastDate)}</span>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "efactura",
      header: "e-Factura",
      align: "center",
      hideOnMobile: true,
      sortValue: (r) => (r.eInvoiceRegistered ? 1 : 0),
      csv: (r) => (r.eInvoiceRegistered ? "Da" : "Nu"),
      cell: (r) =>
        r.eInvoiceRegistered ? (
          <Badge tone="brand" dot>
            RO e-Factura
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  const filters: TableFilter<PartnerRow>[] = [
    {
      key: "type",
      label: "Tip",
      options: [
        { value: "pj", label: "PJ" },
        { value: "pf", label: "PF" },
        { value: "extern", label: "Extern" },
      ],
      predicate: (r, v) => partnerType(r) === v,
    },
    {
      key: "balance",
      label: "Sold",
      options: [
        { value: "open", label: c.open },
        { value: "overdue", label: c.overdue },
      ],
      predicate: (r, v) => (v === "overdue" ? r.overdue > 0 : r.balance > 0),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(r) => r.id}
      search={(r) => [r.name, r.cui, r.city, countyName(r.county), r.email].filter(Boolean).join(" ")}
      searchPlaceholder={c.search}
      filters={filters}
      rowHref={(r) => `${c.base}/${r.id}`}
      csvFilename={c.csv}
      defaultSort={{ key: "total", dir: "desc" }}
      empty={
        rows.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={c.empty}
            description={c.emptyDesc}
            action={<NewPartnerButton kind={mode} />}
          />
        ) : undefined
      }
    />
  );
}
