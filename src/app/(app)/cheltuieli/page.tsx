import { eq } from "drizzle-orm";
import { CalendarClock, Download, Percent, Plus, Receipt, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Kpi, KpiGrid } from "@/components/catalog/kpi";
import { PurchasesView, type PurchaseRow } from "@/components/purchases/purchases-view";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projects, purchaseInvoices } from "@/lib/db/schema";
import { todayIso } from "@/lib/format";
import { daysBetween, lastMonths, monthKey, monthsAgoStart, pctDelta } from "@/lib/purchases/periods";
import { purchaseDisplayStatus } from "@/lib/purchases/schema";
import { round2 } from "@/lib/utils";

export const metadata = { title: "Cheltuieli" };

export default async function PurchasesPage() {
  const ctx = await requirePermission("billing");
  const companyId = ctx.company.id;
  const today = todayIso();
  const [list, projs] = await Promise.all([
    db.query.purchaseInvoices.findMany({
      where: eq(purchaseInvoices.companyId, companyId),
      orderBy: (p, { desc }) => [desc(p.issueDate)],
      columns: { xml: false, notes: false },
    }),
    db.query.projects.findMany({ where: eq(projects.companyId, companyId), columns: { id: true, name: true, color: true } }),
  ]);
  const projectOf = new Map(projs.map((p) => [p.id, p]));

  const rows: PurchaseRow[] = list.map((p) => ({
    id: p.id,
    supplierId: p.supplierId,
    supplierName: p.supplierName,
    supplierCui: p.supplierCui,
    number: p.number,
    issueDate: p.issueDate,
    dueDate: p.dueDate,
    currency: p.currency,
    exchangeRate: p.exchangeRate,
    total: p.total,
    vatTotal: p.vatTotal,
    paidAmount: p.paidAmount,
    rest: round2(Math.max(0, p.total - p.paidAmount)),
    status: p.status,
    display: purchaseDisplayStatus(p, today),
    category: p.category,
    source: p.source,
    stockReceived: p.stockReceived,
    project: p.projectId ? (projectOf.get(p.projectId) ?? null) : null,
    daysToDue: p.dueDate ? daysBetween(today, p.dueDate) : null,
  }));

  const valid = rows.filter((r) => r.status !== "cancelled");
  const months = lastMonths(12);
  const cur = months[11].key;
  const prev = months[10].key;
  const ron = (r: PurchaseRow) => r.total * r.exchangeRate;
  const thisMonth = valid.filter((r) => monthKey(r.issueDate) === cur);
  const spendCur = round2(thisMonth.reduce((s, r) => s + ron(r), 0));
  const spendPrev = round2(valid.filter((r) => monthKey(r.issueDate) === prev).reduce((s, r) => s + ron(r), 0));
  const vatCur = round2(thisMonth.reduce((s, r) => s + r.vatTotal * r.exchangeRate, 0));
  const open = valid.filter((r) => r.status === "unpaid" || r.status === "partially_paid");
  const unpaid = round2(open.reduce((s, r) => s + r.rest * r.exchangeRate, 0));
  const overdue = open.filter((r) => r.display === "overdue");
  const spvMonth = thisMonth.filter((r) => r.source === "spv").length;
  const spvTotal = valid.filter((r) => r.source === "spv").length;

  const monthly = months.map((m) => {
    const inMonth = valid.filter((r) => monthKey(r.issueDate) === m.key);
    return {
      key: m.key,
      month: m.label,
      long: m.long,
      total: round2(inMonth.reduce((s, r) => s + ron(r), 0)),
      vat: round2(inMonth.reduce((s, r) => s + r.vatTotal * r.exchangeRate, 0)),
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cheltuieli"
        description="Facturile primite de la furnizori — manual sau automat din SPV."
        icon={<Receipt />}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/efactura">
                <Download /> Import SPV
              </Link>
            </Button>
            <Button asChild>
              <Link href="/cheltuieli/nou">
                <Plus /> Cheltuială nouă
              </Link>
            </Button>
          </>
        }
      />

      <KpiGrid>
        <Kpi
          label={`Cheltuieli ${months[11].long}`}
          value={spendCur}
          icon={<Receipt />}
          delta={pctDelta(spendCur, spendPrev)}
          invertDelta
          deltaLabel="vs. luna trecută"
          spark={monthly.map((m) => m.total)}
        />
        <Kpi
          label="Neplătite"
          value={unpaid}
          icon={<CalendarClock />}
          tone={overdue.length ? "danger" : "warning"}
          deltaLabel={overdue.length ? `${overdue.length} cu scadența depășită` : `${open.length} facturi de plată`}
        />
        <Kpi label="TVA deductibil luna aceasta" value={vatCur} icon={<Percent />} tone="success" deltaLabel={`din ${thisMonth.length} facturi primite`} href="/rapoarte" />
        <Kpi
          label="Importate din SPV"
          value={spvMonth}
          format="number"
          icon={<ShieldCheck />}
          tone="info"
          deltaLabel={`luna aceasta · ${spvTotal} în total`}
          href="/efactura"
        />
      </KpiGrid>

      <PurchasesView rows={rows} today={today} monthly={monthly} since12={monthsAgoStart(12)} />
    </div>
  );
}
