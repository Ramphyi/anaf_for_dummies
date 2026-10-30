import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { Contact } from "lucide-react";
import { can, requireContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { allocations, projectMembers, projects, teamMembers } from "@/lib/db/schema";
import { todayIso } from "@/lib/format";
import { addDaysIso, monthStartOf } from "@/lib/outsourcing/dates";
import { canSeeMoney, getMemberUtilization } from "@/lib/outsourcing/server";
import { PageHeader } from "@/components/ui/page";
import { NewMemberButton, TeamView, type TeamCard } from "@/components/outsourcing/team-view";

export const metadata = { title: "Echipă" };

export default async function TeamPage() {
  const ctx = await requireContext();
  const cid = ctx.company.id;
  const today = todayIso();
  const money = canSeeMoney(ctx);
  const manage = can(ctx, "projects.manage");

  const [rows, util4w, utilMonth, memberProjects, allocs] = await Promise.all([
    db.query.teamMembers.findMany({ where: eq(teamMembers.companyId, cid), orderBy: (t, { asc }) => [asc(t.name)] }),
    getMemberUtilization(cid, addDaysIso(today, -27), today),
    getMemberUtilization(cid, monthStartOf(today), today),
    db
      .select({ memberId: projectMembers.memberId, id: projects.id, name: projects.name, code: projects.code, color: projects.color })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(and(eq(projects.companyId, cid), inArray(projects.status, ["active", "planning", "on_hold"]))),
    db
      .select({ memberId: allocations.memberId, hoursPerDay: allocations.hoursPerDay })
      .from(allocations)
      .where(and(eq(allocations.companyId, cid), lte(allocations.startDate, today), gte(allocations.endDate, today))),
  ]);

  const cards: TeamCard[] = rows.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    phone: m.phone,
    position: m.position,
    department: m.department,
    seniority: m.seniority,
    employmentType: m.employmentType,
    hourlyRate: money ? m.hourlyRate : 0,
    hourlyCost: money ? m.hourlyCost : 0,
    rateCurrency: m.rateCurrency,
    weeklyCapacity: m.weeklyCapacity,
    color: m.color,
    skills: m.skills ?? [],
    startDate: m.startDate,
    active: m.active,
    hasUser: !!m.userId,
    utilization: util4w.get(m.id)?.utilization ?? 0,
    billablePct: util4w.get(m.id)?.billablePct ?? 0,
    monthHours: utilMonth.get(m.id)?.hours ?? 0,
    allocatedToday: allocs.filter((a) => a.memberId === m.id).reduce((s, a) => s + a.hoursPerDay, 0),
    projects: memberProjects.filter((p) => p.memberId === m.id).map(({ id, name, code, color }) => ({ id, name, code, color })),
  }));

  return (
    <>
      <PageHeader
        title="Echipă"
        description="Oamenii firmei: rol, tarife, capacitate și grad de utilizare."
        icon={<Contact />}
        actions={manage ? <NewMemberButton /> : undefined}
      />
      <TeamView members={cards} canManage={manage} showMoney={money} />
    </>
  );
}
