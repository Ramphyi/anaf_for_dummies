import { and, eq } from "drizzle-orm";
import { CalendarClock, CircleDollarSign, HandCoins, TrendingDown } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Kpi, KpiGrid } from "@/components/catalog/kpi";
import { MoneyBarsChart } from "@/components/catalog/money-bars-chart";
import { PartnerActions } from "@/components/catalog/partner-actions";
import { PartnerInitials, PartnerSubtitle } from "@/components/catalog/partner-badges";
import { SupplierTabs } from "@/components/catalog/supplier-tabs";
import { FadeIn } from "@/components/motion";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { partners } from "@/lib/db/schema";
import { formatMoney } from "@/lib/format";
import { getSupplierProfile } from "../queries";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("billing");
  const p = await db.query.partners.findFirst({ where: and(eq(partners.id, id), eq(partners.companyId, ctx.company.id)), columns: { name: true } });
  return { title: p?.name ?? "Furnizor" };
}

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("billing");
  const data = await getSupplierProfile(ctx.company.id, id);
  if (!data) notFound();
  if (data.partner.kind === "client") redirect(`/clienti/${id}`);
  const { partner, stats } = data;
  const paidPct = stats.total > 0 ? Math.round((stats.paid / stats.total) * 100) : 0;
  const term = partner.paymentTermDays;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Furnizori", href: "/furnizori" }, { label: partner.name }]}
        title={partner.name}
        description={<PartnerSubtitle partner={partner} />}
        icon={<PartnerInitials name={partner.name} />}
        actions={<PartnerActions partner={partner} mode="supplier" />}
      />

      <KpiGrid>
        <Kpi label="Total achiziții" value={stats.total} icon={<TrendingDown />} tone="info" deltaLabel={`${stats.count} facturi primite · RON`} />
        <Kpi label="Plătit" value={stats.paid} icon={<HandCoins />} tone="success" deltaLabel={stats.total > 0 ? `${paidPct}% din total` : "nicio factură primită"} />
        <Kpi
          label="Sold de plată"
          value={stats.balance}
          icon={<CircleDollarSign />}
          tone={stats.overdue > 0 ? "danger" : "brand"}
          deltaLabel={stats.overdue > 0 ? `${formatMoney(stats.overdue)} cu scadența depășită` : stats.balance > 0 ? "nimic restant" : "la zi"}
        />
        <Kpi
          label="Zile medii de plată"
          value={stats.avgDays ?? 0}
          format="number"
          icon={<CalendarClock />}
          deltaLabel={stats.avgDays == null ? "încă nu există facturi plătite" : term != null ? `termen acordat: ${term} zile` : "de la factură la plată"}
        />
      </KpiGrid>

      <FadeIn delay={0.1}>
        <Card>
          <CardHeaderRow title="Achiziții vs. plăți" description="Ultimele 12 luni, echivalent RON" icon={<TrendingDown />} />
          <CardContent>
            <MoneyBarsChart data={data.chart} labels={["Achiziții", "Plăți"]} />
          </CardContent>
        </Card>
      </FadeIn>

      <SupplierTabs partner={partner} purchases={data.purchases} payments={data.payments} receipts={data.receipts} />
    </div>
  );
}
