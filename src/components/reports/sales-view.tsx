"use client";

import { BarChart3, FileText, Package, Percent, Users } from "lucide-react";
import Link from "next/link";
import { Stagger, StaggerItem } from "@/components/motion";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import type { Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/page";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DOC_STATUS } from "@/lib/constants";
import { formatDate, formatMoney, formatNumber, formatPercent, formatRate } from "@/lib/format";
import type { SalesInvoiceRow, SalesReport } from "@/lib/reports/sales";
import { sum } from "@/lib/utils";
import { MonthlyCompareChart, RankedBars } from "./charts";
import { ExportMenu, ReportTable, TotalCell, type CsvExport } from "./report-kit";

type ClientRow = SalesReport["clients"][number];
type ProductRow = SalesReport["products"][number];

const money = (v: number) => formatMoney(v);
const PLURAL: Record<string, [string, string]> = { ora: ["oră", "ore"], luna: ["lună", "luni"], an: ["an", "ani"], zi: ["zi", "zile"], serviciu: ["serviciu", "servicii"], abonament: ["abonament", "abonamente"] };
/** „1.632 ore”, „1 lună” */
function qty(q: number, unit: string) {
  const forms = PLURAL[unit];
  return `${formatNumber(q)} ${forms ? (Math.abs(q) === 1 ? forms[0] : forms[1]) : unit}`;
}

const invoiceColumns: Column<SalesInvoiceRow>[] = [
  {
    key: "number",
    header: "Factura",
    sortValue: (r) => r.fullNumber,
    cell: (r) => (
      <Link href={`/facturi/${r.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-primary hover:underline">
        {r.fullNumber}
      </Link>
    ),
  },
  { key: "date", header: "Data", sortValue: (r) => r.issueDate, csv: (r) => formatDate(r.issueDate), cell: (r) => <span className="tabular">{formatDate(r.issueDate)}</span> },
  {
    key: "client",
    header: "Client",
    sortValue: (r) => r.clientName,
    cell: (r) => (
      <div className="max-w-64 min-w-0">
        <div className="truncate font-medium">{r.clientName}</div>
        {r.clientCui && <div className="text-xs text-muted-foreground">CUI {r.clientCui}</div>}
      </div>
    ),
  },
  {
    key: "currency",
    header: "Valută",
    hideOnMobile: true,
    sortValue: (r) => r.currency,
    cell: (r) =>
      r.currency === "RON" ? (
        <span className="text-muted-foreground">RON</span>
      ) : (
        <span className="text-xs">
          {formatMoney(r.totalOriginal, r.currency)}
          <span className="block text-muted-foreground">curs {formatRate(r.exchangeRate)}</span>
        </span>
      ),
  },
  { key: "net", header: "Valoare fără TVA", align: "right", sortValue: (r) => r.net, cell: (r) => money(r.net) },
  { key: "vat", header: "TVA", align: "right", hideOnMobile: true, sortValue: (r) => r.vat, cell: (r) => money(r.vat) },
  { key: "gross", header: "Total RON", align: "right", sortValue: (r) => r.gross, cell: (r) => <span className="font-semibold">{money(r.gross)}</span> },
  {
    key: "status",
    header: "Status",
    hideOnMobile: true,
    sortValue: (r) => DOC_STATUS[r.status]?.label ?? r.status,
    cell: (r) => (r.isCreditNote ? <Badge tone="danger">Storno</Badge> : <StatusBadge status={r.status} map={DOC_STATUS} />),
  },
];

const clientColumns: Column<ClientRow>[] = [
  { key: "name", header: "Client", sortValue: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
  { key: "cui", header: "CUI", hideOnMobile: true, sortValue: (r) => r.cui ?? "", cell: (r) => <span className="text-muted-foreground">{r.cui ?? "—"}</span> },
  { key: "count", header: "Facturi", align: "right", sortValue: (r) => r.count, cell: (r) => r.count },
  { key: "net", header: "Fără TVA", align: "right", sortValue: (r) => r.net, cell: (r) => money(r.net) },
  { key: "vat", header: "TVA", align: "right", hideOnMobile: true, sortValue: (r) => r.vat, cell: (r) => money(r.vat) },
  { key: "gross", header: "Total", align: "right", sortValue: (r) => r.gross, cell: (r) => <span className="font-semibold">{money(r.gross)}</span> },
  {
    key: "share",
    header: "Pondere",
    align: "right",
    sortValue: (r) => r.share,
    csv: (r) => Number(r.share.toFixed(2)),
    cell: (r) => <span className="text-muted-foreground">{formatPercent(r.share, 1)}</span>,
  },
];

const productColumns: Column<ProductRow>[] = [
  {
    key: "name",
    header: "Produs / serviciu",
    sortValue: (r) => r.name,
    cell: (r) => (
      <div className="max-w-72 min-w-0">
        <div className="truncate font-medium">{r.name}</div>
        <div className="text-xs text-muted-foreground">
          {r.code ? `${r.code} · ` : ""}
          {r.type === "product" ? "Produs" : "Serviciu"}
        </div>
      </div>
    ),
  },
  { key: "quantity", header: "Cantitate", align: "right", sortValue: (r) => r.quantity, cell: (r) => qty(r.quantity, r.unit), csv: (r) => r.quantity },
  { key: "count", header: "Facturi", align: "right", hideOnMobile: true, sortValue: (r) => r.count, cell: (r) => r.count },
  { key: "net", header: "Valoare fără TVA", align: "right", sortValue: (r) => r.net, cell: (r) => <span className="font-semibold">{money(r.net)}</span> },
  { key: "share", header: "Pondere", align: "right", sortValue: (r) => r.share, csv: (r) => Number(r.share.toFixed(2)), cell: (r) => <span className="text-muted-foreground">{formatPercent(r.share, 1)}</span> },
];

export function SalesView({ data }: { data: SalesReport }) {
  const k = data.kpis;
  if (!data.invoices.length) {
    return (
      <Card>
        <EmptyState icon={<FileText />} title="Nicio factură în perioada selectată" description="Alege un alt interval sau emite prima factură pentru a vedea analiza vânzărilor." />
      </Card>
    );
  }
  const seriesMax = Math.max(...data.series.map((s) => Math.abs(s.net)), 1);

  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Venituri (fără TVA)" value={k.net} delta={k.deltaNet} deltaLabel="vs perioada anterioară" spark={k.spark} icon={<BarChart3 />} />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Facturi emise"
            value={k.count}
            format="number"
            delta={k.deltaCount}
            deltaLabel={k.creditNotes ? `${k.creditNotes} storno` : `medie ${formatMoney(k.average).replace(/,\d{2}(?=\s)/, "")}`}
            icon={<FileText />}
            tone="info"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Clienți facturați" value={k.clients} format="number" delta={k.deltaClients} deltaLabel="vs perioada anterioară" icon={<Users />} tone="success" />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Grad de încasare"
            value={k.collectedPct}
            format="percent"
            hint={`TVA colectată ${formatMoney(k.vat).replace(/,\d{2}(?=\s)/, "")}`}
            icon={<Percent />}
            tone={k.collectedPct >= 80 ? "success" : "warning"}
          />
        </StaggerItem>
      </Stagger>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="report-section lg:col-span-2">
          <CardHeaderRow
            title="Venituri pe luni"
            description={`Fără TVA, în RON · anul anterior: ${formatMoney(k.lastYearNet).replace(/,\d{2}(?=\s)/, "")}`}
            icon={<BarChart3 />}
          />
          <CardContent>
            <MonthlyCompareChart data={data.monthly} />
          </CardContent>
        </Card>
        <Card className="report-section">
          <CardHeaderRow title="Pe serii și valute" description="Valoare fără TVA" icon={<FileText />} />
          <CardContent className="space-y-5">
            <div className="space-y-3">
              {data.series.map((s) => (
                <div key={s.series}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">
                      Seria {s.series} <span className="text-xs font-normal text-muted-foreground">· {s.count} doc.</span>
                    </span>
                    <span className="font-semibold tabular">{formatMoney(s.net)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${(Math.abs(s.net) / seriesMax) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Pe monedă</p>
              <ul className="space-y-2 text-sm">
                {data.currencies.map((c) => (
                  <li key={c.currency} className="flex items-baseline justify-between gap-2">
                    <span>
                      <Badge tone={c.currency === "RON" ? "neutral" : "info"}>{c.currency}</Badge>
                      <span className="ml-2 text-xs text-muted-foreground">{c.count} facturi</span>
                    </span>
                    <span className="text-right tabular">
                      {c.currency !== "RON" && <span className="mr-2 text-xs text-muted-foreground">{formatMoney(c.original, c.currency)}</span>}
                      <span className="font-medium">{formatMoney(c.ron)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="report-section">
          <CardHeaderRow title="Top 10 clienți" description="După valoarea facturată fără TVA" icon={<Users />} />
          <CardContent>
            <RankedBars items={data.clients.map((c) => ({ key: c.key, label: c.name, value: c.net, sub: formatPercent(c.share, 1) }))} />
          </CardContent>
        </Card>
        <Card className="report-section">
          <CardHeaderRow title="Top produse & servicii" description="După valoarea facturată fără TVA" icon={<Package />} />
          <CardContent>
            <RankedBars color="var(--chart-2)" items={data.products.map((p) => ({ key: p.key, label: p.name, value: p.net, sub: qty(p.quantity, p.unit) }))} />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="invoices">
        <TabsList className="print:hidden">
          <TabsTrigger value="invoices">
            <FileText /> Facturi <span className="text-xs text-muted-foreground">{data.invoices.length}</span>
          </TabsTrigger>
          <TabsTrigger value="clients">
            <Users /> Clienți <span className="text-xs text-muted-foreground">{data.clients.length}</span>
          </TabsTrigger>
          <TabsTrigger value="products">
            <Package /> Produse & servicii <span className="text-xs text-muted-foreground">{data.products.length}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="invoices" forceMount className="data-[state=inactive]:hidden print:!block">
          <ReportTable
            rows={data.invoices}
            columns={invoiceColumns}
            getRowId={(r) => r.id}
            rowHref={(r) => `/facturi/${r.id}`}
            search={(r) => `${r.fullNumber} ${r.clientName} ${r.clientCui ?? ""}`}
            searchPlaceholder="Caută factură sau client…"
            filters={[
              {
                key: "currency",
                label: "Valută",
                options: [...new Set(data.invoices.map((i) => i.currency))].map((c) => ({ value: c, label: c })),
                predicate: (r, v) => r.currency === v,
              },
            ]}
            defaultSort={{ key: "date", dir: "desc" }}
            pageSize={20}
            dense
            printTitle="Facturi emise"
            footer={(rows) => (
              <tr>
                <TotalCell align="left">Total ({rows.length})</TotalCell>
                <TotalCell />
                <TotalCell />
                <TotalCell className="hidden md:table-cell" />
                <TotalCell>{money(sum(rows, (r) => r.net))}</TotalCell>
                <TotalCell className="hidden md:table-cell">{money(sum(rows, (r) => r.vat))}</TotalCell>
                <TotalCell>{money(sum(rows, (r) => r.gross))}</TotalCell>
                <TotalCell className="hidden md:table-cell" />
              </tr>
            )}
          />
        </TabsContent>
        <TabsContent value="clients" forceMount className="data-[state=inactive]:hidden print:!block">
          <ReportTable
            rows={data.clients}
            columns={clientColumns}
            getRowId={(r) => r.key}
            search={(r) => `${r.name} ${r.cui ?? ""}`}
            searchPlaceholder="Caută client…"
            defaultSort={{ key: "net", dir: "desc" }}
            pageSize={20}
            dense
            printTitle="Vânzări pe client"
          />
        </TabsContent>
        <TabsContent value="products" forceMount className="data-[state=inactive]:hidden print:!block">
          <ReportTable
            rows={data.products}
            columns={productColumns}
            getRowId={(r) => r.key}
            search={(r) => `${r.name} ${r.code ?? ""}`}
            searchPlaceholder="Caută produs sau serviciu…"
            filters={[
              {
                key: "type",
                label: "Tip",
                options: [
                  { value: "service", label: "Servicii" },
                  { value: "product", label: "Produse" },
                ],
                predicate: (r, v) => r.type === v,
              },
            ]}
            defaultSort={{ key: "net", dir: "desc" }}
            pageSize={20}
            dense
            printTitle="Vânzări pe produs / serviciu"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function SalesExport({ data }: { data: SalesReport }) {
  return <ExportMenu exports={salesExports(data)} />;
}

/** Definițiile exporturilor CSV pentru raportul de vânzări. */
function salesExports(data: SalesReport): CsvExport[] {
  return [
    {
      label: "Facturi",
      filename: "vanzari-facturi",
      columns: [
        { key: "number", label: "Număr" },
        { key: "date", label: "Data" },
        { key: "due", label: "Scadența" },
        { key: "client", label: "Client" },
        { key: "cui", label: "CUI" },
        { key: "currency", label: "Valută" },
        { key: "rate", label: "Curs" },
        { key: "original", label: "Total în valută" },
        { key: "net", label: "Valoare fără TVA (RON)" },
        { key: "vat", label: "TVA (RON)" },
        { key: "gross", label: "Total (RON)" },
        { key: "status", label: "Status" },
      ],
      rows: data.invoices.map((i) => ({
        number: i.fullNumber,
        date: formatDate(i.issueDate),
        due: formatDate(i.dueDate),
        client: i.clientName,
        cui: i.clientCui,
        currency: i.currency,
        rate: i.exchangeRate,
        original: i.totalOriginal,
        net: i.net,
        vat: i.vat,
        gross: i.gross,
        status: i.isCreditNote ? "Storno" : (DOC_STATUS[i.status]?.label ?? i.status),
      })),
    },
    {
      label: "Venituri pe luni",
      filename: "vanzari-lunar",
      columns: [
        { key: "month", label: "Luna" },
        { key: "current", label: "Venituri fără TVA (RON)" },
        { key: "previous", label: "Anul anterior (RON)" },
      ],
      rows: data.monthly.map((m) => ({ month: m.long, current: m.current, previous: m.previous })),
    },
    {
      label: "Pe client",
      filename: "vanzari-clienti",
      columns: [
        { key: "name", label: "Client" },
        { key: "cui", label: "CUI" },
        { key: "count", label: "Facturi" },
        { key: "net", label: "Fără TVA (RON)" },
        { key: "vat", label: "TVA (RON)" },
        { key: "gross", label: "Total (RON)" },
        { key: "share", label: "Pondere %" },
      ],
      rows: data.clients.map((c) => ({ ...c, share: Number(c.share.toFixed(2)) })) as Record<string, unknown>[],
    },
    {
      label: "Pe produs / serviciu",
      filename: "vanzari-produse",
      columns: [
        { key: "code", label: "Cod" },
        { key: "name", label: "Denumire" },
        { key: "unit", label: "UM" },
        { key: "quantity", label: "Cantitate" },
        { key: "count", label: "Facturi" },
        { key: "net", label: "Fără TVA (RON)" },
      ],
      rows: data.products as unknown as Record<string, unknown>[],
    },
    {
      label: "Pe serie",
      filename: "vanzari-serii",
      columns: [
        { key: "series", label: "Serie" },
        { key: "count", label: "Documente" },
        { key: "net", label: "Fără TVA (RON)" },
        { key: "gross", label: "Total (RON)" },
      ],
      rows: data.series as unknown as Record<string, unknown>[],
    },
  ];
}
