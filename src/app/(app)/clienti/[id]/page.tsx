import { CalendarClock, CircleDollarSign, HandCoins, TrendingUp } from "lucide-react";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { ClientTabs } from "@/components/catalog/client-tabs";
import { Kpi, KpiGrid } from "@/components/catalog/kpi";
import { MoneyBarsChart } from "@/components/catalog/money-bars-chart";
import { PartnerActions } from "@/components/catalog/partner-actions";
import { PartnerInitials, PartnerSubtitle } from "@/components/catalog/partner-badges";
import { FadeIn } from "@/components/motion";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { partners } from "@/lib/db/schema";
import { formatMoney } from "@/lib/format";
import { getClientProfile } from "../queries";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("billing");
  const p = await db.query.partners.findFirst({ where: and(eq(partners.id, id), eq(partners.companyId, ctx.company.id)), columns: { name: true } });
  return { title: p?.name ?? "Client" };
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("billing");
  const data = await getClientProfile(ctx.company.id, id);
  if (!data) notFound();
  if (data.partner.kind === "supplier") redirect(`/furnizori/${id}`);
  const { partner, stats } = data;
  const collectedPct = stats.billed > 0 ? Math.round((stats.collected / stats.billed) * 100) : 0;
  const term = partner.paymentTermDays;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Clienți", href: "/clienti" }, { label: partner.name }]}
        title={partner.name}
        description={<PartnerSubtitle partner={partner} />}
        icon={<PartnerInitials name={partner.name} />}
        actions={<PartnerActions partner={partner} mode="client" />}
      />

      <KpiGrid>
        <Kpi label="Total facturat" value={stats.billed} icon={<TrendingUp />} deltaLabel={`${stats.invoiceCount} facturi emise · RON`} />
        <Kpi label="Încasat" value={stats.collected} icon={<HandCoins />} tone="success" deltaLabel={stats.billed > 0 ? `${collectedPct}% din valoarea facturată` : "nimic facturat încă"} />
        <Kpi
          label="Sold de încasat"
          value={stats.balance}
          icon={<CircleDollarSign />}
          tone={stats.overdue > 0 ? "danger" : "info"}
          deltaLabel={stats.overdue > 0 ? `${formatMoney(stats.overdue)} cu scadența depășită` : stats.balance > 0 ? "nimic restant" : "la zi"}
        />
        <Kpi
          label="Zile medii de încasare"
          value={stats.avgDays ?? 0}
          format="number"
          icon={<CalendarClock />}
          tone={stats.avgDays != null && term != null && stats.avgDays > term ? "warning" : "brand"}
          deltaLabel={stats.avgDays == null ? "încă nu există facturi încasate" : term != null ? `termen contractual: ${term} zile` : "de la emitere la încasare"}
        />
      </KpiGrid>

      <FadeIn delay={0.1}>
        <Card>
          <CardHeaderRow title="Facturat vs. încasat" description="Ultimele 12 luni, echivalent RON" icon={<TrendingUp />} />
          <CardContent>
            <MoneyBarsChart data={data.chart} labels={["Facturat", "Încasat"]} />
          </CardContent>
        </Card>
      </FadeIn>

      <ClientTabs partner={partner} documents={data.documents} payments={data.payments} projects={data.projects} />
    </div>
  );
}
