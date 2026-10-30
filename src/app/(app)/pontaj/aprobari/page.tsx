import { and, eq } from "drizzle-orm";
import { CheckCheck } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projects, tasks, teamMembers, timeEntries } from "@/lib/db/schema";
import { weekStartOf } from "@/lib/outsourcing/dates";
import { PageHeader } from "@/components/ui/page";
import { ApprovalsView, type ApprovalEntry } from "@/components/outsourcing/approvals";

export const metadata = { title: "Aprobări pontaj" };

export default async function ApprovalsPage() {
  const ctx = await requirePermission("timesheet.approve");
  const cid = ctx.company.id;
  const rows = await db
    .select({
      id: timeEntries.id,
      date: timeEntries.date,
      hours: timeEntries.hours,
      description: timeEntries.description,
      billable: timeEntries.billable,
      memberId: timeEntries.memberId,
      memberName: teamMembers.name,
      memberColor: teamMembers.color,
      memberPosition: teamMembers.position,
      weeklyCapacity: teamMembers.weeklyCapacity,
      projectId: timeEntries.projectId,
      projectName: projects.name,
      projectColor: projects.color,
      projectCode: projects.code,
      taskTitle: tasks.title,
    })
    .from(timeEntries)
    .innerJoin(teamMembers, eq(teamMembers.id, timeEntries.memberId))
    .innerJoin(projects, eq(projects.id, timeEntries.projectId))
    .leftJoin(tasks, eq(tasks.id, timeEntries.taskId))
    .where(and(eq(timeEntries.companyId, cid), eq(timeEntries.status, "submitted")))
    .orderBy(teamMembers.name, timeEntries.date);

  const entries: ApprovalEntry[] = rows.map((r) => ({ ...r, weekStart: weekStartOf(r.date) }));

  return (
    <>
      <PageHeader
        title="Aprobări pontaj"
        description="Orele trimise de echipă, grupate pe persoană și săptămână."
        icon={<CheckCheck />}
        breadcrumbs={[{ label: "Pontaj", href: "/pontaj" }, { label: "Aprobări" }]}
      />
      <ApprovalsView entries={entries} />
    </>
  );
}
