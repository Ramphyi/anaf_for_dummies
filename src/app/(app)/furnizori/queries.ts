import "server-only";
import { addDays } from "date-fns";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { PartnerRow } from "@/components/catalog/partner-table";
import { db } from "@/lib/db";
import { partners, payments, purchaseInvoices, stockDocuments } from "@/lib/db/schema";
import { todayIso, toIsoDate } from "@/lib/format";
import { daysBetween, lastMonths, monthKey, monthsAgoStart } from "@/lib/purchases/periods";
import { purchaseDisplayStatus } from "@/lib/purchases/schema";
import { round2 } from "@/lib/utils";

/** Lista de furnizori cu agregatele de achiziții (în RON). */
export async function getSupplierList(companyId: string, opts: { archived?: boolean } = {}) {
  const today = todayIso();
  const since = monthsAgoStart(12);
  const rows = await db.query.partners.findMany({
    where: and(eq(partners.companyId, companyId), inArray(partners.kind, ["supplier", "both"]), eq(partners.active, !opts.archived)),
    orderBy: (p, { asc }) => [asc(p.name)],
  });
  const ron = sql`${purchaseInvoices.total} * ${purchaseInvoices.exchangeRate}`;
  const restRon = sql`(${purchaseInvoices.total} - ${purchaseInvoices.paidAmount}) * ${purchaseInvoices.exchangeRate}`;
  const isValid = sql`${purchaseInvoices.status} <> 'cancelled'`;
  const isOpen = sql`${purchaseInvoices.status} in ('unpaid','partially_paid')`;
  const agg = await db
    .select({
      supplierId: purchaseInvoices.supplierId,
      total: sql<number>`coalesce(sum(case when ${isValid} then ${ron} else 0 end), 0)`,
      total12: sql<number>`coalesce(sum(case when ${isValid} and ${purchaseInvoices.issueDate} >= ${since} then ${ron} else 0 end), 0)`,
      balance: sql<number>`coalesce(sum(case when ${isOpen} then ${restRon} else 0 end), 0)`,
      overdue: sql<number>`coalesce(sum(case when ${isOpen} and ${purchaseInvoices.dueDate} < ${today} then ${restRon} else 0 end), 0)`,
      lastDate: sql<string | null>`max(case when ${isValid} then ${purchaseInvoices.issueDate} end)`,
      count: sql<number>`sum(case when ${isValid} then 1 else 0 end)`,
    })
    .from(purchaseInvoices)
    .where(eq(purchaseInvoices.companyId, companyId))
    .groupBy(purchaseInvoices.supplierId);
  const bySupplier = new Map(agg.map((a) => [a.supplierId, a]));

  const list: (PartnerRow & { total12: number })[] = rows.map((p) => {
    const a = bySupplier.get(p.id);
    return {
      id: p.id,
      name: p.name,
      cui: p.cui,
      entityType: p.entityType,
      country: p.country,
      city: p.city,
      county: p.county,
      vatPayer: p.vatPayer,
      eInvoiceRegistered: p.eInvoiceRegistered,
      email: p.email,
      phone: p.phone,
      kind: p.kind,
      total: round2(a?.total ?? 0),
      total12: round2(a?.total12 ?? 0),
      balance: Math.max(0, round2(a?.balance ?? 0)),
      overdue: Math.max(0, round2(a?.overdue ?? 0)),
      lastDate: a?.lastDate ?? null,
      count: a?.count ?? 0,
    };
  });

  const months = lastMonths(12);
  const monthly = await db
    .select({ m: sql<string>`substr(${purchaseInvoices.issueDate}, 1, 7)`, v: sql<number>`sum(${ron})` })
    .from(purchaseInvoices)
    .where(and(eq(purchaseInvoices.companyId, companyId), isValid, sql`${purchaseInvoices.issueDate} >= ${since}`))
    .groupBy(sql`substr(${purchaseInvoices.issueDate}, 1, 7)`);
  const mm = new Map(monthly.map((r) => [r.m, r.v]));

  // de plătit în următoarele 7 zile
  const limit = toIsoDate(addDays(new Date(), 7));
  const [dueSoon] = await db
    .select({ v: sql<number>`coalesce(sum(${restRon}), 0)`, n: sql<number>`count(*)` })
    .from(purchaseInvoices)
    .where(and(eq(purchaseInvoices.companyId, companyId), isOpen, sql`${purchaseInvoices.dueDate} >= ${today}`, sql`${purchaseInvoices.dueDate} <= ${limit}`));
  const [archivedCount] = await db
    .select({ n: sql<number>`count(*)` })
    .from(partners)
    .where(and(eq(partners.companyId, companyId), inArray(partners.kind, ["supplier", "both"]), eq(partners.active, false)));

  return {
    list,
    spark: months.map((m) => round2(mm.get(m.key) ?? 0)),
    dueSoon: { amount: round2(dueSoon?.v ?? 0), count: dueSoon?.n ?? 0 },
    archivedCount: archivedCount?.n ?? 0,
  };
}

