import { AlarmClock } from "lucide-react";
import { AgingExport, AgingView } from "@/components/reports/aging-view";
import { ReportHeader } from "@/components/reports/report-header";
import { can, requirePermission } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { getAgingReport } from "@/lib/reports/receivables";

export const metadata = { title: "Restanțe clienți" };

export default async function AgingReportPage() {
  const ctx = await requirePermission("reports");
  const data = await getAgingReport(ctx.company.id);

  return (
    <div className="space-y-6">
      <ReportHeader
        title="Restanțe clienți"
        description={`Creanțe neîncasate pe intervale de vechime — situație la ${formatDate(data.today)}.`}
        icon={<AlarmClock />}
        company={{ name: ctx.company.name, cui: ctx.company.cui }}
        printNote={`Situație la ${formatDate(data.today)}`}
        actions={<AgingExport data={data} />}
      />
      <AgingView data={data} canSend={can(ctx, "billing")} />
    </div>
  );
}
