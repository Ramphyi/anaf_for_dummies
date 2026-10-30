"use client";

import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Boxes, Package, Warehouse } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import type { Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/page";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { formatMoney, formatNumber } from "@/lib/format";
import type { StockProductRow, StockReport } from "@/lib/reports/stock";
import { cn, sum } from "@/lib/utils";
import { RankedBars } from "./charts";
import { ExportMenu, ReportTable, TotalCell, type CsvExport } from "./report-kit";

const money = (v: number) => formatMoney(v);
const q = (v: number) => formatNumber(v);

const columns: Column<StockProductRow>[] = [
  {
    key: "name",
    header: "Produs",
    sortValue: (r) => r.name,
    cell: (r) => (
      <div className="max-w-64 min-w-0">
        <div className="truncate font-medium">{r.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {r.code ? `${r.code} · ` : ""}
          {r.warehouse}
        </div>
      </div>
    ),
  },
  { key: "opening", header: "Stoc inițial", align: "right", hideOnMobile: true, sortValue: (r) => r.openingQty, cell: (r) => q(r.openingQty) },
  { key: "in", header: "Intrări", align: "right", sortValue: (r) => r.inQty, cell: (r) => (r.inQty ? <span className="text-success">+{q(r.inQty)}</span> : <span className="text-muted-foreground/50">—</span>) },
  { key: "out", header: "Ieșiri", align: "right", sortValue: (r) => r.outQty, cell: (r) => (r.outQty ? <span className="text-danger">−{q(r.outQty)}</span> : <span className="text-muted-foreground/50">—</span>) },
  {
    key: "closing",
    header: "Stoc final",
    align: "right",
    sortValue: (r) => r.closingQty,
    cell: (r) => (
      <span className={cn("font-medium", r.closingQty < 0 && "text-danger")}>
        {q(r.closingQty)} <span className="text-xs font-normal text-muted-foreground">{r.unit}</span>
      </span>
    ),
  },
  { key: "avg", header: "Cost mediu", align: "right", hideOnMobile: true, sortValue: (r) => r.avgCost, cell: (r) => money(r.avgCost) },
  { key: "value", header: "Valoare", align: "right", sortValue: (r) => r.closingValue, cell: (r) => <span className="font-semibold">{money(r.closingValue)}</span> },
];

export function StockView({ data }: { data: StockReport }) {
  const k = data.kpis;
  if (!data.products.length) {
    return (
      <Card>
        <EmptyState icon={<Boxes />} title="Nicio mișcare de stoc" description="Produsele cu gestiune de stoc apar aici după primul NIR sau sold inițial." />
      </Card>
    );
  }
  const delta = k.openingValue ? ((k.closingValue - k.openingValue) / k.openingValue) * 100 : null;
  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Valoare stoc final" value={k.closingValue} delta={delta} deltaLabel={`față de sold inițial`} icon={<Boxes />} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Intrări (cost)" value={k.inValue} icon={<ArrowDownToLine />} tone="success" hint="NIR, retururi, transferuri primite" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Ieșiri (cost)" value={k.outValue} icon={<ArrowUpFromLine />} tone="danger" hint="vânzări, consum, transferuri trimise" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Produse în stoc" value={k.products} format="number" icon={<Package />} tone={k.negative ? "warning" : "info"} hint={k.negative ? `${k.negative} cu stoc negativ` : "fără stocuri negative"} />
        </StaggerItem>
      </Stagger>

      {k.negative > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            {k.negative} {k.negative === 1 ? "poziție are" : "poziții au"} stoc scriptic negativ — de obicei lipsește un NIR sau o factură a fost descărcată din gestiunea greșită.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="report-section">
          <CardHeaderRow title="Valoare pe gestiune" description="Cost mediu ponderat × cantitate" icon={<Warehouse />} />
          <CardContent>
            <RankedBars
              items={data.warehouses.map((w) => ({ key: w.id, label: w.name, value: w.value, sub: `${w.products} produse${w.isDefault ? " · implicită" : ""}` }))}
              empty="Nicio gestiune."
            />
          </CardContent>
        </Card>
        <Card className="report-section">
          <CardHeaderRow title="Top produse după valoare" description="Toate gestiunile" icon={<Package />} />
          <CardContent>
            <RankedBars color="var(--chart-2)" items={data.topProducts.map((p, i) => ({ key: `${i}`, label: p.name, value: p.value }))} />
          </CardContent>
        </Card>
      </div>

      <Card className="report-section overflow-hidden">
        <CardHeaderRow title="Mișcări pe tip de document" description="Cantități și valori la cost în perioada selectată" icon={<ArrowDownToLine />} />
        {data.movementTypes.length ? (
          <Table>
            <THead>
              <TR className="bg-subtle/50 hover:bg-subtle/50">
                <TH>Tip document</TH>
                <TH className="text-right">Documente</TH>
                <TH className="text-right">Cant. intrată</TH>
                <TH className="text-right">Cant. ieșită</TH>
                <TH className="text-right">Valoare intrări</TH>
                <TH className="text-right">Valoare ieșiri</TH>
              </TR>
            </THead>
            <TBody>
              {data.movementTypes.map((t) => (
                <TR key={t.type}>
                  <TD className="font-medium">{t.label}</TD>
                  <TD className="text-right tabular">{t.documents}</TD>
                  <TD className="text-right tabular">{t.inQty ? q(t.inQty) : "—"}</TD>
                  <TD className="text-right tabular">{t.outQty ? q(t.outQty) : "—"}</TD>
                  <TD className="text-right tabular text-success">{t.inValue ? money(t.inValue) : "—"}</TD>
                  <TD className="text-right tabular text-danger">{t.outValue ? money(t.outValue) : "—"}</TD>
                </TR>
              ))}
            </TBody>
            <TFoot>
              <tr>
                <TotalCell align="left">Total</TotalCell>
                <TotalCell>{sum(data.movementTypes, (t) => t.documents)}</TotalCell>
                <TotalCell>{q(sum(data.movementTypes, (t) => t.inQty))}</TotalCell>
                <TotalCell>{q(sum(data.movementTypes, (t) => t.outQty))}</TotalCell>
                <TotalCell>{money(sum(data.movementTypes, (t) => t.inValue))}</TotalCell>
                <TotalCell>{money(sum(data.movementTypes, (t) => t.outValue))}</TotalCell>
              </tr>
            </TFoot>
          </Table>
        ) : (
          <EmptyState compact icon={<Boxes />} title="Nicio mișcare în perioadă" description="Stocul a rămas neschimbat în intervalul selectat." />
        )}
      </Card>

      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <Package className="size-4 text-primary" /> Situația stocurilor pe produs
          <Badge tone="neutral">{data.products.length}</Badge>
        </h2>
        <ReportTable
          rows={data.products}
          columns={columns}
          getRowId={(r) => r.key}
          search={(r) => `${r.name} ${r.code ?? ""} ${r.category ?? ""}`}
          searchPlaceholder="Caută produs sau cod…"
          filters={
            data.warehouses.length > 1
              ? [{ key: "wh", label: "Gestiune", options: data.warehouses.map((w) => ({ value: w.id, label: w.name })), predicate: (r, v) => r.warehouseId === v }]
              : undefined
          }
          defaultSort={{ key: "value", dir: "desc" }}
          pageSize={20}
          dense
          printTitle="Situația stocurilor"
          footer={(rows) => (
            <tr>
              <TotalCell align="left">Total ({rows.length})</TotalCell>
              <TotalCell className="hidden md:table-cell" />
              <TotalCell />
              <TotalCell />
              <TotalCell />
              <TotalCell className="hidden md:table-cell" />
              <TotalCell>{money(sum(rows, (r) => r.closingValue))}</TotalCell>
            </tr>
          )}
        />
      </div>
    </div>
  );
}

export function StockExport({ data }: { data: StockReport }) {
  const exports: CsvExport[] = [
    {
      label: "Situația stocurilor",
      filename: "stocuri-produse",
      columns: [
        { key: "code", label: "Cod" },
        { key: "name", label: "Produs" },
        { key: "unit", label: "UM" },
        { key: "warehouse", label: "Gestiune" },
        { key: "openingQty", label: "Stoc inițial" },
        { key: "openingValue", label: "Valoare inițială" },
        { key: "inQty", label: "Intrări" },
        { key: "inValue", label: "Valoare intrări" },
        { key: "outQty", label: "Ieșiri" },
        { key: "outValue", label: "Valoare ieșiri" },
        { key: "closingQty", label: "Stoc final" },
        { key: "avgCost", label: "Cost mediu" },
        { key: "closingValue", label: "Valoare finală" },
      ],
      rows: data.products,
    },
    {
      label: "Valoare pe gestiune",
      filename: "stocuri-gestiuni",
      columns: [
        { key: "name", label: "Gestiune" },
        { key: "code", label: "Cod" },
        { key: "products", label: "Produse în stoc" },
        { key: "openingValue", label: "Valoare inițială" },
        { key: "value", label: "Valoare finală" },
      ],
      rows: data.warehouses,
    },
    {
      label: "Mișcări pe tip",
      filename: "stocuri-miscari",
      columns: [
        { key: "label", label: "Tip document" },
        { key: "documents", label: "Documente" },
        { key: "inQty", label: "Cantitate intrată" },
        { key: "outQty", label: "Cantitate ieșită" },
        { key: "inValue", label: "Valoare intrări" },
        { key: "outValue", label: "Valoare ieșiri" },
      ],
      rows: data.movementTypes,
    },
  ];
  return <ExportMenu exports={exports} />;
}