export async function getSupplierProfile(companyId: string, partnerId: string) {
  const partner = await db.query.partners.findFirst({ where: and(eq(partners.id, partnerId), eq(partners.companyId, companyId)) });
  if (!partner) return null;
  const today = todayIso();

  const [purchases, pays, receipts] = await Promise.all([
    db.query.purchaseInvoices.findMany({
      where: and(eq(purchaseInvoices.companyId, companyId), eq(purchaseInvoices.supplierId, partnerId)),
      orderBy: [desc(purchaseInvoices.issueDate)],
      columns: {
        id: true,
        number: true,
        issueDate: true,
        dueDate: true,
        currency: true,
        exchangeRate: true,
        total: true,
        paidAmount: true,
        status: true,
        category: true,
        source: true,
      },
    }),
    db
      .select({
        id: payments.id,
        date: payments.date,
        amount: payments.amount,
        currency: payments.currency,
        method: payments.method,
        reference: payments.reference,
        purchaseInvoiceId: payments.purchaseInvoiceId,
        number: purchaseInvoices.number,
        rate: purchaseInvoices.exchangeRate,
      })
      .from(payments)
      .leftJoin(purchaseInvoices, eq(purchaseInvoices.id, payments.purchaseInvoiceId))
      .where(and(eq(payments.companyId, companyId), eq(payments.partnerId, partnerId), eq(payments.direction, "out")))
      .orderBy(desc(payments.date)),
    db.query.stockDocuments.findMany({
      where: and(eq(stockDocuments.companyId, companyId), eq(stockDocuments.partnerId, partnerId), eq(stockDocuments.type, "nir")),
      orderBy: [desc(stockDocuments.date)],
      with: { movements: { columns: { quantity: true, unitCost: true } }, warehouse: { columns: { name: true } } },
    }),
  ]);

  const valid = purchases.filter((p) => p.status !== "cancelled");
  const total = round2(valid.reduce((s, p) => s + p.total * p.exchangeRate, 0));
  const paid = round2(valid.reduce((s, p) => s + p.paidAmount * p.exchangeRate, 0));
  const open = valid.filter((p) => p.status === "unpaid" || p.status === "partially_paid");
  const balance = round2(open.reduce((s, p) => s + (p.total - p.paidAmount) * p.exchangeRate, 0));
  const overdue = round2(open.filter((p) => p.dueDate && p.dueDate < today).reduce((s, p) => s + (p.total - p.paidAmount) * p.exchangeRate, 0));

  const lastPay = new Map<string, string>();
  for (const p of pays) if (p.purchaseInvoiceId && (!lastPay.has(p.purchaseInvoiceId) || p.date > lastPay.get(p.purchaseInvoiceId)!)) lastPay.set(p.purchaseInvoiceId, p.date);
  const paidDocs = valid.filter((p) => p.status === "paid" && lastPay.has(p.id));
  const avgDays = paidDocs.length ? Math.round(paidDocs.reduce((s, p) => s + Math.max(0, daysBetween(p.issueDate, lastPay.get(p.id)!)), 0) / paidDocs.length) : null;

  const months = lastMonths(12);
  const chart = months.map((m) => ({
    month: m.label,
    long: m.long,
    a: round2(valid.filter((p) => monthKey(p.issueDate) === m.key).reduce((s, p) => s + p.total * p.exchangeRate, 0)),
    b: round2(pays.filter((p) => monthKey(p.date) === m.key).reduce((s, p) => s + p.amount * (p.rate ?? 1), 0)),
  }));

  return {
    partner,
    purchases: purchases.map((p) => ({ ...p, display: purchaseDisplayStatus(p, today), rest: round2(Math.max(0, p.total - p.paidAmount)) })),
    payments: pays,
    receipts: receipts.map((r) => ({
      id: r.id,
      number: r.number,
      date: r.date,
      warehouseName: r.warehouse?.name ?? "—",
      lines: r.movements.length,
      value: round2(r.movements.reduce((s, m) => s + m.quantity * m.unitCost, 0)),
    })),
    stats: { total, paid, balance, overdue, avgDays, count: valid.length },
    chart,
  };
}
