import "server-only";
import { and, eq, gte, inArray, lte, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, partners } from "@/lib/db/schema";
import { displayStatus } from "@/lib/documents/status";
import { todayIso } from "@/lib/format";
import { round2, sum } from "@/lib/utils";
import { EXCLUDED_SALES_STATUSES, docRon, toRon } from "./common";
import { addDaysIso, daysBetween } from "./period";

export const AGING_BUCKETS = [
  { key: "current", label: "Curent", short: "Curent", min: -Infinity, max: 0 },
  { key: "d30", label: "1–30 zile", short: "1–30", min: 1, max: 30 },
  { key: "d60", label: "31–60 zile", short: "31–60", min: 31, max: 60 },
  { key: "d90", label: "61–90 zile", short: "61–90", min: 61, max: 90 },
  { key: "d90p", label: "> 90 zile", short: "> 90", min: 91, max: Infinity },
] as const;
export type AgingKey = (typeof AGING_BUCKETS)[number]["key"];
export type AgingAmounts = Record<AgingKey, number>;

const emptyBuckets = (): AgingAmounts => ({ current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 });

export type OpenInvoiceRow = {
  id: string;
  fullNumber: string;
  partnerId: string | null;
  clientName: string;
  email: string | null;
  issueDate: string;
  dueDate: string;
  daysOverdue: number;
  currency: string;
  total: number;
  remaining: number; // în moneda facturii
  remainingRon: number;
  bucket: AgingKey;
  status: string;
};

export type AgingReport = Awaited<ReturnType<typeof getAgingReport>>;

export async function getAgingReport(companyId: string) {
  const today = todayIso();
  const rows = await db
    .select({ d: documents, partnerEmail: partners.email })
    .from(documents)
    .leftJoin(partners, eq(partners.id, documents.partnerId))
    .where(
      and(
        eq(documents.companyId, companyId),
        eq(documents.kind, "invoice"),
        eq(documents.isCreditNote, false),
        inArray(documents.status, ["issued", "partially_paid"]),
      ),
    );

  const invoices: OpenInvoiceRow[] = rows
    .map(({ d, partnerEmail }) => {
      const remaining = round2(Math.max(0, d.total - d.paidAmount));
      const due = d.dueDate ?? d.issueDate;
      const days = daysBetween(due, today);
      const bucket = AGING_BUCKETS.find((b) => days >= b.min && days <= b.max)!.key;
      return {
        id: d.id,
        fullNumber: d.fullNumber,
        partnerId: d.partnerId,
        clientName: d.clientName,
        email: d.clientEmail || partnerEmail || null,
        issueDate: d.issueDate,
        dueDate: due,
        daysOverdue: Math.max(0, days),
        currency: d.currency,
        total: d.total,
        remaining,
        remainingRon: round2(toRon(remaining, d.currency, d.exchangeRate)),
        bucket,
        status: displayStatus(d),
      };
    })
    .filter((i) => i.remaining > 0.009)
    .sort((a, b) => b.daysOverdue - a.daysOverdue || b.remainingRon - a.remainingRon);

  const totals = emptyBuckets();
  const counts = emptyBuckets();
  for (const i of invoices) {
    totals[i.bucket] = round2(totals[i.bucket] + i.remainingRon);
    counts[i.bucket] += 1;
  }

  /* pe client */
  const clientMap = new Map<string, { key: string; partnerId: string | null; name: string; email: string | null; buckets: AgingAmounts; total: number; overdue: number; count: number; maxDays: number }>();
  for (const i of invoices) {
    const key = i.partnerId ?? `name:${i.clientName}`;
    const c = clientMap.get(key) ?? { key, partnerId: i.partnerId, name: i.clientName, email: i.email, buckets: emptyBuckets(), total: 0, overdue: 0, count: 0, maxDays: 0 };
    c.buckets[i.bucket] = round2(c.buckets[i.bucket] + i.remainingRon);
    c.total = round2(c.total + i.remainingRon);
    if (i.bucket !== "current") c.overdue = round2(c.overdue + i.remainingRon);
    c.count++;
    c.maxDays = Math.max(c.maxDays, i.daysOverdue);
    clientMap.set(key, c);
  }
  const clients = [...clientMap.values()].sort((a, b) => b.overdue - a.overdue || b.total - a.total);

  const overdueList = invoices.filter((i) => i.bucket !== "current");
  const totalOpen = round2(sum(invoices, (i) => i.remainingRon));
  const totalOverdue = round2(sum(overdueList, (i) => i.remainingRon));
  const weightedDays = totalOverdue ? sum(overdueList, (i) => i.daysOverdue * i.remainingRon) / totalOverdue : 0;

  // DSO = creanțe / vânzări (cu TVA) din ultimele 90 de zile × 90
  const recent = await db.query.documents.findMany({
    where: and(
      eq(documents.companyId, companyId),
      eq(documents.kind, "invoice"),
      notInArray(documents.status, [...EXCLUDED_SALES_STATUSES]),
      gte(documents.issueDate, addDaysIso(today, -89)),
      lte(documents.issueDate, today),
    ),
    columns: { subtotal: true, vatTotal: true, total: true, paidAmount: true, currency: true, exchangeRate: true, isCreditNote: true },
  });
  const sales90 = sum(recent, (d) => docRon(d).gross);
  const dso = sales90 > 0 ? (totalOpen / sales90) * 90 : 0;

  return {
    today,
    buckets: AGING_BUCKETS.map((b) => ({ key: b.key, label: b.label, short: b.short, amount: totals[b.key], count: counts[b.key] })),
    clients,
    invoices,
    kpis: {
      totalOpen,
      totalOverdue,
      overdueCount: overdueList.length,
      overdueClients: clients.filter((c) => c.overdue > 0).length,
      avgDaysOverdue: Math.round(weightedDays),
      over90: totals.d90p,
      dso: Math.round(dso),
      overduePct: totalOpen ? (totalOverdue / totalOpen) * 100 : 0,
    },
  };
}
