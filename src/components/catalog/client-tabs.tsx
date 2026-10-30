"use client";

import { FileText, FolderKanban, Plus, Wallet } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Stagger, StaggerItem } from "@/components/motion";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ColorDot } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BILLING_TYPE_LABELS, DOC_KIND_LABELS, DOC_STATUS, EFACTURA_STATUS, PAYMENT_METHOD_LABELS, PROJECT_STATUS } from "@/lib/constants";
import type { Partner } from "@/lib/db/schema";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PartnerContact } from "./partner-contact";

export type ClientDocRow = {
  id: string;
  kind: "invoice" | "proforma" | "notice";
  isCreditNote: boolean;
  fullNumber: string;
  status: string;
  display: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  total: number;
  paidAmount: number;
  rest: number;
  efacturaStatus: string;
};

export type ClientPaymentRow = {
  id: string;
  date: string;
  amount: number;
  currency: string;
  method: string;
  reference: string | null;
  receiptSeries: string | null;
  receiptNumber: number | null;
  documentId: string | null;
  documentNumber: string | null;
};

export type ClientProjectRow = {
  id: string;
  name: string;
  code: string | null;
  status: string;
  billingType: string;
  color: string;
  startDate: string | null;
  endDate: string | null;
};

function Count({ n }: { n: number }) {
  return <span className="rounded-full bg-muted px-1.5 text-[10.5px] font-semibold text-muted-foreground tabular">{n}</span>;
}

