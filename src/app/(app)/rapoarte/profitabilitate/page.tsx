import { PiggyBank } from "lucide-react";
import { ProfitabilityExport, ProfitabilityView } from "@/components/reports/profitability-view";
import { ReportHeader } from "@/components/reports/report-header";
import { requirePermission } from "@/lib/auth/session";
import { resolvePeriod } from "@/lib/reports/period";
import { getProfitabilityReport } from "@/lib/reports/profitability";

export const metadata = { title: "Profitabilitate" };

export default async function ProfitabilityPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await requirePermission("reports");
  const period = resolvePeriod(await searchParams, "this_year");
  const data = await getProfitabilityReport(ctx.company.id, period);

  return (
    <div className="space-y-6">
      <ReportHeader
        title="Profitabilitate"
        description="Marjă pe proiect și client, plus contul de profit și pierdere lunar (estimativ, de gestiune)."
        icon={<PiggyBank />}
        period={period}
        company={{ name: ctx.company.name, cui: ctx.company.cui }}
        actions={<ProfitabilityExport data={data} />}
      />
      <ProfitabilityView data={data} />
    </div>
  );
}
