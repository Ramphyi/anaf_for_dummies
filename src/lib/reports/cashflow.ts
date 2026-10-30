import "server-only";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, payments, purchaseInvoices } from "@/lib/db/schema";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { todayIso } from "@/lib/format";
import { round2, sum } from "@/lib/utils";
import { pctDelta, rateResolver, toRon } from "./common";
import { addDaysIso, monthKey, monthsInPeriod, previousPeriod } from "./period";

export type CashPaymentRow = {
  id: string;
  date: string;
  direction: "in" | "out";
  partner: string;
  document: string | null;
  documentId: string | null;
  method: string;
  reference: string | null;
  currency: string;
  amount: number;
  amountRon: number;
};

export const FORECAST_HORIZONS = [7, 30, 60, 90] as const;

export type CashflowReport = Awaited<ReturnType<typeof getCashflowReport>>;

async function loadPayments(companyId: string, from: string, to: string) {
  return db
    .select({
      p: payments,
      docNumber: documents.fullNumber,
      docRate: documents.exchangeRate,
      docCurrency: documents.currency,
      purchaseNumber: purchaseInvoices.number,
      purchaseRate: purchaseInvoices.exchangeRate,
      purchaseCurrency: purchaseInvoices.currency,
    })
    .from(payments)
    .leftJoin(documents, eq(documents.id, payments.documentId))
    .leftJoin(purchaseInvoices, eq(purchaseInvoices.id, payments.purchaseInvoiceId))
    .where(and(eq(payments.companyId, companyId), gte(payments.date, from), lte(payments.date, to)))
    .orderBy(payments.date);
}

export async function getCashflowReport(companyId: string, period: { from: string; to: string }) {
  const resolve = await rateResolver();
  const prev = previousPeriod(period);
  const [rows, prevRows] = await Promise.all([loadPayments(companyId, period.from, period.to), loadPayments(companyId, prev.from, prev.to)]);

  const toRow = (r: (typeof rows)[number]): CashPaymentRow => {
    const p = r.p;
    const rate =
      p.direction === "in" ? resolve(p.currency, p.date, r.docRate, r.docCurrency) : resolve(p.currency, p.date, r.purchaseRate, r.purchaseCurrency);
    return {
      id: p.id,
      date: p.date,
      direction: p.direction,
      partner: p.partnerName ?? "—",
      document: p.direction === "in" ? (r.docNumber ?? null) : (r.purchaseNumber ?? null),
      documentId: p.direction === "in" ? p.documentId : p.purchaseInvoiceId,
      method: p.method,
      reference: p.receiptNumber ? `Chitanță ${p.receiptSeries ?? ""}${String(p.receiptNumber).padStart(4, "0")}` : p.reference,
      currency: p.currency,
      amount: p.amount,
      amountRon: round2(p.amount * rate),
    };
  };
  const list = rows.map(toRow);
  const prevList = prevRows.map(toRow);

  const totalIn = round2(sum(list.filter((r) => r.direction === "in"), (r) => r.amountRon));
  const totalOut = round2(sum(list.filter((r) => r.direction === "out"), (r) => r.amountRon));
  const prevIn = round2(sum(prevList.filter((r) => r.direction === "in"), (r) => r.amountRon));
  const prevOut = round2(sum(prevList.filter((r) => r.direction === "out"), (r) => r.amountRon));

  /* pe luni + cumulat */
  let running = 0;
  const monthly = monthsInPeriod(period.from, period.to).map((m) => {
    const inM = round2(sum(list.filter((r) => r.direction === "in" && monthKey(r.date) === m.key), (r) => r.amountRon));
    const outM = round2(sum(list.filter((r) => r.direction === "out" && monthKey(r.date) === m.key), (r) => r.amountRon));
    running += inM - outM;
    return { key: m.key, label: m.label, long: m.long, in: inM, out: outM, net: round2(inM - outM), cumulative: round2(running) };
  });

  /* pe metodă */
  const methods = Object.keys(PAYMENT_METHOD_LABELS)
    .map((method) => {
      const ins = list.filter((r) => r.direction === "in" && r.method === method);
      const outs = list.filter((r) => r.direction === "out" && r.method === method);
      return {
        method,
        label: PAYMENT_METHOD_LABELS[method],
        in: round2(sum(ins, (r) => r.amountRon)),
        out: round2(sum(outs, (r) => r.amountRon)),
        countIn: ins.length,
        countOut: outs.length,
      };
    })
    .filter((m) => m.countIn || m.countOut);

  /* prognoză: creanțe și datorii scadente în următoarele 7/30/60/90 zile (de azi) */
  const today = todayIso();
  const openInvoices = await db
    .select({ id: documents.id, dueDate: documents.dueDate, issueDate: documents.issueDate, total: documents.total, paid: documents.paidAmount, currency: documents.currency, rate: documents.exchangeRate, isCreditNote: documents.isCreditNote })
    .from(documents)
    .where(and(eq(documents.companyId, companyId), eq(documents.kind, "invoice"), inArray(documents.status, ["issued", "partially_paid"]), eq(documents.isCreditNote, false)));
  const openPurchases = await db
    .select({ id: purchaseInvoices.id, dueDate: purchaseInvoices.dueDate, issueDate: purchaseInvoices.issueDate, total: purchaseInvoices.total, paid: purchaseInvoices.paidAmount, currency: purchaseInvoices.currency, rate: purchaseInvoices.exchangeRate })
    .from(purchaseInvoices)
    .where(and(eq(purchaseInvoices.companyId, companyId), inArray(purchaseInvoices.status, ["unpaid", "partially_paid"])));

  const bucketize = (items: { dueDate: string | null; issueDate: string; total: number; paid: number; currency: string; rate: number }[]) => {
    const open = items
      .map((i) => ({ due: i.dueDate ?? i.issueDate, amount: round2(toRon(Math.max(0, i.total - i.paid), i.currency, i.rate)) }))
      .filter((i) => i.amount > 0.009);
    const overdue = open.filter((i) => i.due < today);
    return {
      overdue: { amount: round2(sum(overdue, (i) => i.amount)), count: overdue.length },
      horizons: FORECAST_HORIZONS.map((days) => {
        const limit = addDaysIso(today, days);
        const due = open.filter((i) => i.due >= today && i.due <= limit);
        return { days, amount: round2(sum(due, (i) => i.amount)), count: due.length };
      }),
      later: round2(sum(open.filter((i) => i.due > addDaysIso(today, 90)), (i) => i.amount)),
      total: round2(sum(open, (i) => i.amount)),
    };
  };
  const receivables = bucketize(openInvoices);
  const payables = bucketize(openPurchases);

  return {
    kpis: {
      totalIn,
      totalOut,
      net: round2(totalIn - totalOut),
      deltaIn: pctDelta(totalIn, prevIn),
      deltaOut: pctDelta(totalOut, prevOut),
      deltaNet: pctDelta(totalIn - totalOut, prevIn - prevOut),
      countIn: list.filter((r) => r.direction === "in").length,
      countOut: list.filter((r) => r.direction === "out").length,
      sparkIn: monthly.map((m) => m.in),
      sparkOut: monthly.map((m) => m.out),
      sparkNet: monthly.map((m) => m.cumulative),
    },
    monthly,
    methods,
    payments: list,
    forecast: {
      today,
      receivables,
      payables,
      horizons: FORECAST_HORIZONS.map((days, i) => ({
        days,
        in: receivables.horizons[i].amount,
        out: payables.horizons[i].amount,
        net: round2(receivables.horizons[i].amount - payables.horizons[i].amount),
      })),
    },
  };
}
