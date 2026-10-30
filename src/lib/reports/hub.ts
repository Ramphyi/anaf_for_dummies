import "server-only";
import { and, eq, gte, inArray, lt, lte, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, payments, purchaseInvoices, timeEntries } from "@/lib/db/schema";
import { todayIso } from "@/lib/format";
import { getStockLevels } from "@/lib/stock/server";
import { round2, sum } from "@/lib/utils";
import { docRon, loadSalesInvoices, pctDelta, rateResolver, toRon } from "./common";
import { presetRange } from "./period";

/** Câte o metrică „live” pentru fiecare card din hub-ul de rapoarte. */
export async function getHubMetrics(companyId: string) {
  const month = presetRange("this_month");
  const lastMonth = presetRange("last_month");
  const year = presetRange("this_year");
  const today = todayIso();
  const resolve = await rateResolver();

  const [salesNow, salesPrev, salesYear, purchasesMonth, purchasesYear, pays, cash, overdue, hours, stock] = await Promise.all([
    loadSalesInvoices(companyId, month.from, month.to),
    loadSalesInvoices(companyId, lastMonth.from, lastMonth.to),
    loadSalesInvoices(companyId, year.from, year.to),
    db.query.purchaseInvoices.findMany({
      where: and(eq(purchaseInvoices.companyId, companyId), ne(purchaseInvoices.status, "cancelled"), gte(purchaseInvoices.issueDate, month.from), lte(purchaseInvoices.issueDate, month.to)),
      columns: { vatTotal: true, currency: true, exchangeRate: true },
    }),
    db.query.purchaseInvoices.findMany({
      where: and(eq(purchaseInvoices.companyId, companyId), ne(purchaseInvoices.status, "cancelled"), gte(purchaseInvoices.issueDate, year.from), lte(purchaseInvoices.issueDate, year.to)),
      columns: { subtotal: true, currency: true, exchangeRate: true },
    }),
    db
      .select({ direction: payments.direction, amount: payments.amount, currency: payments.currency, date: payments.date })
      .from(payments)
      .where(and(eq(payments.companyId, companyId), gte(payments.date, month.from), lte(payments.date, month.to))),
    db
      .select({ direction: payments.direction, amount: payments.amount, currency: payments.currency, date: payments.date })
      .from(payments)
      .where(and(eq(payments.companyId, companyId), eq(payments.method, "cash"), lte(payments.date, today))),
    db
      .select({ total: documents.total, paid: documents.paidAmount, currency: documents.currency, rate: documents.exchangeRate })
      .from(documents)
      .where(
        and(
          eq(documents.companyId, companyId),
          eq(documents.kind, "invoice"),
          eq(documents.isCreditNote, false),
          inArray(documents.status, ["issued", "partially_paid"]),
          lt(documents.dueDate, today),
        ),
      ),
    db
      .select({
        total: sql<number>`coalesce(sum(${timeEntries.hours}), 0)`,
        billable: sql<number>`coalesce(sum(case when ${timeEntries.billable} then ${timeEntries.hours} else 0 end), 0)`,
      })
      .from(timeEntries)
      .where(and(eq(timeEntries.companyId, companyId), ne(timeEntries.status, "rejected"), gte(timeEntries.date, month.from), lte(timeEntries.date, month.to))),
    getStockLevels(companyId, { upToDate: today }),
  ]);

  const net = sum(salesNow, (d) => docRon(d).net);
  const prevNet = sum(salesPrev, (d) => docRon(d).net);
  const vatCollected = sum(salesNow, (d) => docRon(d).vat);
  const vatDeductible = sum(purchasesMonth, (p) => toRon(p.vatTotal, p.currency, p.exchangeRate));
  const flow = (rows: typeof pays) => sum(rows, (p) => (p.direction === "in" ? 1 : -1) * p.amount * resolve(p.currency, p.date));
  const overdueRon = sum(overdue, (d) => toRon(Math.max(0, d.total - d.paid), d.currency, d.rate));
  const revenueYear = sum(salesYear, (d) => docRon(d).net);
  const costYear = sum(purchasesYear, (p) => toRon(p.subtotal, p.currency, p.exchangeRate));
  const h = hours[0] ?? { total: 0, billable: 0 };

  return {
    sales: { value: round2(net), delta: pctDelta(net, prevNet) },
    vat: { value: round2(vatCollected - vatDeductible) },
    cashflow: { value: round2(flow(pays)), in: round2(sum(pays.filter((p) => p.direction === "in"), (p) => p.amount * resolve(p.currency, p.date))) },
    overdue: { value: round2(overdueRon), count: overdue.filter((d) => d.total - d.paid > 0.009).length },
    cash: { value: round2(flow(cash)) },
    profit: { value: round2(revenueYear - costYear), margin: revenueYear ? ((revenueYear - costYear) / revenueYear) * 100 : 0 },
    hours: { value: round2(Number(h.total)), billablePct: Number(h.total) ? (Number(h.billable) / Number(h.total)) * 100 : 0 },
    stock: { value: round2(sum(stock, (s) => s.value)), products: new Set(stock.filter((s) => s.quantity > 0).map((s) => s.productId)).size },
  };
}
