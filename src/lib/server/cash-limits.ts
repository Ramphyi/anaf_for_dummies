import "server-only";
import { and, eq, isNull, ne, or, type SQL } from "drizzle-orm";
import { CASH_LIMITS } from "@/lib/constants";
import type { DbOrTx } from "@/lib/db";
import { documents, partners, payments, purchaseInvoices } from "@/lib/db/schema";
import { formatDate, formatMoney } from "@/lib/format";
import { round2 } from "@/lib/utils";

type CashCheck = {
  companyId: string;
  partnerId: string | null;
  partnerName: string | null;
  isIndividual: boolean;
  direction: "in" | "out";
  date: string;
  /** Suma nouă, echivalent în lei. */
  amountRon: number;
};

/** Totalul în lei al plăților în numerar care respectă condiția (valuta se convertește cu cursul documentului). */
async function cashTotalRon(tx: DbOrTx, companyId: string, date: string, where: SQL | undefined) {
  const rows = await tx
    .select({ amount: payments.amount, currency: payments.currency, docRate: documents.exchangeRate, purchaseRate: purchaseInvoices.exchangeRate })
    .from(payments)
    .leftJoin(documents, eq(documents.id, payments.documentId))
    .leftJoin(purchaseInvoices, eq(purchaseInvoices.id, payments.purchaseInvoiceId))
    .leftJoin(partners, eq(partners.id, payments.partnerId))
    .where(and(eq(payments.companyId, companyId), eq(payments.method, "cash"), eq(payments.date, date), where));
  return round2(rows.reduce((s, p) => s + p.amount * (p.currency === "RON" ? 1 : (p.docRate ?? p.purchaseRate ?? 1)), 0));
}

/** Aruncă eroare dacă încasarea/plata în numerar ar depăși plafoanele zilnice din Legea 70/2015. */
export async function assertCashLimit(tx: DbOrTx, c: CashCheck) {
  if (!c.partnerId) return;
  const limit = c.isIndividual ? CASH_LIMITS.individual : CASH_LIMITS.company;
  const withPartner = round2((await cashTotalRon(tx, c.companyId, c.date, and(eq(payments.partnerId, c.partnerId), eq(payments.direction, c.direction)))) + c.amountRon);
  if (withPartner > limit) {
    const what = c.direction === "in" ? "Încasările" : "Plățile";
    const who = c.isIndividual ? "o persoană fizică" : "o firmă";
    throw new Error(
      `${what} în numerar cu ${c.partnerName ?? "acest partener"} pe ${formatDate(c.date)} ar ajunge la ${formatMoney(withPartner, "RON")}. ` +
        `Legea 70/2015 permite cel mult ${formatMoney(limit, "RON")} pe zi cu ${who} — diferența se decontează prin bancă (transfer, card, OP).`,
    );
  }

  // Plățile în numerar către firme au și un plafon total pe zi, indiferent de furnizor.
  if (c.direction !== "out" || c.isIndividual) return;
  const dayTotal = round2(
    (await cashTotalRon(tx, c.companyId, c.date, and(eq(payments.direction, "out"), or(isNull(partners.entityType), ne(partners.entityType, "pf"))))) + c.amountRon,
  );
  if (dayTotal > CASH_LIMITS.companyDailyOut) {
    throw new Error(
      `Plățile în numerar către firme pe ${formatDate(c.date)} ar ajunge la ${formatMoney(dayTotal, "RON")}. ` +
        `Legea 70/2015 permite cel mult ${formatMoney(CASH_LIMITS.companyDailyOut, "RON")} pe zi în total — restul se plătește prin bancă.`,
    );
  }
}
