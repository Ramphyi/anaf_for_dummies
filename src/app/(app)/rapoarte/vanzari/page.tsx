import { TrendingUp } from "lucide-react";
import { ReportHeader } from "@/components/reports/report-header";
import { SalesExport, SalesView } from "@/components/reports/sales-view";
import { requirePermission } from "@/lib/auth/session";
import { resolvePeriod } from "@/lib/reports/period";
import { getSalesReport } from "@/lib/reports/sales";

export const metadata = { title: "Raport vânzări" };

export default async function SalesReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await requirePermission("reports");
  const period = resolvePeriod(await searchParams, "last_12");
  const data = await getSalesReport(ctx.company.id, period);

  return (
    <div className="space-y-6">
      <ReportHeader
        title="Vânzări"
        description="Facturi emise (fără ciorne și anulate), în RON la cursul documentului; stornările scad din total."
        icon={<TrendingUp />}
        period={period}
        company={{ name: ctx.company.name, cui: ctx.company.cui }}
        actions={<SalesExport data={data} />}
      />
      <SalesView data={data} />
    </div>
  );
}
