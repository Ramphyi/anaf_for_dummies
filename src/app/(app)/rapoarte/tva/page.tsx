import { Landmark } from "lucide-react";
import { ReportHeader } from "@/components/reports/report-header";
import { VatExport, VatView } from "@/components/reports/vat-view";
import { requirePermission } from "@/lib/auth/session";
import { resolvePeriod } from "@/lib/reports/period";
import { getVatReport } from "@/lib/reports/vat";

export const metadata = { title: "Raport TVA" };

export default async function VatReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await requirePermission("reports");
  const period = resolvePeriod(await searchParams, "this_month");
  const data = await getVatReport(ctx.company, period);

  return (
    <div className="space-y-6">
      <ReportHeader
        title="TVA — jurnale și decont"
        description="Jurnalul de vânzări și de cumpărări pe cote, cu decontul estimat pentru perioadă."
        icon={<Landmark />}
        period={period}
        company={{ name: ctx.company.name, cui: ctx.company.cui }}
        actions={<VatExport data={data} />}
      />
      <VatView data={data} />
    </div>
  );
}
