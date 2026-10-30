import "server-only";
import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentSeries, documents, payments, purchaseInvoices } from "@/lib/db/schema";
import { round2, sum } from "@/lib/utils";
import { rateResolver } from "./common";

export type CashEntry = {
  id: string;
  date: string;
  docNumber: string; // chitanță / dispoziție de plată / referință
  docType: string;
  explanation: string;
  in: number;
  out: number;
  balance: number;
  documentId: string | null;
};

export type CashDay = { date: string; opening: number; entries: CashEntry[]; totalIn: number; totalOut: number; closing: number };

export type CashRegister = Awaited<ReturnType<typeof getCashRegister>>;

/** Registrul de casă: plăți și încasări în numerar, sold inițial/final și sold zilnic. */
export async function getCashRegister(companyId: string, period: { from: string; to: string }) {
  const resolve = await rateResolver();
  const rows = await db
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
    .where(and(eq(payments.companyId, companyId), eq(payments.method, "cash"), lte(payments.date, period.to)))
    .orderBy(asc(payments.date), asc(payments.receiptNumber), asc(payments.createdAt));

  const receiptSeries = await db.query.documentSeries.findMany({
    where: and(eq(documentSeries.companyId, companyId), eq(documentSeries.type, "receipt")),
    columns: { prefix: true, padding: true },
  });
  const padding = new Map(receiptSeries.map((s) => [s.prefix, s.padding]));

  const amountRon = (r: (typeof rows)[number]) =>
    round2(
      r.p.amount *
        (r.p.direction === "in"
          ? resolve(r.p.currency, r.p.date, r.docRate, r.docCurrency)
          : resolve(r.p.currency, r.p.date, r.purchaseRate, r.purchaseCurrency)),
    );

  const before = rows.filter((r) => r.p.date < period.from);
  const opening = round2(sum(before, (r) => (r.p.direction === "in" ? amountRon(r) : -amountRon(r))));

  let balance = opening;
  let outCounter = 0;
  const entries: CashEntry[] = rows
    .filter((r) => r.p.date >= period.from)
    .map((r) => {
      const p = r.p;
      const value = amountRon(r);
      const isIn = p.direction === "in";
      balance = round2(balance + (isIn ? value : -value));
      outCounter += isIn ? 0 : 1;
      const receipt = p.receiptNumber ? `${p.receiptSeries ?? ""}${String(p.receiptNumber).padStart(padding.get(p.receiptSeries ?? "") ?? 4, "0")}` : null;
      const doc = isIn ? r.docNumber : r.purchaseNumber;
      const explanation = isIn
        ? `Încasare${doc ? ` factura ${doc}` : ""}${p.partnerName ? ` — ${p.partnerName}` : ""}`
        : `Plată${doc ? ` factura ${doc}` : ""}${p.partnerName ? ` — ${p.partnerName}` : ""}`;
      return {
        id: p.id,
        date: p.date,
        docNumber: receipt ?? p.reference ?? (isIn ? "—" : `DP ${outCounter}`),
        docType: receipt ? "Chitanță" : isIn ? "Încasare" : "Dispoziție de plată",
        explanation: p.notes ? `${explanation} · ${p.notes}` : explanation,
        in: isIn ? value : 0,
        out: isIn ? 0 : value,
        balance,
        documentId: isIn ? p.documentId : null,
      };
    });

  // grupare pe zile, cu sold precedent / rulaj / sold final
  const days: CashDay[] = [];
  let dayOpening = opening;
  for (const e of entries) {
    let day = days.at(-1);
    if (!day || day.date !== e.date) {
      day = { date: e.date, opening: dayOpening, entries: [], totalIn: 0, totalOut: 0, closing: dayOpening };
      days.push(day);
    }
    day.entries.push(e);
    day.totalIn = round2(day.totalIn + e.in);
    day.totalOut = round2(day.totalOut + e.out);
    day.closing = e.balance;
    dayOpening = e.balance;
  }

  const totalIn = round2(sum(entries, (e) => e.in));
  const totalOut = round2(sum(entries, (e) => e.out));
  return {
    opening,
    totalIn,
    totalOut,
    closing: round2(opening + totalIn - totalOut),
    entries,
    days,
    negativeDays: days.filter((d) => d.closing < 0).map((d) => d.date),
    receipts: entries.filter((e) => e.docType === "Chitanță").length,
  };
}
