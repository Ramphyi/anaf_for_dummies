import { Timer } from "lucide-react";
import { ReportHeader } from "@/components/reports/report-header";
import { TimesheetExport, TimesheetFilters, TimesheetView } from "@/components/reports/timesheet-view";
import { requirePermission } from "@/lib/auth/session";
import { resolvePeriod } from "@/lib/reports/period";
import { getTimesheetReport } from "@/lib/reports/timesheet";

export const metadata = { title: "Raport pontaj" };

type SP = { from?: string; to?: string; project?: string; member?: string; status?: string };

export default async function TimesheetReportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePermission("reports");
  const sp = await searchParams;
  const period = resolvePeriod(sp, "this_month");
  const filters = { project: sp.project ?? "", member: sp.member ?? "", status: sp.status === "approved" ? ("approved" as const) : ("all" as const) };
  const data = await getTimesheetReport(ctx.company.id, period, {
    projectId: filters.project || null,
    memberId: filters.member || null,
    approvedOnly: filters.status === "approved",
  });

  return (
    <div className="space-y-6">
      <ReportHeader
        title="Pontaj & utilizare"
        description="Ore pe membru și proiect, procent facturabil și grad de utilizare față de capacitate."
        icon={<Timer />}
        period={period}
        company={{ name: ctx.company.name, cui: ctx.company.cui }}
        printNote={filters.status === "approved" ? "Doar ore aprobate" : "Toate orele (fără cele respinse)"}
        actions={<TimesheetExport data={data} />}
      />
      <TimesheetFilters data={data} filters={filters} />
      <TimesheetView data={data} />
    </div>
  );
}
