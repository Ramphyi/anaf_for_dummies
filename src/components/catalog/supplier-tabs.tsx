"use client";

import { PackageCheck, Plus, Receipt, Wallet } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EXPENSE_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import type { Partner } from "@/lib/db/schema";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { PURCHASE_DISPLAY_STATUS } from "@/lib/purchases/schema";
import { cn } from "@/lib/utils";
import { PartnerContact } from "./partner-contact";

export type SupplierPurchaseRow = {
  id: string;
  number: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  total: number;
  paidAmount: number;
  rest: number;
  status: string;
  display: string;
  category: string;
  source: "manual" | "spv";
};

export type SupplierPaymentRow = {
  id: string;
  date: string;
  amount: number;
  currency: string;
  method: string;
  reference: string | null;
  purchaseInvoiceId: string | null;
  number: string | null;
};

export type SupplierReceiptRow = { id: string; number: string; date: string; warehouseName: string; lines: number; value: number };

function Count({ n }: { n: number }) {
  return <span className="rounded-full bg-muted px-1.5 text-[10.5px] font-semibold text-muted-foreground tabular">{n}</span>;
}

export function SupplierTabs({
  partner,
  purchases,
  payments,
  receipts,
}: {
  partner: Partner;
  purchases: SupplierPurchaseRow[];
  payments: SupplierPaymentRow[];
  receipts: SupplierReceiptRow[];
}) {
  const purchaseColumns: Column<SupplierPurchaseRow>[] = [
    {
      key: "number",
      header: "Factură",
      sortValue: (r) => r.number,
      cell: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-medium tabular">{r.number}</span>
          {r.source === "spv" && <Badge tone="brand">SPV</Badge>}
        </div>
      ),
    },
    { key: "date", header: "Data", sortValue: (r) => r.issueDate, cell: (r) => <span className="tabular">{formatDate(r.issueDate)}</span> },
    {
      key: "due",
      header: "Scadență",
      hideOnMobile: true,
      sortValue: (r) => r.dueDate ?? "",
      cell: (r) => <span className={cn("tabular", r.display === "overdue" && "font-medium text-danger")}>{formatDate(r.dueDate)}</span>,
    },
    { key: "category", header: "Categorie", hideOnMobile: true, sortValue: (r) => r.category, cell: (r) => EXPENSE_CATEGORY_LABELS[r.category] ?? r.category },
    { key: "total", header: "Total", align: "right", sortValue: (r) => r.total, cell: (r) => <span className="font-medium">{formatMoney(r.total, r.currency)}</span> },
    {
      key: "rest",
      header: "Rest de plată",
      align: "right",
      hideOnMobile: true,
      sortValue: (r) => r.rest,
      cell: (r) =>
        r.rest > 0 && r.status !== "cancelled" ? (
          <span className={cn(r.display === "overdue" ? "text-danger" : "text-foreground")}>{formatMoney(r.rest, r.currency)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { key: "status", header: "Status", sortValue: (r) => r.display, cell: (r) => <StatusBadge status={r.display} map={PURCHASE_DISPLAY_STATUS} /> },
  ];

  const payColumns: Column<SupplierPaymentRow>[] = [
    { key: "date", header: "Data", sortValue: (r) => r.date, cell: (r) => <span className="tabular">{formatDate(r.date)}</span> },
    { key: "doc", header: "Factură", sortValue: (r) => r.number ?? "", cell: (r) => <span className="font-medium tabular">{r.number ?? "—"}</span> },
    { key: "method", header: "Metodă", hideOnMobile: true, sortValue: (r) => r.method, cell: (r) => PAYMENT_METHOD_LABELS[r.method] ?? r.method },
    { key: "ref", header: "Referință", hideOnMobile: true, cell: (r) => <span className="text-muted-foreground">{r.reference ?? "—"}</span> },
    { key: "amount", header: "Sumă", align: "right", sortValue: (r) => r.amount, cell: (r) => <span className="font-medium">−{formatMoney(r.amount, r.currency)}</span> },
  ];

  const receiptColumns: Column<SupplierReceiptRow>[] = [
    { key: "number", header: "NIR", sortValue: (r) => r.number, cell: (r) => <span className="font-medium tabular">{r.number}</span> },
    { key: "date", header: "Data", sortValue: (r) => r.date, cell: (r) => <span className="tabular">{formatDate(r.date)}</span> },
    { key: "wh", header: "Gestiune", hideOnMobile: true, sortValue: (r) => r.warehouseName, cell: (r) => r.warehouseName },
    { key: "lines", header: "Poziții", align: "right", sortValue: (r) => r.lines, cell: (r) => formatNumber(r.lines) },
    { key: "value", header: "Valoare", align: "right", sortValue: (r) => r.value, cell: (r) => <span className="font-medium">{formatMoney(r.value)}</span> },
  ];

  return (
    <Tabs defaultValue="facturi">
      <TabsList>
        <TabsTrigger value="facturi">
          <Receipt /> Facturi primite <Count n={purchases.length} />
        </TabsTrigger>
        <TabsTrigger value="plati">
          <Wallet /> Plăți <Count n={payments.length} />
        </TabsTrigger>
        <TabsTrigger value="receptii">
          <PackageCheck /> Recepții <Count n={receipts.length} />
        </TabsTrigger>
        <TabsTrigger value="contact">Date de contact</TabsTrigger>
      </TabsList>

      <TabsContent value="facturi">
        <DataTable
          rows={purchases}
          columns={purchaseColumns}
          getRowId={(r) => r.id}
          search={(r) => `${r.number} ${EXPENSE_CATEGORY_LABELS[r.category] ?? ""}`}
          searchPlaceholder="Caută după număr…"
          rowHref={(r) => `/cheltuieli/${r.id}`}
          filters={[
            {
              key: "status",
              label: "Status",
              options: [
                { value: "open", label: "De plată" },
                { value: "overdue", label: "Restante" },
                { value: "paid", label: "Plătite" },
              ],
              predicate: (r, v) => (v === "open" ? r.status === "unpaid" || r.status === "partially_paid" : v === "overdue" ? r.display === "overdue" : r.status === v),
            },
          ]}
          csvFilename={`facturi-${partner.name}`}
          pageSize={10}
          dense
          empty={
            purchases.length === 0 ? (
              <EmptyState
                compact
                icon={<Receipt />}
                title="Nicio factură primită"
                description="Înregistrează manual o cheltuială sau import-o din SPV."
                action={
                  <Button asChild size="sm">
                    <Link href={`/cheltuieli/nou?supplier=${partner.id}`}>
                      <Plus /> Cheltuială nouă
                    </Link>
                  </Button>
                }
              />
            ) : undefined
          }
        />
      </TabsContent>

      <TabsContent value="plati">
        <DataTable
          rows={payments}
          columns={payColumns}
          getRowId={(r) => r.id}
          rowHref={(r) => (r.purchaseInvoiceId ? `/cheltuieli/${r.purchaseInvoiceId}` : null)}
          pageSize={10}
          dense
          csvFilename={`plati-${partner.name}`}
          empty={payments.length === 0 ? <EmptyState compact icon={<Wallet />} title="Nicio plată" description="Plățile înregistrate pe facturile acestui furnizor apar aici." /> : undefined}
        />
      </TabsContent>

      <TabsContent value="receptii">
        <DataTable
          rows={receipts}
          columns={receiptColumns}
          getRowId={(r) => r.id}
          rowHref={(r) => `/stocuri?tab=documente&doc=${r.id}`}
          pageSize={10}
          dense
          empty={
            receipts.length === 0 ? (
              <EmptyState compact icon={<PackageCheck />} title="Nicio recepție" description="NIR-urile pentru marfa primită de la acest furnizor apar aici." />
            ) : undefined
          }
        />
      </TabsContent>

      <TabsContent value="contact">
        <PartnerContact partner={partner} />
      </TabsContent>
    </Tabs>
  );
}
