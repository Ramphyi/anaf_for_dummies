import { and, asc, eq } from "drizzle-orm";
import { CalendarClock, FileStack, Plus, Repeat, TrendingUp } from "lucide-react";
import Link from "next/link";
import { daysBetween, monthlyFactor } from "@/components/documents/shared";
import { latestRates } from "@/components/documents/server";
import { Stagger, StaggerItem } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { StatCard } from "@/components/ui/stat-card";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { recurringInvoices } from "@/lib/db/schema";
import { computeTotals } from "@/lib/documents/totals";
import { todayIso } from "@/lib/format";
import { RecurringTable, type RecurringRow } from "./recurring-table";

export const metadata = { title: "Facturi recurente" };

export default async function RecurentePage() {
  const ctx = await requirePermission("billing");
  const [list, rates] = await Promise.all([
    db.query.recurringInvoices.findMany({
      where: and(eq(recurringInvoices.companyId, ctx.company.id)),
      orderBy: asc(recurringInvoices.nextRunDate),
      with: { partner: { columns: { name: true } } },
    }),
    latestRates(),
  ]);

  const rows: RecurringRow[] = list.map((r) => ({
    id: r.id,
    name: r.name,
    partnerId: r.partnerId,
    partnerName: r.partner?.name ?? "—",
    frequency: r.frequency,
    intervalCount: r.intervalCount,
    nextRunDate: r.nextRunDate,
    endDate: r.endDate,
    total: computeTotals(r.lines).total,
    currency: r.currency,
    active: r.active,
    generatedCount: r.generatedCount,
    lastRunAt: r.lastRunAt,
    autoIssue: r.autoIssue,
    autoSendEfactura: r.autoSendEfactura,
    autoSendEmail: r.autoSendEmail,
  }));

  const today = todayIso();
  const active = rows.filter((r) => r.active);
  // MRR: valoarea fără TVA normalizată la o lună, în RON.
  const mrr = list
    .filter((r) => r.active)
    .reduce((a, r) => a + computeTotals(r.lines).subtotal * (r.currency === "RON" ? 1 : (rates[r.currency] ?? 0)) * monthlyFactor(r.frequency, r.intervalCount), 0);
  const soon = active.filter((r) => daysBetween(today, r.nextRunDate) <= 7).length;
  const generated = rows.reduce((a, r) => a + r.generatedCount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Facturi recurente"
        description="Abonamente, retainere și servicii lunare facturate automat."
        icon={<Repeat />}
        actions={
          <Button asChild>
            <Link href="/recurente/nou">
              <Plus /> Șablon nou
            </Link>
          </Button>
        }
      />
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Șabloane active" value={active.length} format="number" icon={<Repeat />} hint={`${rows.length - active.length} pe pauză`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Venit recurent lunar (MRR)" value={mrr} icon={<TrendingUp />} tone="success" hint="Fără TVA, echivalent RON" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="De generat în 7 zile" value={soon} format="number" icon={<CalendarClock />} tone="warning" hint={soon ? "Inclusiv cele scadente" : "Nimic programat"} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Facturi generate" value={generated} format="number" icon={<FileStack />} tone="info" hint="De la crearea șabloanelor" />
        </StaggerItem>
      </Stagger>
      <RecurringTable rows={rows} />
    </div>
  );
}
