"use client";

import { BarChart3, PieChart, Plus, Receipt, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { FadeIn } from "@/components/motion";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { NativeSelect } from "@/components/ui/input";
import { ColorDot } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/page";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/format";
import { PURCHASE_DISPLAY_STATUS } from "@/lib/purchases/schema";
import { cn, round2 } from "@/lib/utils";
import { CategoryBreakdown, type CategoryTotal } from "./category-breakdown";
import { MonthlySpendChart, type SpendPoint } from "./monthly-spend-chart";

export type PurchaseRow = {
  id: string;
  supplierId: string | null;
  supplierName: string;
  supplierCui: string | null;
  number: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  exchangeRate: number;
  total: number;
  vatTotal: number;
  paidAmount: number;
  rest: number;
  status: string;
  display: string;
  category: string;
  source: "manual" | "spv";
  stockReceived: boolean;
  project: { id: string; name: string; color: string } | null;
  daysToDue: number | null;
};

type Period = "" | "month" | "prev" | "3m" | "year" | "12m";

const PERIODS: { value: Period; label: string }[] = [
  { value: "", label: "Toate perioadele" },
  { value: "month", label: "Luna curentă" },
  { value: "prev", label: "Luna trecută" },
  { value: "3m", label: "Ultimele 3 luni" },
  { value: "12m", label: "Ultimele 12 luni" },
  { value: "year", label: "Anul curent" },
];

function periodRange(p: Period, today: string): [string, string] | null {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const ym = (yy: number, mm: number) => {
    const d = new Date(Date.UTC(yy, mm - 1, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  switch (p) {
    case "month":
      return [`${ym(y, m)}-01`, `${ym(y, m)}-31`];
    case "prev":
      return [`${ym(y, m - 1)}-01`, `${ym(y, m - 1)}-31`];
    case "3m":
      return [`${ym(y, m - 2)}-01`, today];
    case "12m":
      return [`${ym(y, m - 11)}-01`, today];
    case "year":
      return [`${y}-01-01`, `${y}-12-31`];
    default:
      return null;
  }
}

export function PurchasesView({ rows, today, monthly, since12 }: { rows: PurchaseRow[]; today: string; monthly: SpendPoint[]; since12: string }) {
  const [period, setPeriod] = React.useState<Period>("");
  const [category, setCategory] = React.useState<string | null>(null);
  const [source, setSource] = React.useState<"" | "spv" | "manual">("");

  const breakdown = React.useMemo<CategoryTotal[]>(() => {
    const map = new Map<string, CategoryTotal>();
    for (const r of rows) {
      if (r.status === "cancelled" || r.issueDate < since12) continue;
      const c = map.get(r.category) ?? { category: r.category, amount: 0, count: 0 };
      c.amount = round2(c.amount + r.total * r.exchangeRate);
      c.count += 1;
      map.set(r.category, c);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [rows, since12]);

  const visible = React.useMemo(() => {
    const range = periodRange(period, today);
    return rows.filter(
      (r) => (!range || (r.issueDate >= range[0] && r.issueDate <= range[1])) && (!category || r.category === category) && (!source || r.source === source),
    );
  }, [rows, period, category, source, today]);
  const filtered = !!period || !!category || !!source;

  const columns: Column<PurchaseRow>[] = [
    {
      key: "supplier",
      header: "Furnizor",
      sortValue: (r) => r.supplierName,
      cell: (r) => (
        <div className="min-w-0">
          <div className="max-w-[11rem] truncate font-medium sm:max-w-[15rem]">{r.supplierName}</div>
          <div className="hidden text-xs text-muted-foreground tabular md:block">{r.supplierCui ? `CUI ${r.supplierCui}` : "—"}</div>
          <div className="text-xs text-muted-foreground tabular md:hidden">
            {r.number} · {formatDate(r.issueDate)}
          </div>
        </div>
      ),
    },
    {
      key: "number",
      header: "Nr. factură",
      hideOnMobile: true,
      sortValue: (r) => r.number,
      cell: (r) => (
        <div className="min-w-0">
          <div className="font-medium tabular">{r.number}</div>
          {r.project && (
            <div className="flex max-w-[11rem] items-center gap-1 truncate text-xs text-muted-foreground">
              <ColorDot color={r.project.color} className="size-2" /> {r.project.name}
            </div>
          )}
        </div>
      ),
    },
    { key: "date", header: "Data", hideOnMobile: true, sortValue: (r) => r.issueDate, cell: (r) => <span className="tabular">{formatDate(r.issueDate)}</span> },
    {
      key: "due",
      header: "Scadență",
      hideOnMobile: true,
      sortValue: (r) => r.dueDate ?? "",
      cell: (r) => {
        if (!r.dueDate) return <span className="text-muted-foreground">—</span>;
        const open = r.status === "unpaid" || r.status === "partially_paid";
        return (
          <div>
            <div className={cn("tabular", r.display === "overdue" && "font-medium text-danger")}>{formatDate(r.dueDate)}</div>
            {open && r.daysToDue != null && (
              <div className={cn("text-xs", r.daysToDue < 0 ? "text-danger/80" : r.daysToDue <= 7 ? "text-warning" : "text-muted-foreground")}>
                {r.daysToDue < 0 ? `întârziere ${-r.daysToDue} zile` : r.daysToDue === 0 ? "scadentă azi" : `în ${r.daysToDue} zile`}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "category",
      header: "Categorie",
      hideOnMobile: true,
      sortValue: (r) => EXPENSE_CATEGORY_LABELS[r.category] ?? r.category,
      cell: (r) => <span className="whitespace-nowrap text-muted-foreground">{EXPENSE_CATEGORY_LABELS[r.category] ?? r.category}</span>,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      sortValue: (r) => r.total * r.exchangeRate,
      csv: (r) => r.total,
      cell: (r) => (
        <div>
          <div className="font-medium">{formatMoney(r.total, r.currency)}</div>
          <div className="text-xs text-muted-foreground">TVA {formatMoney(r.vatTotal, r.currency)}</div>
        </div>
      ),
    },
    {
      key: "rest",
      header: "Rest de plată",
      align: "right",
      sortValue: (r) => r.rest * r.exchangeRate,
      csv: (r) => r.rest,
      cell: (r) =>
        r.rest > 0 && r.status !== "cancelled" ? (
          <span className={cn("font-medium", r.display === "overdue" ? "text-danger" : "text-foreground")}>{formatMoney(r.rest, r.currency)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => r.display,
      csv: (r) => PURCHASE_DISPLAY_STATUS[r.display]?.label ?? r.display,
      cell: (r) => <StatusBadge status={r.display} map={PURCHASE_DISPLAY_STATUS} />,
    },
    {
      key: "source",
      header: "Sursă",
      hideOnMobile: true,
      sortValue: (r) => r.source,
      csv: (r) => (r.source === "spv" ? "SPV" : "Manual"),
      cell: (r) => (r.source === "spv" ? <Badge tone="brand">SPV</Badge> : <Badge>Manual</Badge>),
    },
  ];

  const footer = (list: PurchaseRow[]) => {
    const valid = list.filter((r) => r.status !== "cancelled");
    const total = round2(valid.reduce((s, r) => s + r.total * r.exchangeRate, 0));
    const rest = round2(valid.reduce((s, r) => s + r.rest * r.exchangeRate, 0));
    return (
      <tr>
        {columns.map((c, i) => (
          <td
            key={c.key}
            className={cn("px-3 py-3 text-sm first:pl-5 last:pr-5", c.align === "right" && "text-right tabular", c.hideOnMobile && "hidden md:table-cell")}
          >
            {i === 0 ? (
              <span className="text-xs text-muted-foreground">{list.length} facturi · echivalent RON</span>
            ) : c.key === "total" ? (
              formatMoney(total)
            ) : c.key === "rest" ? (
              <span className={rest > 0 ? "text-foreground" : "text-muted-foreground"}>{formatMoney(rest)}</span>
            ) : null}
          </td>
        ))}
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      <FadeIn delay={0.08} className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeaderRow title="Cheltuieli pe lună" description="Ultimele 12 luni, cu TVA, echivalent RON" icon={<BarChart3 />} />
          <CardContent>
            <MonthlySpendChart data={monthly} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeaderRow
            title="Pe categorii"
            description="Ultimele 12 luni · click pentru filtrare"
            icon={<PieChart />}
            actions={
              category && (
                <Button variant="ghost" size="xs" onClick={() => setCategory(null)}>
                  <X /> Toate
                </Button>
              )
            }
          />
          <CardContent className="pt-0">
            <div className="scrollbar-thin -mx-2.5 max-h-[244px] overflow-y-auto">
              <CategoryBreakdown data={breakdown} active={category} onSelect={setCategory} />
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto w-full text-[15px] font-semibold tracking-tight sm:w-auto">
            Facturi primite <span className="ml-1 text-sm font-normal text-muted-foreground tabular">{visible.length}</span>
          </h2>
          <div className="w-[calc(50%-0.25rem)] sm:w-[10.5rem]">
            <NativeSelect value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="h-8 text-[13px]" aria-label="Perioadă">
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="w-[calc(50%-0.25rem)] sm:w-[11.5rem]">
            <NativeSelect value={category ?? ""} onChange={(e) => setCategory(e.target.value || null)} className="h-8 text-[13px]" aria-label="Categorie">
              <option value="">Toate categoriile</option>
              {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="w-[calc(50%-0.25rem)] sm:w-[9.5rem]">
            <NativeSelect value={source} onChange={(e) => setSource(e.target.value as typeof source)} className="h-8 text-[13px]" aria-label="Sursă">
              <option value="">Orice sursă</option>
              <option value="spv">Din SPV</option>
              <option value="manual">Introduse manual</option>
            </NativeSelect>
          </div>
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPeriod("");
                setCategory(null);
                setSource("");
              }}
            >
              <X /> Resetează
            </Button>
          )}
        </div>
        <DataTable
          rows={visible}
          columns={columns}
          getRowId={(r) => r.id}
          rowHref={(r) => `/cheltuieli/${r.id}`}
          search={(r) => `${r.supplierName} ${r.supplierCui ?? ""} ${r.number} ${r.project?.name ?? ""}`}
          searchPlaceholder="Caută furnizor, CUI, număr…"
          filters={[
            {
              key: "status",
              label: "Status",
              options: [
                { value: "open", label: "De plată" },
                { value: "overdue", label: "Restante" },
                { value: "paid", label: "Plătite" },
                { value: "cancelled", label: "Anulate" },
              ],
              predicate: (r, v) => (v === "open" ? r.status === "unpaid" || r.status === "partially_paid" : v === "overdue" ? r.display === "overdue" : r.status === v),
            },
          ]}
          csvFilename="cheltuieli"
          defaultSort={{ key: "date", dir: "desc" }}
          footer={footer}
          rowClassName={(r) => (r.status === "cancelled" ? "opacity-60" : undefined)}
          empty={
            rows.length === 0 ? (
              <EmptyState
                icon={<Receipt />}
                title="Nicio cheltuială înregistrată"
                description="Adaugă facturile primite manual sau importă-le automat din SPV (e-Factura)."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button asChild>
                      <Link href="/cheltuieli/nou">
                        <Plus /> Cheltuială nouă
                      </Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href="/efactura">Importă din SPV</Link>
                    </Button>
                  </div>
                }
              />
            ) : undefined
          }
        />
      </div>
    </div>
  );
}
