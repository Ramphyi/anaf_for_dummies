import "server-only";
import { and, asc, eq, gte, lte, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, exchangeRates } from "@/lib/db/schema";
import { todayIso } from "@/lib/format";
import { round2 } from "@/lib/utils";

/** Statusuri excluse din rapoartele de vânzări (ciorne, anulate). */
export const EXCLUDED_SALES_STATUSES = ["draft", "cancelled"] as const;

/** Conversie în RON cu cursul documentului. */
export function toRon(amount: number, currency: string, exchangeRate: number | null | undefined): number {
  if (!currency || currency === "RON") return amount;
  return amount * (exchangeRate && exchangeRate > 0 ? exchangeRate : 1);
}

/** Facturile storno au mereu semn negativ (indiferent de cum au fost salvate). */
export function signed(value: number, isCreditNote: boolean): number {
  return isCreditNote ? -Math.abs(value) : value;
}

export type SalesDoc = typeof documents.$inferSelect;

/** Facturile emise într-un interval (fără ciorne/anulate; storno inclus). */
export async function loadSalesInvoices(companyId: string, from: string, to: string): Promise<SalesDoc[]> {
  return db.query.documents.findMany({
    where: and(
      eq(documents.companyId, companyId),
      eq(documents.kind, "invoice"),
      notInArray(documents.status, [...EXCLUDED_SALES_STATUSES]),
      gte(documents.issueDate, from),
      lte(documents.issueDate, to),
    ),
    orderBy: [asc(documents.issueDate), asc(documents.number)],
  });
}

/** Valorile unei facturi în RON (cu semn pentru storno). */
export function docRon(d: Pick<SalesDoc, "subtotal" | "vatTotal" | "total" | "paidAmount" | "currency" | "exchangeRate" | "isCreditNote">) {
  const r = (v: number) => round2(signed(toRon(v, d.currency, d.exchangeRate), d.isCreditNote));
  return { net: r(d.subtotal), vat: r(d.vatTotal), gross: r(d.total), paid: round2(toRon(d.paidAmount, d.currency, d.exchangeRate)) };
}

/* ------------------------------ Curs valutar ------------------------------ */

const FALLBACK_RATES: Record<string, number> = { EUR: 5.0 };

/** Cel mai recent curs cunoscut pentru fiecare monedă (din cache-ul BNR), cu rezervă EUR = 5,0. */
export async function latestRates(): Promise<Record<string, number>> {
  const rows = await db
    .select({ currency: exchangeRates.currency, rate: exchangeRates.rate, date: exchangeRates.date })
    .from(exchangeRates)
    .where(lte(exchangeRates.date, todayIso()))
    .orderBy(asc(exchangeRates.date));
  const out: Record<string, number> = { RON: 1, ...FALLBACK_RATES };
  for (const r of rows) out[r.currency] = r.rate; // ordonat crescător → rămâne ultimul
  return out;
}

/**
 * Convertor pentru plăți fără curs propriu: folosește cursul documentului legat,
 * altfel ultimul curs BNR ≤ data plății, altfel cel mai recent curs cunoscut.
 */
export async function rateResolver() {
  const rows = await db.select().from(exchangeRates).orderBy(asc(exchangeRates.date));
  const byCurrency = new Map<string, { date: string; rate: number }[]>();
  for (const r of rows) {
    const list = byCurrency.get(r.currency) ?? [];
    list.push({ date: r.date, rate: r.rate });
    byCurrency.set(r.currency, list);
  }
  return (currency: string, date: string, docRate?: number | null, docCurrency?: string | null): number => {
    if (!currency || currency === "RON") return 1;
    if (docRate && docRate > 0 && docCurrency === currency && docRate !== 1) return docRate;
    const list = byCurrency.get(currency);
    if (list?.length) {
      let found = list[0].rate;
      for (const r of list) {
        if (r.date <= date) found = r.rate;
        else break;
      }
      return found;
    }
    return FALLBACK_RATES[currency] ?? 1;
  };
}

/** Variație procentuală (null dacă baza e zero). */
export function pctDelta(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
