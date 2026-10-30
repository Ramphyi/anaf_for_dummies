import { Wallet } from "lucide-react";
import { CashflowExport, CashflowView } from "@/components/reports/cashflow-view";
import { ReportHeader } from "@/components/reports/report-header";
import { requirePermission } from "@/lib/auth/session";
import { getCashflowReport } from "@/lib/reports/cashflow";
import { resolvePeriod } from "@/lib/reports/period";

export const metadata = { title: "Raport cash-flow" };

export default async function CashflowReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await requirePermission("reports");
  const period = resolvePeriod(await searchParams, "last_12");
  const data = await getCashflowReport(ctx.company.id, period);

  return (
    <div className="space-y-6">
      <ReportHeader
        title="Cash-flow"
        description="Încasări și plăți efective (după data plății), pe luni și metode, plus prognoza scadențelor."
        icon={<Wallet />}
        period={period}
        company={{ name: ctx.company.name, cui: ctx.company.cui }}
        actions={<CashflowExport data={data} />}
      />
      <CashflowView data={data} />
    </div>
  );
}
