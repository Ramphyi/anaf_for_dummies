import { Boxes } from "lucide-react";
import { ReportHeader } from "@/components/reports/report-header";
import { StockExport, StockView } from "@/components/reports/stock-view";
import { requirePermission } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { resolvePeriod } from "@/lib/reports/period";
import { getStockReport } from "@/lib/reports/stock";

export const metadata = { title: "Raport stocuri" };

export default async function StockReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await requirePermission("reports");
  const period = resolvePeriod(await searchParams, "this_month");
  const data = await getStockReport(ctx.company.id, period);

  return (
    <div className="space-y-6">
      <ReportHeader
        title="Stocuri"
        description={`Valoarea stocului la ${formatDate(period.to)} (cost mediu ponderat) și mișcările din perioadă.`}
        icon={<Boxes />}
        period={period}
        company={{ name: ctx.company.name, cui: ctx.company.cui }}
        actions={<StockExport data={data} />}
      />
      <StockView data={data} />
    </div>
  );
}
