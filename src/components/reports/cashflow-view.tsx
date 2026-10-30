"use client";

import { ArrowDownLeft, ArrowUpRight, CalendarClock, CreditCard, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { AnimatedBar, Stagger, StaggerItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import type { Column } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/format";
import type { CashPaymentRow, CashflowReport } from "@/lib/reports/cashflow";
import { cn, sum } from "@/lib/utils";
import { CumulativeChart, InOutChart, SERIES } from "./charts";
import { ExportMenu, ReportTable, TotalCell, type CsvExport } from "./report-kit";

const money = (v: number) => formatMoney(v);
const short = (v: number) => formatMoney(v).replace(/,\d{2}(?=\s)/, "");

const columns: Column<CashPaymentRow>[] = [
  { key: "date", header: "Data", sortValue: (r) => r.date, csv: (r) => formatDate(r.date), cell: (r) => <span className="tabular">{formatDate(r.date)}</span> },
  {
    key: "direction",
    header: "Tip",
    sortValue: (r) => r.direction,
    csv: (r) => (r.direction === "in" ? "Încasare" : "Plată"),
    cell: (r) =>
      r.direction === "in" ? (
        <Badge tone="success">
          <ArrowDownLeft className="size-3" /> Încasare
        </Badge>
      ) : (
        <Badge tone="danger">
          <ArrowUpRight className="size-3" /> Plată
        </Badge>
      ),
  },
  { key: "partner", header: "Partener", sortValue: (r) => r.partner, cell: (r) => <span className="block max-w-56 truncate font-medium">{r.partner}</span> },
  {
    key: "document",
    header: "Document",
    hideOnMobile: true,
    sortValue: (r) => r.document ?? "",
    cell: (r) =>
      r.document ? (
        r.direction === "in" && r.documentId ? (
          <Link href={`/facturi/${r.documentId}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
            {r.document}
          </Link>
        ) : (
          r.document
        )
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "method",
    header: "Metodă",
    hideOnMobile: true,
    sortValue: (r) => PAYMENT_METHOD_LABELS[r.method] ?? r.method,
    cell: (r) => (
      <div>
        <div>{PAYMENT_METHOD_LABELS[r.method] ?? r.method}</div>
        {r.reference && <div className="text-xs text-muted-foreground">{r.reference}</div>}
      </div>
    ),
  },
  {
    key: "amount",
    header: "Sumă RON",
    align: "right",
    sortValue: (r) => (r.direction === "in" ? r.amountRon : -r.amountRon),
    cell: (r) => (
      <div>
        <span className={cn("font-semibold", r.direction === "in" ? "text-success" : "text-danger")}>
          {r.direction === "in" ? "+" : "−"}
          {money(r.amountRon)}
        </span>
        {r.currency !== "RON" && <div className="text-xs text-muted-foreground">{formatMoney(r.amount, r.currency)}</div>}
      </div>
    ),
  },
];

export function CashflowView({ data }: { data: CashflowReport }) {
  const k = data.kpis;
  const f = data.forecast;
  const next30 = f.horizons.find((h) => h.days === 30)!;
  const maxHorizon = Math.max(1, ...f.horizons.flatMap((h) => [h.in, h.out]), f.receivables.overdue.amount, f.payables.overdue.amount);
  const methodMax = Math.max(1, ...data.methods.flatMap((m) => [m.in, m.out]));

  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Încasări" value={k.totalIn} delta={k.deltaIn} deltaLabel={`${k.countIn} încasări`} spark={k.sparkIn} icon={<ArrowDownLeft />} tone="success" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Plăți" value={k.totalOut} delta={k.deltaOut} invertDelta deltaLabel={`${k.countOut} plăți`} spark={k.sparkOut} icon={<ArrowUpRight />} tone="danger" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Flux net" value={k.net} delta={k.deltaNet} deltaLabel="vs perioada anterioară" spark={k.sparkNet} icon={<Wallet />} tone={k.net >= 0 ? "brand" : "warning"} />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Sold estimat următoarele 30 zile"
            value={next30.net}
            icon={<CalendarClock />}
            tone={next30.net >= 0 ? "info" : "warning"}
            hint={`+${short(next30.in)} / −${short(next30.out)}`}
          />
        </StaggerItem>
      </Stagger>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="report-section lg:col-span-2">
          <CardHeaderRow title="Încasări vs plăți pe luni" description="Toate metodele de plată, în RON" icon={<TrendingUp />} />
          <CardContent>
            <InOutChart data={data.monthly} />
          </CardContent>
        </Card>
        <Card className="report-section">
          <CardHeaderRow title="Pe metodă de plată" description="Încasări și plăți în perioadă" icon={<CreditCard />} />
          <CardContent>
            {data.methods.length ? (
              <ul className="space-y-4">
                {data.methods.map((m) => (
                  <li key={m.method} className="space-y-1.5">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium">{m.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {m.countIn + m.countOut} {m.countIn + m.countOut === 1 ? "operațiune" : "operațiuni"}
                      </span>
                    </div>
                    <div className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Încasări</span>
                      <AnimatedBar value={(m.in / methodMax) * 100} color={SERIES.in} className="h-2 overflow-hidden rounded-full bg-muted" />
                      <span className="w-24 text-right font-medium tabular">{short(m.in)}</span>
                      <span className="text-muted-foreground">Plăți</span>
                      <AnimatedBar value={(m.out / methodMax) * 100} color={SERIES.out} className="h-2 overflow-hidden rounded-full bg-muted" />
                      <span className="w-24 text-right font-medium tabular">{short(m.out)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Nicio plată în perioada selectată.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="report-section">
          <CardHeaderRow title="Flux net cumulat" description="Cum a evoluat lichiditatea de la începutul perioadei" icon={<Wallet />} />
          <CardContent>
            <CumulativeChart data={data.monthly} />
          </CardContent>
        </Card>
        <Card className="report-section">
          <CardHeaderRow title="Prognoză scadențe" description={`De la ${formatDate(f.today)}: facturi de încasat vs facturi de plătit`} icon={<CalendarClock />} />
          <CardContent className="space-y-1">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-b border-border pb-2 text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">
              <span>Orizont</span>
              <span className="w-24 text-right">De încasat</span>
              <span className="w-24 text-right">De plătit</span>
              <span className="hidden w-24 text-right sm:block">Net</span>
            </div>
            <HorizonRow label="Deja scadente" sub={`${f.receivables.overdue.count} facturi clienți · ${f.payables.overdue.count} furnizori`} inV={f.receivables.overdue.amount} outV={f.payables.overdue.amount} max={maxHorizon} danger />
            {f.horizons.map((h, i) => (
              <HorizonRow
                key={h.days}
                label={`Următoarele ${h.days} zile`}
                sub={`${f.receivables.horizons[i].count} de încasat · ${f.payables.horizons[i].count} de plătit`}
                inV={h.in}
                outV={h.out}
                max={maxHorizon}
              />
            ))}
            <p className="pt-3 text-xs text-muted-foreground">
              Total creanțe deschise {short(f.receivables.total)} · datorii deschise {short(f.payables.total)}. Intervalele sunt cumulative.
            </p>
          </CardContent>
        </Card>
      </div>

      <ReportTable
        rows={data.payments}
        columns={columns}
        getRowId={(r) => r.id}
        search={(r) => `${r.partner} ${r.document ?? ""} ${r.reference ?? ""}`}
        searchPlaceholder="Caută partener sau document…"
        filters={[
          {
            key: "direction",
            label: "Tip",
            options: [
              { value: "in", label: "Încasări" },
              { value: "out", label: "Plăți" },
            ],
            predicate: (r, v) => r.direction === v,
          },
          {
            key: "method",
            label: "Metodă",
            options: data.methods.map((m) => ({ value: m.method, label: m.label })),
            predicate: (r, v) => r.method === v,
          },
        ]}
        defaultSort={{ key: "date", dir: "desc" }}
        pageSize={20}
        dense
        printTitle="Încasări și plăți"
        footer={(rows) => {
          const net = sum(rows, (r) => (r.direction === "in" ? r.amountRon : -r.amountRon));
          return (
            <tr>
              <TotalCell align="left">Net ({rows.length})</TotalCell>
              <TotalCell />
              <TotalCell />
              <TotalCell className="hidden md:table-cell" />
              <TotalCell className="hidden md:table-cell" />
              <TotalCell className={net >= 0 ? "text-success" : "text-danger"}>
                {net >= 0 ? "+" : "−"}
                {money(Math.abs(net))}
              </TotalCell>
            </tr>
          );
        }}
      />
    </div>
  );
}

function HorizonRow({ label, sub, inV, outV, max, danger }: { label: string; sub: string; inV: number; outV: number; max: number; danger?: boolean }) {
  const net = inV - outV;
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 border-b border-border/60 py-2.5 last:border-0">
      <div className="min-w-0">
        <div className={cn("text-sm font-medium", danger && "text-danger")}>{label}</div>
        <div className="truncate text-xs text-muted-foreground">{sub}</div>
        <div className="mt-1.5 flex flex-col gap-1">
          <AnimatedBar value={(inV / max) * 100} color={SERIES.in} className="h-1.5 overflow-hidden rounded-full bg-muted" />
          <AnimatedBar value={(outV / max) * 100} color={SERIES.out} className="h-1.5 overflow-hidden rounded-full bg-muted" />
        </div>
      </div>
      <span className="w-24 text-right text-sm font-medium tabular">{short(inV)}</span>
      <span className="w-24 text-right text-sm font-medium tabular">{short(outV)}</span>
      <span className={cn("hidden w-24 text-right text-sm font-semibold tabular sm:block", net >= 0 ? "text-success" : "text-danger")}>
        {net >= 0 ? "+" : "−"}
        {short(Math.abs(net))}
      </span>
    </div>
  );
}

export function CashflowExport({ data }: { data: CashflowReport }) {
  const exports: CsvExport[] = [
    {
      label: "Încasări și plăți",
      filename: "cashflow-operatiuni",
      columns: [
        { key: "date", label: "Data" },
        { key: "type", label: "Tip" },
        { key: "partner", label: "Partener" },
        { key: "document", label: "Document" },
        { key: "method", label: "Metodă" },
        { key: "reference", label: "Referință" },
        { key: "currency", label: "Valută" },
        { key: "amount", label: "Sumă în valută" },
        { key: "amountRon", label: "Sumă RON" },
      ],
      rows: data.payments.map((p) => ({
        ...p,
        date: formatDate(p.date),
        type: p.direction === "in" ? "Încasare" : "Plată",
        method: PAYMENT_METHOD_LABELS[p.method] ?? p.method,
        amountRon: p.direction === "in" ? p.amountRon : -p.amountRon,
      })),
    },
    {
      label: "Flux pe luni",
      filename: "cashflow-lunar",
      columns: [
        { key: "month", label: "Luna" },
        { key: "in", label: "Încasări RON" },
        { key: "out", label: "Plăți RON" },
        { key: "net", label: "Flux net RON" },
        { key: "cumulative", label: "Cumulat RON" },
      ],
      rows: data.monthly.map((m) => ({ ...m, month: m.long })),
    },
    {
      label: "Pe metodă",
      filename: "cashflow-metode",
      columns: [
        { key: "label", label: "Metodă" },
        { key: "countIn", label: "Nr. încasări" },
        { key: "in", label: "Încasări RON" },
        { key: "countOut", label: "Nr. plăți" },
        { key: "out", label: "Plăți RON" },
      ],
      rows: data.methods,
    },
    {
      label: "Prognoză scadențe",
      filename: "cashflow-prognoza",
      columns: [
        { key: "horizon", label: "Orizont" },
        { key: "in", label: "De încasat RON" },
        { key: "out", label: "De plătit RON" },
        { key: "net", label: "Net RON" },
      ],
      rows: [
        { horizon: "Deja scadente", in: data.forecast.receivables.overdue.amount, out: data.forecast.payables.overdue.amount, net: data.forecast.receivables.overdue.amount - data.forecast.payables.overdue.amount },
        ...data.forecast.horizons.map((h) => ({ horizon: `Următoarele ${h.days} zile`, in: h.in, out: h.out, net: h.net })),
      ],
    },
  ];
  return <ExportMenu exports={exports} />;
}
