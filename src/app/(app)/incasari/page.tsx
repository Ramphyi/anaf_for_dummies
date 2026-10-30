import { format, subMonths } from "date-fns";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Banknote, Building, Plus, Receipt, Wallet } from "lucide-react";
import Link from "next/link";
import { Stagger, StaggerItem } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { StatCard } from "@/components/ui/stat-card";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { documents, payments } from "@/lib/db/schema";
import { remaining } from "@/lib/documents/status";
import { todayIso } from "@/lib/format";
import { PaymentsView, type PaymentListRow } from "./payments-view";

export const metadata = { title: "Încasări & chitanțe" };

export default async function IncasariPage({ searchParams }: { searchParams: Promise<{ nou?: string; factura?: string }> }) {
  const { nou, factura } = await searchParams;
  const ctx = await requirePermission("billing");
  const cid = ctx.company.id;

  const [paymentRows, openInvoices] = await Promise.all([
    db.query.payments.findMany({
      where: and(eq(payments.companyId, cid), eq(payments.direction, "in")),
      orderBy: [desc(payments.date), desc(payments.createdAt)],
      with: { document: { columns: { id: true, fullNumber: true, exchangeRate: true } } },
    }),
    db.query.documents.findMany({
      where: and(eq(documents.companyId, cid), eq(documents.kind, "invoice"), eq(documents.isCreditNote, false), inArray(documents.status, ["issued", "partially_paid"])),
      orderBy: [desc(documents.issueDate)],
      columns: { id: true, fullNumber: true, clientName: true, total: true, paidAmount: true, currency: true, issueDate: true, dueDate: true },
    }),
  ]);

  const rows: PaymentListRow[] = paymentRows.map((p) => ({
    id: p.id,
    date: p.date,
    partnerId: p.partnerId,
    partnerName: p.partnerName ?? "—",
    documentId: p.document?.id ?? null,
    documentNumber: p.document?.fullNumber ?? null,
    method: p.method,
    amount: p.amount,
    currency: p.currency,
    amountRon: p.currency === "RON" ? p.amount : p.amount * (p.document?.exchangeRate ?? 1),
    reference: p.reference,
    receipt: p.receiptNumber ? `${p.receiptSeries ?? ""} ${p.receiptNumber}`.trim() : null,
  }));

  const invoices = openInvoices
    .map((d) => ({ id: d.id, fullNumber: d.fullNumber, clientName: d.clientName, remaining: remaining(d), total: d.total, currency: d.currency, issueDate: d.issueDate, dueDate: d.dueDate }))
    .filter((d) => d.remaining > 0);

  const month = todayIso().slice(0, 7);
  const prevMonth = format(subMonths(new Date(), 1), "yyyy-MM");
  const sumOf = (list: PaymentListRow[]) => list.reduce((a, r) => a + r.amountRon, 0);
  const thisMonth = rows.filter((r) => r.date.startsWith(month));
  const collected = sumOf(thisMonth);
  const prevCollected = sumOf(rows.filter((r) => r.date.startsWith(prevMonth)));
  const cash = sumOf(thisMonth.filter((r) => r.method === "cash"));
  const bank = sumOf(thisMonth.filter((r) => ["bank", "op", "card"].includes(r.method)));
  const receiptsMonth = thisMonth.filter((r) => r.receipt).length;
  const receiptsTotal = rows.filter((r) => r.receipt).length;
  const spark = Array.from({ length: 6 }, (_, i) => sumOf(rows.filter((r) => r.date.startsWith(format(subMonths(new Date(), 5 - i), "yyyy-MM")))));
  const openNew = nou === "1";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Încasări & chitanțe"
        description="Plățile primite de la clienți, registrul de chitanțe și facturile rămase de încasat."
        icon={<Wallet />}
        actions={
          <Button asChild>
            <Link href="/incasari?nou=1" scroll={false}>
              <Plus /> Încasare nouă
            </Link>
          </Button>
        }
      />
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard
            label="Încasat luna aceasta"
            value={collected}
            icon={<Wallet />}
            tone="success"
            spark={spark}
            {...(prevCollected ? { delta: ((collected - prevCollected) / prevCollected) * 100, deltaLabel: "vs. luna trecută" } : {})}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Numerar" value={cash} icon={<Banknote />} tone="warning" hint={`${thisMonth.filter((r) => r.method === "cash").length} încasări în casă`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Bancă & card" value={bank} icon={<Building />} tone="info" hint={`${thisMonth.filter((r) => ["bank", "op", "card"].includes(r.method)).length} plăți prin bancă`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Chitanțe emise luna aceasta" value={receiptsMonth} format="number" icon={<Receipt />} hint={`${receiptsTotal} în total`} />
        </StaggerItem>
      </Stagger>
      <PaymentsView key={openNew ? "nou" : "list"} rows={rows} invoices={invoices} openNew={openNew} invoiceId={factura ?? null} />
    </div>
  );
}
