"use client";

import { ArrowDownLeft, ArrowUpRight, Info, Landmark, Receipt, Scale, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { Stagger, StaggerItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import type { Column } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TBody, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/popover";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/constants";
import { formatDate, formatMoney, formatNumber, formatRate } from "@/lib/format";
import type { PurchaseJournalRow, SalesJournalRow, VatColumn, VatReport } from "@/lib/reports/vat";
import { cn, round2, sum } from "@/lib/utils";
import { VatChart } from "./charts";
import { ExportMenu, ReportTable, TotalCell, type CsvExport } from "./report-kit";

const money = (v: number) => formatMoney(v);
const plain = (v: number) => formatNumber(v, true);

function bucketColumns<T extends { cells: Record<string, { base: number; vat: number }> }>(cols: VatColumn[]): Column<T>[] {
  return cols.flatMap((c) => {
    const base: Column<T> = {
      key: `${c.key}-base`,
      header: c.hasVat ? `Bază ${c.label.replace("Cota ", "")}` : c.label,
      align: "right",
      headerClassName: "bg-muted/40",
      sortValue: (r) => r.cells[c.key]?.base ?? 0,
      cell: (r) => (r.cells[c.key] ? plain(r.cells[c.key].base) : <span className="text-muted-foreground/50">—</span>),
    };
    if (!c.hasVat) return [base];
    return [
      base,
      {
        key: `${c.key}-vat`,
        header: `TVA ${c.label.replace("Cota ", "")}`,
        align: "right",
        sortValue: (r) => r.cells[c.key]?.vat ?? 0,
        cell: (r) => (r.cells[c.key] ? plain(r.cells[c.key].vat) : <span className="text-muted-foreground/50">—</span>),
      } satisfies Column<T>,
    ];
  });
}

function journalFooter<T extends { cells: Record<string, { base: number; vat: number }>; total: number; base: number; vat: number }>(cols: VatColumn[], leading: number) {
  const JournalFooter = (rows: T[]) => (
    <tr>
      <TotalCell align="left">Total ({rows.length})</TotalCell>
      {Array.from({ length: leading - 1 }, (_, i) => (
        <TotalCell key={i} />
      ))}
      <TotalCell>{plain(sum(rows, (r) => r.total))}</TotalCell>
      {cols.flatMap((c) => {
        const cells = [<TotalCell key={`${c.key}-b`}>{plain(round2(sum(rows, (r) => r.cells[c.key]?.base ?? 0)))}</TotalCell>];
        if (c.hasVat) cells.push(<TotalCell key={`${c.key}-v`}>{plain(round2(sum(rows, (r) => r.cells[c.key]?.vat ?? 0)))}</TotalCell>);
        return cells;
      })}
    </tr>
  );
  return JournalFooter;
}

function salesColumns(cols: VatColumn[]): Column<SalesJournalRow>[] {
  return [
    {
      key: "number",
      header: "Nr. document",
      sortValue: (r) => r.number,
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <Link href={`/facturi/${r.id}`} className="font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
            {r.number}
          </Link>
          {r.isCreditNote && <Badge tone="danger">storno</Badge>}
        </span>
      ),
    },
    { key: "date", header: "Data", sortValue: (r) => r.date, csv: (r) => formatDate(r.date), cell: (r) => <span className="tabular">{formatDate(r.date)}</span> },
    {
      key: "partner",
      header: "Client",
      sortValue: (r) => r.partner,
      cell: (r) => (
        <div className="max-w-56 min-w-0">
          <div className="truncate font-medium">{r.partner}</div>
          <div className="text-xs text-muted-foreground">
            {r.cui ? `CUI ${r.cui}` : "—"}
            {r.country !== "RO" ? ` · ${r.country}` : ""}
            {r.currency !== "RON" ? ` · ${r.currency} curs ${formatNumber(r.exchangeRate)}` : ""}
          </div>
        </div>
      ),
    },
    { key: "total", header: "Total cu TVA", align: "right", sortValue: (r) => r.total, cell: (r) => <span className="font-semibold">{plain(r.total)}</span> },
    ...bucketColumns<SalesJournalRow>(cols),
  ];
}

function purchaseColumns(cols: VatColumn[]): Column<PurchaseJournalRow>[] {
  return [
    { key: "number", header: "Nr. document", sortValue: (r) => r.number, cell: (r) => <span className="font-medium">{r.number}</span> },
    { key: "date", header: "Data", sortValue: (r) => r.date, csv: (r) => formatDate(r.date), cell: (r) => <span className="tabular">{formatDate(r.date)}</span> },
    {
      key: "partner",
      header: "Furnizor",
      sortValue: (r) => r.partner,
      cell: (r) => (
        <div className="max-w-56 min-w-0">
          <div className="truncate font-medium">{r.partner}</div>
          <div className="text-xs text-muted-foreground">
            {r.cui ? `CUI ${r.cui}` : "—"} · {EXPENSE_CATEGORY_LABELS[r.category] ?? r.category}
          </div>
        </div>
      ),
    },
    { key: "total", header: "Total cu TVA", align: "right", sortValue: (r) => r.total, cell: (r) => <span className="font-semibold">{plain(r.total)}</span> },
    ...bucketColumns<PurchaseJournalRow>(cols),
  ];
}

function Note({ tone = "info", children }: { tone?: "info" | "warning"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
        tone === "warning" ? "border-warning/30 bg-warning-soft text-warning-soft-foreground" : "border-info/25 bg-info-soft text-info-soft-foreground",
      )}
    >
      <Info className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1 leading-relaxed">{children}</div>
    </div>
  );
}

