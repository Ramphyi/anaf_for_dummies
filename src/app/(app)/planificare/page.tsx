import { and, eq, gte, inArray } from "drizzle-orm";
import { CalendarRange } from "lucide-react";
import { can, requireContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { allocations, timeOff } from "@/lib/db/schema";
import { todayIso } from "@/lib/format";
import { addDaysIso } from "@/lib/outsourcing/dates";
import { loadMembersLite, loadProjectsLite } from "@/lib/outsourcing/server";
import { PageHeader } from "@/components/ui/page";
import { Planner } from "@/components/outsourcing/planner";

export const metadata = { title: "Planificare echipă" };

export default async function PlannerPage() {
  const ctx = await requireContext();
  const cid = ctx.company.id;
  const today = todayIso();
  const horizon = addDaysIso(today, -26 * 7);

  const [members, projects, allocRows, offRows] = await Promise.all([
    loadMembersLite(cid),
    loadProjectsLite(cid),
    db
      .select()
      .from(allocations)
      .where(and(eq(allocations.companyId, cid), gte(allocations.endDate, horizon))),
    db
      .select()
      .from(timeOff)
      .where(and(eq(timeOff.companyId, cid), inArray(timeOff.status, ["approved", "pending"]), gte(timeOff.endDate, horizon))),
  ]);

  return (
    <>
      <PageHeader
        title="Planificare echipă"
        description="Cine pe ce proiect lucrează, zi de zi — alocări, concedii și grad de încărcare."
        icon={<CalendarRange />}
      />
      <Planner
        today={today}
        members={members.filter((m) => m.active)}
        projects={projects.filter((p) => p.status !== "cancelled")}
        allocations={allocRows.map((a) => ({
          id: a.id,
          memberId: a.memberId,
          projectId: a.projectId,
          startDate: a.startDate,
          endDate: a.endDate,
          hoursPerDay: a.hoursPerDay,
          notes: a.notes,
        }))}
        timeOff={offRows.map((t) => ({ id: t.id, memberId: t.memberId, type: t.type, startDate: t.startDate, endDate: t.endDate, status: t.status, notes: t.notes }))}
        canManage={can(ctx, "projects.manage")}
      />
    </>
  );
}
