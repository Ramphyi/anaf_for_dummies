import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { PartnerRow } from "@/components/catalog/partner-table";
import { db } from "@/lib/db";
import { documents, partners, payments, projects } from "@/lib/db/schema";
import { displayStatus, remaining } from "@/lib/documents/status";
import { todayIso } from "@/lib/format";
import { daysBetween, lastMonths, monthKey, monthsAgoStart } from "@/lib/purchases/periods";
import { round2 } from "@/lib/utils";

const BILLED = ["issued", "partially_paid", "paid", "storned"] as const;
const OPEN = ["issued", "partially_paid"] as const;

/** Lista de clienți cu agregatele de facturare (în RON). */
export async function getClientList(companyId: string, opts: { archived?: boolean } = {}) {
  const today = todayIso();
  const since = monthsAgoStart(12);
  const rows = await db.query.partners.findMany({
    where: and(eq(partners.companyId, companyId), inArray(partners.kind, ["client", "both"]), eq(partners.active, !opts.archived)),
    orderBy: (p, { asc }) => [asc(p.name)],
  });
  const ron = sql`${documents.total} * ${documents.exchangeRate}`;
  const restRon = sql`(${documents.total} - ${documents.paidAmount}) * ${documents.exchangeRate}`;
  const isBilled = sql`${documents.status} in ('issued','partially_paid','paid','storned')`;
  const isOpen = sql`${documents.status} in ('issued','partially_paid') and ${documents.isCreditNote} = 0`;
  const agg = await db
    .select({
      partnerId: documents.partnerId,
      total: sql<number>`coalesce(sum(case when ${isBilled} then ${ron} else 0 end), 0)`,
      total12: sql<number>`coalesce(sum(case when ${isBilled} and ${documents.issueDate} >= ${since} then ${ron} else 0 end), 0)`,
      balance: sql<number>`coalesce(sum(case when ${isOpen} then ${restRon} else 0 end), 0)`,
      overdue: sql<number>`coalesce(sum(case when ${isOpen} and ${documents.dueDate} < ${today} then ${restRon} else 0 end), 0)`,
      lastDate: sql<string | null>`max(case when ${isBilled} then ${documents.issueDate} end)`,
      count: sql<number>`sum(case when ${isBilled} then 1 else 0 end)`,
    })
    .from(documents)
    .where(and(eq(documents.companyId, companyId), eq(documents.kind, "invoice")))
    .groupBy(documents.partnerId);
  const byPartner = new Map(agg.map((a) => [a.partnerId, a]));

  const list: (PartnerRow & { total12: number })[] = rows.map((p) => {
    const a = byPartner.get(p.id);
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

  // sparkline: facturat pe lună (toți clienții)
  const months = lastMonths(12);
  const monthly = await db
    .select({ m: sql<string>`substr(${documents.issueDate}, 1, 7)`, v: sql<number>`sum(${ron})` })
    .from(documents)
    .where(and(eq(documents.companyId, companyId), eq(documents.kind, "invoice"), inArray(documents.status, [...BILLED]), sql`${documents.issueDate} >= ${since}`))
    .groupBy(sql`substr(${documents.issueDate}, 1, 7)`);
  const mm = new Map(monthly.map((r) => [r.m, r.v]));
  const [archivedCount] = await db
    .select({ n: sql<number>`count(*)` })
    .from(partners)
    .where(and(eq(partners.companyId, companyId), inArray(partners.kind, ["client", "both"]), eq(partners.active, false)));

  return { list, spark: months.map((m) => round2(mm.get(m.key) ?? 0)), archivedCount: archivedCount?.n ?? 0 };
}

/** Toate datele pentru profilul unui client. */
export async function getClientProfile(companyId: string, partnerId: string) {
  const partner = await db.query.partners.findFirst({ where: and(eq(partners.id, partnerId), eq(partners.companyId, companyId)) });
  if (!partner) return null;
  const today = todayIso();

  const [docs, pays, projs] = await Promise.all([
    db.query.documents.findMany({
      where: and(eq(documents.companyId, companyId), eq(documents.partnerId, partnerId)),
      orderBy: [desc(documents.issueDate), desc(documents.number)],
      columns: {
        id: true,
        kind: true,
        isCreditNote: true,
        fullNumber: true,
        status: true,
        issueDate: true,
        dueDate: true,
        currency: true,
        exchangeRate: true,
        total: true,
        paidAmount: true,
        efacturaStatus: true,
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
        receiptSeries: payments.receiptSeries,
        receiptNumber: payments.receiptNumber,
        documentId: payments.documentId,
        documentNumber: documents.fullNumber,
        rate: documents.exchangeRate,
      })
      .from(payments)
      .leftJoin(documents, eq(documents.id, payments.documentId))
      .where(and(eq(payments.companyId, companyId), eq(payments.partnerId, partnerId), eq(payments.direction, "in")))
      .orderBy(desc(payments.date)),
    db.query.projects.findMany({
      where: and(eq(projects.companyId, companyId), eq(projects.clientId, partnerId)),
      orderBy: (p, { desc: d }) => [d(p.createdAt)],
      columns: { id: true, name: true, code: true, status: true, billingType: true, color: true, startDate: true, endDate: true, currency: true, budgetAmount: true },
    }),
  ]);

  const invoices = docs.filter((d) => d.kind === "invoice" && (BILLED as readonly string[]).includes(d.status));
  const billed = round2(invoices.reduce((s, d) => s + d.total * d.exchangeRate, 0));
  const collected = round2(invoices.reduce((s, d) => s + d.paidAmount * d.exchangeRate, 0));
  const open = invoices.filter((d) => (OPEN as readonly string[]).includes(d.status) && !d.isCreditNote);
  const balance = round2(open.reduce((s, d) => s + remaining(d) * d.exchangeRate, 0));
  const overdue = round2(open.filter((d) => d.dueDate && d.dueDate < today).reduce((s, d) => s + remaining(d) * d.exchangeRate, 0));

  // zile medii de încasare: de la emitere până la ultima încasare, pentru facturile încasate integral
  const lastPay = new Map<string, string>();
  for (const p of pays) if (p.documentId && (!lastPay.has(p.documentId) || p.date > lastPay.get(p.documentId)!)) lastPay.set(p.documentId, p.date);
  const paidDocs = invoices.filter((d) => d.status === "paid" && lastPay.has(d.id));
  const avgDays = paidDocs.length ? Math.round(paidDocs.reduce((s, d) => s + Math.max(0, daysBetween(d.issueDate, lastPay.get(d.id)!)), 0) / paidDocs.length) : null;

  const months = lastMonths(12);
  const chart = months.map((m) => ({
    month: m.label,
    long: m.long,
    a: round2(invoices.filter((d) => monthKey(d.issueDate) === m.key).reduce((s, d) => s + d.total * d.exchangeRate, 0)),
    b: round2(pays.filter((p) => monthKey(p.date) === m.key).reduce((s, p) => s + p.amount * (p.rate ?? 1), 0)),
  }));

  return {
    partner,
    documents: docs.map((d) => ({ ...d, display: displayStatus(d), rest: remaining(d) })),
    payments: pays,
    projects: projs,
    stats: { billed, collected, balance, overdue, avgDays, invoiceCount: invoices.length },
    chart,
  };
}
