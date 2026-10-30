"use client";

import { Briefcase, Coins, FolderKanban, Info, PiggyBank, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { motion, Stagger, StaggerItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import type { Column } from "@/components/ui/data-table";
import { ColorDot, Switch } from "@/components/ui/misc";
import { StatCard } from "@/components/ui/stat-card";
import { Segmented } from "@/components/ui/tabs";
import { BILLING_TYPE_LABELS } from "@/lib/constants";
import { formatHours, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type { ClientProfitRow, ProfitabilityReport, ProjectProfitRow } from "@/lib/reports/profitability";
import { cn, sum } from "@/lib/utils";
import { PnlChart } from "./charts";
import { ExportMenu, ReportTable, TotalCell, type CsvExport } from "./report-kit";

type Basis = "invoiced" | "estimated";
const money = (v: number) => formatMoney(v);
const short = (v: number) => formatMoney(v).replace(/,\d{2}(?=\s)/, "");

function marginOf(r: { invoiced: number; estimated: number; cost: number }, basis: Basis) {
  const revenue = basis === "invoiced" ? r.invoiced : r.estimated;
  const profit = revenue - r.cost;
  return { revenue, profit, pct: revenue ? (profit / revenue) * 100 : null };
}

function MarginCell({ pct, profit }: { pct: number | null; profit: number }) {
  if (pct === null) return <span className="text-muted-foreground">—</span>;
  const tone = pct >= 30 ? "success" : pct >= 0 ? "warning" : "danger";
  return (
    <div className="flex flex-col items-end gap-1">
      <Badge tone={tone}>{formatPercent(pct)}</Badge>
      <span className={cn("text-xs tabular", profit < 0 ? "text-danger" : "text-muted-foreground")}>{short(profit)}</span>
    </div>
  );
}

function projectColumns(basis: Basis): Column<ProjectProfitRow>[] {
  return [
    {
      key: "name",
      header: "Proiect",
      sortValue: (r) => r.name,
      cell: (r) => (
        <div className="flex max-w-64 min-w-0 items-center gap-2.5">
          <ColorDot color={r.color} />
          <div className="min-w-0">
            <Link href={`/proiecte/${r.id}`} className="block truncate font-medium hover:text-primary" onClick={(e) => e.stopPropagation()}>
              {r.name}
            </Link>
            <div className="truncate text-xs text-muted-foreground">
              {r.clientName ?? "Intern"} · {BILLING_TYPE_LABELS[r.billingType] ?? r.billingType}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "hours",
      header: "Ore",
      align: "right",
      hideOnMobile: true,
      sortValue: (r) => r.hours,
      cell: (r) => (
        <div className="whitespace-nowrap">
          {formatHours(r.hours)}
          <div className="text-xs text-muted-foreground">{formatHours(r.billableHours)} fact.</div>
        </div>
      ),
    },
    { key: "invoiced", header: "Venit facturat", align: "right", sortValue: (r) => r.invoiced, cell: (r) => <span className={cn(basis === "invoiced" && "font-semibold")}>{money(r.invoiced)}</span> },
    { key: "estimated", header: "Venit estimat", align: "right", sortValue: (r) => r.estimated, cell: (r) => <span className={cn(basis === "estimated" && "font-semibold")}>{money(r.estimated)}</span> },
    {
      key: "cost",
      header: "Cost",
      align: "right",
      sortValue: (r) => r.cost,
      cell: (r) => (
        <div>
          {money(r.cost)}
          {r.purchaseCost > 0 && <div className="text-xs text-muted-foreground">din care achiziții {short(r.purchaseCost)}</div>}
        </div>
      ),
    },
    {
      key: "margin",
      header: "Marjă",
      align: "right",
      sortValue: (r) => marginOf(r, basis).pct ?? -Infinity,
      csv: (r) => {
        const p = marginOf(r, basis).pct;
        return p === null ? null : Number(p.toFixed(2));
      },
      cell: (r) => {
        const m = marginOf(r, basis);
        return <MarginCell pct={m.pct} profit={m.profit} />;
      },
    },
  ];
}

function clientColumns(basis: Basis): Column<ClientProfitRow>[] {
  return [
    {
      key: "name",
      header: "Client",
      sortValue: (r) => r.name,
      cell: (r) => (
        <div className="max-w-64 min-w-0">
          <div className="truncate font-medium">{r.name}</div>
          <div className="text-xs text-muted-foreground">
            {r.projects} {r.projects === 1 ? "proiect" : "proiecte"} · {formatHours(r.hours)}
          </div>
        </div>
      ),
    },
    { key: "invoiced", header: "Venit facturat", align: "right", sortValue: (r) => r.invoiced, cell: (r) => <span className={cn(basis === "invoiced" && "font-semibold")}>{money(r.invoiced)}</span> },
    { key: "estimated", header: "Venit estimat", align: "right", hideOnMobile: true, sortValue: (r) => r.estimated, cell: (r) => <span className={cn(basis === "estimated" && "font-semibold")}>{money(r.estimated)}</span> },
    { key: "cost", header: "Cost proiecte", align: "right", sortValue: (r) => r.cost, cell: (r) => money(r.cost) },
    {
      key: "margin",
      header: "Marjă",
      align: "right",
      sortValue: (r) => (r.projects ? (marginOf(r, basis).pct ?? -Infinity) : -Infinity),
      csv: (r) => {
        const p = r.projects ? marginOf(r, basis).pct : null;
        return p === null ? null : Number(p.toFixed(2));
      },
      cell: (r) => {
        if (!r.projects) return <span className="text-xs text-muted-foreground">fără costuri urmărite</span>;
        const m = marginOf(r, basis);
        return <MarginCell pct={m.pct} profit={m.profit} />;
      },
    },
  ];
}

/** Profit pe proiect — bare divergente (verde = profit, roșu = pierdere). */
function ProfitBars({ rows, basis }: { rows: ProjectProfitRow[]; basis: Basis }) {
  const items = rows
    .map((r) => ({ ...r, ...marginOf(r, basis) }))
    .filter((r) => r.revenue || r.cost)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10);
  const max = Math.max(1, ...items.map((i) => Math.abs(i.profit)));
  if (!items.length) return <p className="py-8 text-center text-sm text-muted-foreground">Nu există date pentru proiecte în perioadă.</p>;
  return (
    <ul className="space-y-3">
      {items.map((i, idx) => {
        const w = (Math.abs(i.profit) / max) * 50;
        return (
          <li key={i.id}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <ColorDot color={i.color} />
                <span className="truncate font-medium">{i.name}</span>
              </span>
              <span className={cn("shrink-0 font-semibold tabular", i.profit < 0 && "text-danger")}>{short(i.profit)}</span>
            </div>
            <div className="relative h-2 rounded-full bg-muted">
              <div className="absolute inset-y-[-3px] left-1/2 w-px bg-border" />
              <motion.div
                className={cn("absolute inset-y-0 rounded-full", i.profit >= 0 ? "left-1/2 bg-success" : "right-1/2 bg-danger")}
                initial={{ width: 0 }}
                animate={{ width: `${w}%` }}
                transition={{ duration: 0.8, delay: idx * 0.04, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ProfitabilityView({ data }: { data: ProfitabilityReport }) {
  const [basis, setBasis] = React.useState<Basis>("invoiced");
  const [withLabor, setWithLabor] = React.useState(true);
  const k = data.kpis;
  const profit = withLabor ? k.profit : k.revenue - k.purchases;
  const margin = k.revenue ? (profit / k.revenue) * 100 : 0;
  const pCols = React.useMemo(() => projectColumns(basis), [basis]);
  const cCols = React.useMemo(() => clientColumns(basis), [basis]);

  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Venituri facturate" value={k.revenue} spark={k.sparkRevenue} icon={<TrendingUp />} hint="fără TVA, în RON" />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Cheltuieli"
            value={withLabor ? k.costs : k.purchases}
            icon={<Coins />}
            tone="danger"
            hint={withLabor ? `achiziții ${short(k.purchases)} · manoperă ${short(k.labor)}` : "facturi de achiziție"}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Profit brut" value={profit} spark={withLabor ? k.sparkProfit : undefined} icon={<PiggyBank />} tone={profit >= 0 ? "success" : "danger"} hint="venituri − cheltuieli" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Marjă" value={margin} format="percent" icon={<Briefcase />} tone={margin >= 20 ? "success" : margin >= 0 ? "warning" : "danger"} hint={`venit estimat din pontaj ${short(k.estimated)}`} />
        </StaggerItem>
      </Stagger>

      <div className="grid gap-6 xl:grid-cols-3">
      <Card className="report-section xl:col-span-2">
        <CardHeaderRow
          title="Profit & pierdere pe luni"
          description="Venituri facturate vs. facturi de achiziție și costul orelor pontate (ore aprobate × cost orar)"
          icon={<TrendingUp />}
          actions={
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground print:hidden">
              <Switch checked={withLabor} onCheckedChange={setWithLabor} />
              <span className="hidden sm:inline">Include costul manoperei</span>
              <span className="sm:hidden">Manoperă</span>
            </label>
          }
        />
        <CardContent>
          <PnlChart data={data.pnl} showLabor={withLabor} />
        </CardContent>
      </Card>
        <Card className="report-section">
          <CardHeaderRow title="Profit pe proiect" description={basis === "invoiced" ? "Venit facturat − cost" : "Venit estimat − cost"} icon={<PiggyBank />} />
          <CardContent>
            <ProfitBars rows={data.projects} basis={basis} />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="flex items-start gap-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Marja se calculează pe </span>
            {basis === "invoiced" ? "venitul facturat pe proiect (facturi legate de proiect)." : "venitul estimat: ore facturabile aprobate × tarif (retainer: abonament × luni)."} Tarifele
            în EUR sunt convertite la {formatNumber(data.eurRate)} RON.
          </p>
        </div>
        <Segmented
          size="sm"
          value={basis}
          onChange={setBasis}
          options={[
            { value: "invoiced", label: "Facturat" },
            { value: "estimated", label: "Estimat din pontaj" },
          ]}
        />
      </div>

      <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <FolderKanban className="size-4 text-primary" /> Pe proiect
          </h2>
          <ReportTable
            rows={data.projects}
            columns={pCols}
            getRowId={(r) => r.id}
            search={(r) => `${r.name} ${r.code ?? ""} ${r.clientName ?? ""}`}
            searchPlaceholder="Caută proiect sau client…"
            filters={[
              {
                key: "billing",
                label: "Tip",
                options: Object.entries(BILLING_TYPE_LABELS)
                  .filter(([key]) => data.projects.some((p) => p.billingType === key))
                  .map(([value, label]) => ({ value, label })),
                predicate: (r, v) => r.billingType === v,
              },
            ]}
            defaultSort={{ key: basis, dir: "desc" }}
            pageSize={12}
            dense
            printTitle="Profitabilitate pe proiect"
            footer={(rows) => {
              const m = marginOf({ invoiced: sum(rows, (r) => r.invoiced), estimated: sum(rows, (r) => r.estimated), cost: sum(rows, (r) => r.cost) }, basis);
              return (
                <tr>
                  <TotalCell align="left">Total</TotalCell>
                  <TotalCell className="hidden md:table-cell">{formatHours(sum(rows, (r) => r.hours))}</TotalCell>
                  <TotalCell>{money(sum(rows, (r) => r.invoiced))}</TotalCell>
                  <TotalCell>{money(sum(rows, (r) => r.estimated))}</TotalCell>
                  <TotalCell>{money(sum(rows, (r) => r.cost))}</TotalCell>
                  <TotalCell>{m.pct === null ? "—" : formatPercent(m.pct)}</TotalCell>
                </tr>
              );
            }}
          />
        </div>

      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <Users className="size-4 text-primary" /> Pe client
        </h2>
        <ReportTable
          rows={data.clients}
          columns={cCols}
          getRowId={(r) => r.key}
          search={(r) => r.name}
          searchPlaceholder="Caută client…"
          defaultSort={{ key: "invoiced", dir: "desc" }}
          pageSize={12}
          dense
          printTitle="Profitabilitate pe client"
        />
        <p className="text-xs text-muted-foreground">
          Venitul facturat pe client include toate facturile clientului (inclusiv cele fără proiect); costul include doar manopera și achizițiile legate de proiectele
          clientului.
        </p>
      </div>
    </div>
  );
}

export function ProfitabilityExport({ data }: { data: ProfitabilityReport }) {
  const pct = (rev: number, cost: number) => (rev ? Number((((rev - cost) / rev) * 100).toFixed(2)) : null);
  const exports: CsvExport[] = [
    {
      label: "Pe proiect",
      filename: "profitabilitate-proiecte",
      columns: [
        { key: "name", label: "Proiect" },
        { key: "client", label: "Client" },
        { key: "billing", label: "Tip facturare" },
        { key: "hours", label: "Ore aprobate" },
        { key: "billableHours", label: "Ore facturabile" },
        { key: "invoiced", label: "Venit facturat RON" },
        { key: "estimated", label: "Venit estimat RON" },
        { key: "laborCost", label: "Cost manoperă RON" },
        { key: "purchaseCost", label: "Cost achiziții RON" },
        { key: "cost", label: "Cost total RON" },
        { key: "marginInvoiced", label: "Marjă facturat %" },
        { key: "marginEstimated", label: "Marjă estimat %" },
      ],
      rows: data.projects.map((p) => ({
        ...p,
        client: p.clientName,
        billing: BILLING_TYPE_LABELS[p.billingType] ?? p.billingType,
        marginInvoiced: pct(p.invoiced, p.cost),
        marginEstimated: pct(p.estimated, p.cost),
      })),
    },
    {
      label: "Pe client",
      filename: "profitabilitate-clienti",
      columns: [
        { key: "name", label: "Client" },
        { key: "projects", label: "Proiecte" },
        { key: "hours", label: "Ore" },
        { key: "invoiced", label: "Venit facturat RON" },
        { key: "estimated", label: "Venit estimat RON" },
        { key: "cost", label: "Cost RON" },
        { key: "marginInvoiced", label: "Marjă facturat %" },
      ],
      rows: data.clients.map((c) => ({ ...c, marginInvoiced: c.projects ? pct(c.invoiced, c.cost) : null })),
    },
    {
      label: "P&L lunar",
      filename: "profit-pierdere-lunar",
      columns: [
        { key: "month", label: "Luna" },
        { key: "revenue", label: "Venituri RON" },
        { key: "purchases", label: "Achiziții RON" },
        { key: "labor", label: "Cost manoperă RON" },
        { key: "profit", label: "Profit RON" },
      ],
      rows: data.pnl.map((m) => ({ ...m, month: m.long })),
    },
  ];
  return <ExportMenu exports={exports} />;
}