function ResultBadge({ value }: { value: number }) {
  if (Math.abs(value) < 0.01) return <Badge tone="neutral">Zero</Badge>;
  return value > 0 ? <Badge tone="warning">De plată</Badge> : <Badge tone="success">De recuperat</Badge>;
}

export function VatView({ data }: { data: VatReport }) {
  const t = data.totals;
  const sCols = salesColumns(data.salesColumns);
  const pCols = purchaseColumns(data.purchaseColumns);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {!data.vatPayer && (
          <Note tone="warning">
            <p>
              <strong>Firma nu este înregistrată în scopuri de TVA.</strong> Jurnalele sunt informative — nu se depune decont D300.
            </p>
          </Note>
        )}
        {data.vatOnCollection && (
          <Note>
            <p>
              <strong>Firma aplică sistemul TVA la încasare (art. 282 Cod fiscal).</strong> Jurnalele de mai jos sunt întocmite la data facturii, dar TVA-ul devine exigibil
              doar la încasare, iar cel aferent achizițiilor se deduce doar la plată. Tabelul „Exigibilitate la încasare” estimează TVA-ul efectiv de declarat din încasările
              și plățile perioadei.
            </p>
          </Note>
        )}
        {t.exemptBase !== 0 && (
          <Note>
            <p>
              Operațiunile fără TVA colectată (taxare inversă, scutite, intracomunitare, export) însumează <strong>{money(t.exemptBase)}</strong>. Prestările de servicii
              către clienți din UE cu taxare inversă se raportează în D300 (rd. 3) și în declarația recapitulativă D390.
            </p>
          </Note>
        )}
      </div>

      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="TVA colectată" value={t.collected} icon={<ArrowUpRight />} hint={`bază ${money(t.salesBase).replace(/,\d{2}(?=\s)/, "")} · ${t.salesCount} facturi`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="TVA deductibilă" value={t.deductible} icon={<ArrowDownLeft />} tone="info" hint={`bază ${money(t.purchaseBase).replace(/,\d{2}(?=\s)/, "")} · ${t.purchaseCount} facturi`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label={t.balance >= 0 ? "TVA de plată (estimat)" : "TVA de recuperat (estimat)"}
            value={Math.abs(t.balance)}
            icon={<Scale />}
            tone={t.balance >= 0 ? "warning" : "success"}
            hint="colectată − deductibilă"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Operațiuni fără TVA" value={t.exemptBase} icon={<Landmark />} tone="brand" hint={`${t.foreignCount} facturi în valută`} />
        </StaggerItem>
      </Stagger>

      <Card className="report-section">
        <CardHeaderRow
          title="Decont estimat pe luni"
          description="Estimare pe baza facturilor emise și primite — verifică întotdeauna cu contabilul înainte de depunerea D300."
          icon={<Scale />}
        />
        <CardContent className="space-y-5">
          {data.decont.length > 1 && <VatChart data={data.decont} />}
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <THead>
                <TR className="bg-subtle/50 hover:bg-subtle/50">
                  <TH>Luna</TH>
                  <TH className="text-right">Bază vânzări</TH>
                  <TH className="text-right">TVA colectată</TH>
                  <TH className="text-right">Bază achiziții</TH>
                  <TH className="text-right">TVA deductibilă</TH>
                  <TH className="text-right">Sold TVA</TH>
                  <TH className="text-right">Rezultat</TH>
                </TR>
              </THead>
              <TBody>
                {data.decont.map((m) => (
                  <TR key={m.key}>
                    <TD className="font-medium capitalize">{m.long}</TD>
                    <TD className="text-right tabular">{plain(m.salesBase)}</TD>
                    <TD className="text-right tabular">{plain(m.collected)}</TD>
                    <TD className="text-right tabular">{plain(m.purchaseBase)}</TD>
                    <TD className="text-right tabular">{plain(m.deductible)}</TD>
                    <TD className={cn("text-right font-semibold tabular", m.balance > 0 ? "text-warning" : m.balance < 0 ? "text-success" : "")}>{plain(Math.abs(m.balance))}</TD>
                    <TD className="text-right">
                      <ResultBadge value={m.balance} />
                    </TD>
                  </TR>
                ))}
              </TBody>
              <TFoot>
                <tr>
                  <TotalCell align="left">Total perioadă</TotalCell>
                  <TotalCell>{plain(t.salesBase)}</TotalCell>
                  <TotalCell>{plain(t.collected)}</TotalCell>
                  <TotalCell>{plain(t.purchaseBase)}</TotalCell>
                  <TotalCell>{plain(t.deductible)}</TotalCell>
                  <TotalCell className="font-semibold">{plain(Math.abs(t.balance))}</TotalCell>
                  <TotalCell>
                    <ResultBadge value={t.balance} />
                  </TotalCell>
                </tr>
              </TFoot>
            </Table>
          </div>
        </CardContent>
      </Card>

      {data.cashVat && (
        <Card className="report-section">
          <CardHeaderRow
            title="Exigibilitate la încasare"
            description="TVA aferentă încasărilor și plăților efectuate în perioadă (proporțional cu soldul fiecărei facturi)."
            icon={<Receipt />}
          />
          <CardContent>
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <THead>
                  <TR className="bg-subtle/50 hover:bg-subtle/50">
                    <TH>Luna</TH>
                    <TH className="text-right">TVA exigibilă din încasări</TH>
                    <TH className="text-right">TVA deductibilă din plăți</TH>
                    <TH className="text-right">Sold</TH>
                    <TH className="text-right">Rezultat</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.cashVat.map((m) => (
                    <TR key={m.key}>
                      <TD className="font-medium">{m.label}</TD>
                      <TD className="text-right tabular">{plain(m.collected)}</TD>
                      <TD className="text-right tabular">{plain(m.deductible)}</TD>
                      <TD className="text-right font-semibold tabular">{plain(Math.abs(m.balance))}</TD>
                      <TD className="text-right">
                        <ResultBadge value={m.balance} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="sales">
        <TabsList className="print:hidden">
          <TabsTrigger value="sales">
            <ArrowUpRight /> Jurnal de vânzări <span className="text-xs text-muted-foreground">{data.sales.length}</span>
          </TabsTrigger>
          <TabsTrigger value="purchases">
            <ShoppingCart /> Jurnal de cumpărări <span className="text-xs text-muted-foreground">{data.purchases.length}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="sales" forceMount className="space-y-2 data-[state=inactive]:hidden print:!block">
          <ColumnLegend cols={data.salesColumns} />
          <ReportTable
            rows={data.sales}
            columns={sCols}
            getRowId={(r) => r.id}
            search={(r) => `${r.number} ${r.partner} ${r.cui ?? ""}`}
            searchPlaceholder="Caută document sau client…"
            defaultSort={{ key: "date", dir: "asc" }}
            pageSize={25}
            dense
            printTitle="Jurnal de vânzări"
            footer={journalFooter<SalesJournalRow>(data.salesColumns, 3)}
          />
        </TabsContent>
        <TabsContent value="purchases" forceMount className="space-y-2 data-[state=inactive]:hidden print:!block">
          <ColumnLegend cols={data.purchaseColumns} />
          <ReportTable
            rows={data.purchases}
            columns={pCols}
            getRowId={(r) => r.id}
            search={(r) => `${r.number} ${r.partner} ${r.cui ?? ""}`}
            searchPlaceholder="Caută document sau furnizor…"
            defaultSort={{ key: "date", dir: "asc" }}
            pageSize={25}
            dense
            printTitle="Jurnal de cumpărări"
            footer={journalFooter<PurchaseJournalRow>(data.purchaseColumns, 3)}
          />
        </TabsContent>
      </Tabs>
      <p className="text-xs text-muted-foreground">
        Valorile sunt în RON; documentele în valută sunt convertite la cursul de pe factură. TVA-ul se calculează pe cotă la nivel de document, exact ca la emitere.
      </p>
    </div>
  );
}

function ColumnLegend({ cols }: { cols: VatColumn[] }) {
  if (!cols.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 print:hidden">
      {cols.map((c) => (
        <Tooltip key={c.key} content={c.hint}>
          <span className="inline-flex cursor-help items-center rounded-full bg-muted px-2 py-0.5 text-[11.5px] font-medium text-muted-foreground">{c.label}</span>
        </Tooltip>
      ))}
    </div>
  );
}

export function VatExport({ data }: { data: VatReport }) {
  const journalCols = (cols: VatColumn[]) =>
    cols.flatMap((c) => (c.hasVat ? [{ key: `${c.key}_b`, label: `Bază ${c.label}` }, { key: `${c.key}_v`, label: `TVA ${c.label}` }] : [{ key: `${c.key}_b`, label: c.label }]));
  const flatten = (cells: Record<string, { base: number; vat: number }>) =>
    Object.fromEntries(Object.entries(cells).flatMap(([k, v]) => [[`${k}_b`, v.base], [`${k}_v`, v.vat]]));

  const exports: CsvExport[] = [
    {
      label: "Jurnal de vânzări",
      filename: "jurnal-vanzari",
      columns: [
        { key: "number", label: "Nr. document" },
        { key: "date", label: "Data" },
        { key: "partner", label: "Client" },
        { key: "cui", label: "CUI" },
        { key: "country", label: "Țara" },
        { key: "currency", label: "Valută" },
        { key: "rate", label: "Curs" },
        { key: "total", label: "Total cu TVA (RON)" },
        ...journalCols(data.salesColumns),
        { key: "base", label: "Total bază" },
        { key: "vat", label: "Total TVA" },
      ],
      rows: data.sales.map((r) => ({
        number: r.number,
        date: formatDate(r.date),
        partner: r.partner,
        cui: r.cui,
        country: r.country,
        currency: r.currency,
        rate: r.exchangeRate,
        total: r.total,
        base: r.base,
        vat: r.vat,
        ...flatten(r.cells),
      })),
    },
    {
      label: "Jurnal de cumpărări",
      filename: "jurnal-cumparari",
      columns: [
        { key: "number", label: "Nr. document" },
        { key: "date", label: "Data" },
        { key: "partner", label: "Furnizor" },
        { key: "cui", label: "CUI" },
        { key: "category", label: "Categorie" },
        { key: "total", label: "Total cu TVA (RON)" },
        ...journalCols(data.purchaseColumns),
        { key: "base", label: "Total bază" },
        { key: "vat", label: "Total TVA" },
      ],
      rows: data.purchases.map((r) => ({
        number: r.number,
        date: formatDate(r.date),
        partner: r.partner,
        cui: r.cui,
        category: EXPENSE_CATEGORY_LABELS[r.category] ?? r.category,
        total: r.total,
        base: r.base,
        vat: r.vat,
        ...flatten(r.cells),
      })),
    },
    {
      label: "Decont estimat",
      filename: "decont-tva-estimat",
      columns: [
        { key: "month", label: "Luna" },
        { key: "salesBase", label: "Bază vânzări" },
        { key: "collected", label: "TVA colectată" },
        { key: "exemptBase", label: "Operațiuni fără TVA" },
        { key: "purchaseBase", label: "Bază achiziții" },
        { key: "deductible", label: "TVA deductibilă" },
        { key: "balance", label: "Sold (+ de plată / − de recuperat)" },
      ],
      rows: data.decont.map((m) => ({ ...m, month: m.long })),
    },
  ];
  return <ExportMenu exports={exports} />;
}
