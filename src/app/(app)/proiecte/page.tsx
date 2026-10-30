import { and, eq, inArray } from "drizzle-orm";
import { FolderKanban } from "lucide-react";
import { can, requireContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { partners, projectMembers, projects, tasks, teamMembers } from "@/lib/db/schema";
import { monthStartOf } from "@/lib/outsourcing/dates";
import { budgetInfo, convertAmount } from "@/lib/outsourcing/metrics";
import { canSeeMoney, getProjectStats, loadClientOptions, loadMembersLite, loadRateBook } from "@/lib/outsourcing/server";
import { todayIso } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { NewProjectButton, ProjectsView, type ProjectCardData } from "@/components/outsourcing/projects-view";

export const metadata = { title: "Proiecte" };

export default async function ProjectsPage() {
  const ctx = await requireContext();
  const cid = ctx.company.id;
  const today = todayIso();
  const rates = await loadRateBook(cid);

  const [rows, team, taskRows, allStats, monthStats, clients, members] = await Promise.all([
    db
      .select({ p: projects, clientName: partners.name })
      .from(projects)
      .leftJoin(partners, eq(partners.id, projects.clientId))
      .where(eq(projects.companyId, cid))
      .orderBy(projects.name),
    db
      .select({ projectId: projectMembers.projectId, name: teamMembers.name, color: teamMembers.color })
      .from(projectMembers)
      .innerJoin(teamMembers, eq(teamMembers.id, projectMembers.memberId))
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(and(eq(projects.companyId, cid), eq(teamMembers.active, true))),
    db
      .select({ projectId: tasks.projectId, status: tasks.status })
      .from(tasks)
      .where(and(eq(tasks.companyId, cid), inArray(tasks.status, ["backlog", "todo", "in_progress", "review", "done"]))),
    getProjectStats(cid, { rates }),
    getProjectStats(cid, { from: monthStartOf(today), to: today, rates }),
    loadClientOptions(cid),
    loadMembersLite(cid),
  ]);

  const money = canSeeMoney(ctx);
  const data: ProjectCardData[] = rows.map(({ p, clientName }) => {
    const s = allStats.get(p.id);
    const m = monthStats.get(p.id);
    const pt = taskRows.filter((t) => t.projectId === p.id);
    return {
      id: p.id,
      name: p.name,
      code: p.code,
      color: p.color,
      status: p.status,
      billingType: p.billingType,
      currency: p.currency,
      clientName,
      startDate: p.startDate,
      endDate: p.endDate,
      monthlyRetainer: money ? p.monthlyRetainer : null,
      team: team.filter((t) => t.projectId === p.id).map((t) => ({ name: t.name, color: t.color })),
      hours: s?.hours ?? 0,
      monthHours: m?.hours ?? 0,
      revenue: money ? (s?.revenue ?? 0) : 0,
      budget: budgetInfo(p, s?.hours ?? 0, s?.revenue ?? 0),
      budgetIsMoney: !(p.budgetHours && p.budgetHours > 0) && !!p.budgetAmount,
      tasksOpen: pt.filter((t) => t.status !== "done").length,
      tasksDone: pt.filter((t) => t.status === "done").length,
    };
  });
  // dacă utilizatorul nu vede sume, ascundem bugetele monetare
  if (!money) for (const d of data) if (d.budgetIsMoney) d.budget = { percent: d.budget.percent, used: 0, total: null, unit: "money" };

  const active = data.filter((d) => d.status === "active");
  const monthRevenueEur = money
    ? [...monthStats.entries()].reduce((a, [id, s]) => a + convertAmount(s.revenue, rates.currency(id), "EUR", rates.fx), 0)
    : 0;
  const uninvoiced = [...allStats.values()].reduce((a, s) => a + s.uninvoicedApprovedHours, 0);

  return (
    <>
      <PageHeader
        title="Proiecte"
        description="Toate proiectele firmei: buget, echipă, progres și ore pontate."
        icon={<FolderKanban />}
        actions={can(ctx, "projects.manage") ? <NewProjectButton clients={clients} members={members} /> : undefined}
      />
      <ProjectsView
        projects={data}
        canManage={can(ctx, "projects.manage")}
        showMoney={money}
        kpis={{
          active: active.length,
          monthHours: data.reduce((a, d) => a + d.monthHours, 0),
          uninvoiced,
          monthRevenue: monthRevenueEur,
          openTasks: data.reduce((a, d) => a + d.tasksOpen, 0),
        }}
      />
    </>
  );
}
