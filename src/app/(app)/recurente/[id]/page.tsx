import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { companyDefaults, latestRates, loadEditorData, toPartnerOption } from "@/components/documents/server";
import { getContext, requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { documents, recurringInvoices } from "@/lib/db/schema";
import { displayStatus } from "@/lib/documents/status";
import { RecurringForm } from "../recurring-form";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const ctx = await getContext();
  if (!ctx) return { title: "Factură recurentă" };
  const r = await db.query.recurringInvoices.findFirst({
    where: and(eq(recurringInvoices.id, id), eq(recurringInvoices.companyId, ctx.company.id)),
    columns: { name: true },
  });
  return { title: r?.name ?? "Factură recurentă" };
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  const ctx = await requirePermission("billing");
  const r = await db.query.recurringInvoices.findFirst({
    where: and(eq(recurringInvoices.id, id), eq(recurringInvoices.companyId, ctx.company.id)),
    with: { partner: true },
  });
  if (!r) notFound();
  const [data, rates, history] = await Promise.all([
    loadEditorData(ctx.company.id, "recurring"),
    latestRates(),
    db.query.documents.findMany({
      where: and(eq(documents.companyId, ctx.company.id), eq(documents.recurringId, id)),
      orderBy: desc(documents.issueDate),
      columns: { id: true, fullNumber: true, issueDate: true, total: true, currency: true, status: true, dueDate: true, paidAmount: true, kind: true },
    }),
  ]);
  if (r.partner && !data.partners.some((p) => p.id === r.partnerId)) data.partners.push(toPartnerOption(r.partner));
  return (
    <RecurringForm
      initial={{
        id: r.id,
        name: r.name,
        partnerId: r.partnerId,
        seriesId: r.seriesId,
        frequency: r.frequency,
        intervalCount: r.intervalCount,
        startDate: r.startDate,
        nextRunDate: r.nextRunDate,
        endDate: r.endDate,
        dueDays: r.dueDays,
        currency: r.currency,
        notes: r.notes,
        autoIssue: r.autoIssue,
        autoSendEmail: r.autoSendEmail,
        autoSendEfactura: r.autoSendEfactura,
        active: r.active,
        lines: r.lines.map((l) => ({ ...l, productId: l.productId ?? null, description: l.description ?? null })),
      }}
      partners={data.partners}
      products={data.products}
      series={data.series}
      company={companyDefaults(ctx.company)}
      rates={rates}
      history={history.map((h) => ({ id: h.id, fullNumber: h.fullNumber, issueDate: h.issueDate, total: h.total, currency: h.currency, status: displayStatus(h) }))}
    />
  );
}