export function ClientTabs({
  partner,
  documents,
  payments,
  projects,
}: {
  partner: Partner;
  documents: ClientDocRow[];
  payments: ClientPaymentRow[];
  projects: ClientProjectRow[];
}) {
  const docColumns: Column<ClientDocRow>[] = [
    {
      key: "number",
      header: "Document",
      sortValue: (r) => r.fullNumber,
      cell: (r) => (
        <div>
          <div className="font-medium tabular">{r.fullNumber}</div>
          <div className="text-xs text-muted-foreground">{r.isCreditNote ? "Factură storno" : DOC_KIND_LABELS[r.kind].one}</div>
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
    { key: "total", header: "Total", align: "right", sortValue: (r) => r.total, cell: (r) => <span className="font-medium">{formatMoney(r.total, r.currency)}</span> },
    {
      key: "rest",
      header: "Rest de încasat",
      align: "right",
      hideOnMobile: true,
      sortValue: (r) => r.rest,
      cell: (r) =>
        r.kind === "invoice" && ["issued", "partially_paid"].includes(r.status) && r.rest > 0 ? (
          <span className={cn(r.display === "overdue" ? "text-danger" : "text-foreground")}>{formatMoney(r.rest, r.currency)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { key: "status", header: "Status", sortValue: (r) => r.display, cell: (r) => <StatusBadge status={r.display} map={DOC_STATUS} /> },
    {
      key: "efactura",
      header: "e-Factura",
      hideOnMobile: true,
      cell: (r) => (r.kind === "invoice" && r.efacturaStatus !== "none" ? <StatusBadge status={r.efacturaStatus} map={EFACTURA_STATUS} /> : <span className="text-xs text-muted-foreground">—</span>),
    },
  ];

  const payColumns: Column<ClientPaymentRow>[] = [
    { key: "date", header: "Data", sortValue: (r) => r.date, cell: (r) => <span className="tabular">{formatDate(r.date)}</span> },
    {
      key: "doc",
      header: "Factură",
      sortValue: (r) => r.documentNumber ?? "",
      cell: (r) => (r.documentNumber ? <span className="font-medium tabular">{r.documentNumber}</span> : <span className="text-muted-foreground">Avans / fără factură</span>),
    },
    { key: "method", header: "Metodă", hideOnMobile: true, sortValue: (r) => r.method, cell: (r) => PAYMENT_METHOD_LABELS[r.method] ?? r.method },
    {
      key: "ref",
      header: "Referință",
      hideOnMobile: true,
      cell: (r) =>
        r.receiptSeries ? (
          <Badge tone="success">
            Chitanță {r.receiptSeries}
            {r.receiptNumber}
          </Badge>
        ) : (
          <span className="text-muted-foreground">{r.reference ?? "—"}</span>
        ),
    },
    { key: "amount", header: "Sumă", align: "right", sortValue: (r) => r.amount, cell: (r) => <span className="font-medium text-success">+{formatMoney(r.amount, r.currency)}</span> },
  ];

  return (
    <Tabs defaultValue="facturi">
      <TabsList>
        <TabsTrigger value="facturi">
          <FileText /> Documente <Count n={documents.length} />
        </TabsTrigger>
        <TabsTrigger value="incasari">
          <Wallet /> Încasări <Count n={payments.length} />
        </TabsTrigger>
        <TabsTrigger value="proiecte">
          <FolderKanban /> Proiecte <Count n={projects.length} />
        </TabsTrigger>
        <TabsTrigger value="contact">Date de contact</TabsTrigger>
      </TabsList>

      <TabsContent value="facturi">
        <DataTable
          rows={documents}
          columns={docColumns}
          getRowId={(r) => r.id}
          search={(r) => `${r.fullNumber} ${r.total}`}
          searchPlaceholder="Caută după număr…"
          rowHref={(r) => `${DOC_KIND_LABELS[r.kind].path}/${r.id}`}
          filters={[
            {
              key: "kind",
              label: "Tip",
              options: [
                { value: "invoice", label: "Facturi" },
                { value: "proforma", label: "Proforme" },
                { value: "notice", label: "Avize" },
              ],
              predicate: (r, v) => r.kind === v,
            },
            {
              key: "pay",
              label: "Plată",
              options: [
                { value: "open", label: "Neîncasate" },
                { value: "overdue", label: "Restante" },
              ],
              predicate: (r, v) => (v === "overdue" ? r.display === "overdue" : r.kind === "invoice" && ["issued", "partially_paid"].includes(r.status)),
            },
          ]}
          csvFilename={`documente-${partner.name}`}
          pageSize={10}
          dense
          empty={
            documents.length === 0 ? (
              <EmptyState
                compact
                icon={<FileText />}
                title="Nicio factură emisă"
                description="Emite prima factură pentru acest client."
                action={
                  <Button asChild size="sm">
                    <Link href={`/facturi/nou?client=${partner.id}`}>
                      <Plus /> Factură nouă
                    </Link>
                  </Button>
                }
              />
            ) : undefined
          }
        />
      </TabsContent>

      <TabsContent value="incasari">
        <DataTable
          rows={payments}
          columns={payColumns}
          getRowId={(r) => r.id}
          rowHref={(r) => (r.documentId ? `/facturi/${r.documentId}` : null)}
          pageSize={10}
          dense
          csvFilename={`incasari-${partner.name}`}
          empty={payments.length === 0 ? <EmptyState compact icon={<Wallet />} title="Nicio încasare" description="Încasările înregistrate pe facturile acestui client apar aici." /> : undefined}
        />
      </TabsContent>

      <TabsContent value="proiecte">
        {projects.length === 0 ? (
          <Card>
            <EmptyState compact icon={<FolderKanban />} title="Niciun proiect" description="Proiectele de outsourcing asociate acestui client vor apărea aici." />
          </Card>
        ) : (
          <Stagger className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => (
              <StaggerItem key={p.id}>
                <Link href={`/proiecte/${p.id}`}>
                  <Card interactive className="h-full p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <ColorDot color={p.color} className="size-3" />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{p.name}</div>
                          {p.code && <div className="text-xs text-muted-foreground">{p.code}</div>}
                        </div>
                      </div>
                      <StatusBadge status={p.status} map={PROJECT_STATUS} />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{BILLING_TYPE_LABELS[p.billingType] ?? p.billingType}</span>
                      <span className="tabular">
                        {p.startDate ? formatDate(p.startDate) : "—"} → {p.endDate ? formatDate(p.endDate) : "în curs"}
                      </span>
                    </div>
                  </Card>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </TabsContent>

      <TabsContent value="contact">
        <PartnerContact partner={partner} />
      </TabsContent>
    </Tabs>
  );
}
