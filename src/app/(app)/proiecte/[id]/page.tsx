import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { can, requireContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { documents, partners, projectMembers, projects, tasks, teamMembers, timeEntries } from "@/lib/db/schema";
import { todayIso } from "@/lib/format";
import { addDaysIso, daysBetween, formatDay, monthStartOf, weekStartOf } from "@/lib/outsourcing/dates";
import { budgetInfo } from "@/lib/outsourcing/metrics";
import { canSeeMoney, getProjectStats, loadClientOptions, loadMembersLite, loadRateBook } from "@/lib/outsourcing/server";
import { round2 } from "@/lib/utils";
import { ProjectDetail, type ProjectDetailData } from "@/components/outsourcing/project-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext();
  const p = await db.query.projects.findFirst({ where: and(eq(projects.id, id), eq(projects.companyId, ctx.company.id)), columns: { name: true } });
  return { title: p?.name ?? "Proiect" };
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext();
  const cid = ctx.company.id;
  const project = await db.query.projects.findFirst({ where: and(eq(projects.id, id), eq(projects.companyId, cid)) });
  if (!project) notFound();

  const today = todayIso();
  const money = canSeeMoney(ctx);
  const canBill = can(ctx, "billing");
  const rates = await loadRateBook(cid);

  const [client, manager, memberRows, taskRows, entryRows, docs, statsMap, monthStatsMap, team, clients] = await Promise.all([
    project.clientId ? db.query.partners.findFirst({ where: and(eq(partners.id, project.clientId), eq(partners.companyId, cid)) }) : null,
    project.managerId ? db.query.teamMembers.findFirst({ where: and(eq(teamMembers.id, project.managerId), eq(teamMembers.companyId, cid)) }) : null,
    db
      .select({ pm: projectMembers, m: teamMembers })
      .from(projectMembers)
      .innerJoin(teamMembers, eq(teamMembers.id, projectMembers.memberId))
      .where(eq(projectMembers.projectId, id))
      .orderBy(teamMembers.name),
    db.select().from(tasks).where(eq(tasks.projectId, id)).orderBy(tasks.position),
    db
      .select({
        id: timeEntries.id,
        date: timeEntries.date,
        hours: timeEntries.hours,
        description: timeEntries.description,
        billable: timeEntries.billable,
        status: timeEntries.status,
        memberId: timeEntries.memberId,
        taskId: timeEntries.taskId,
        invoicedDocumentId: timeEntries.invoicedDocumentId,
        rejectionReason: timeEntries.rejectionReason,
        timer: timeEntries.timerStartedAt,
      })
      .from(timeEntries)
      .where(and(eq(timeEntries.companyId, cid), eq(timeEntries.projectId, id)))
      .orderBy(desc(timeEntries.date)),
    db
      .select({
        id: documents.id,
        fullNumber: documents.fullNumber,
        status: documents.status,
        issueDate: documents.issueDate,
        total: documents.total,
        currency: documents.currency,
        kind: documents.kind,
      })
      .from(documents)
      .where(and(eq(documents.companyId, cid), eq(documents.projectId, id)))
      .orderBy(desc(documents.issueDate)),
    getProjectStats(cid, { projectIds: [id], rates }),
    getProjectStats(cid, { projectIds: [id], from: monthStartOf(today), to: today, rates }),
    loadMembersLite(cid),
    money ? loadClientOptions(cid) : Promise.resolve([]),
  ]);

  const stats = statsMap.get(id);
  const monthStats = monthStatsMap.get(id);
  const members = new Map(team.map((m) => [m.id, m]));
  const memberName = (mid: string) => members.get(mid)?.name ?? "—";
  const taskTitle = new Map(taskRows.map((t) => [t.id, t.title]));
  const docNumber = new Map(docs.map((d) => [d.id, d.fullNumber]));
  const docStatus = new Map(docs.map((d) => [d.id, d.status]));

  /* ---------- ore pe task ---------- */
  const taskHours = new Map<string, number>();
  for (const e of entryRows) if (e.taskId) taskHours.set(e.taskId, (taskHours.get(e.taskId) ?? 0) + e.hours);

  /* ---------- grafic: ore săptămânale pe membru (ultimele 12 săptămâni) ---------- */
  const firstWeek = addDaysIso(weekStartOf(today), -7 * 11);
  const weekly: Record<string, number | string>[] = [];
  const seriesIds = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const ws = addDaysIso(firstWeek, i * 7);
    weekly.push({ week: ws, label: formatDay(ws, "d MMM") });
  }
  for (const e of entryRows) {
    if (e.date < firstWeek) continue;
    const idx = Math.floor(daysBetween(firstWeek, e.date) / 7);
    if (idx < 0 || idx > 11) continue;
    weekly[idx][e.memberId] = round2(((weekly[idx][e.memberId] as number) ?? 0) + e.hours);
    seriesIds.add(e.memberId);
  }
  const series = [...seriesIds].map((mid) => ({ id: mid, name: memberName(mid), color: members.get(mid)?.color ?? "#6d5dfc" }));

  /* ---------- grafic: consum buget cumulat ---------- */
  const budget = budgetInfo(project, stats?.hours ?? 0, stats?.revenue ?? 0);
  const firstEntry = entryRows.at(-1)?.date;
  const burnStartRaw = [project.startDate, firstEntry].filter(Boolean).sort()[0] ?? today;
  let burnStart = weekStartOf(burnStartRaw);
  const maxWeeks = 60;
  const totalWeeks = Math.floor(daysBetween(burnStart, weekStartOf(today)) / 7) + 1;
  if (totalWeeks > maxWeeks) burnStart = addDaysIso(weekStartOf(today), -7 * (maxWeeks - 1));
  const burnWeeks = Math.min(totalWeeks, maxWeeks);
  const perWeek = new Array(burnWeeks).fill(0);
  let before = 0;
  const useMoney = budget.unit === "money";
  for (const e of entryRows) {
    const value = useMoney ? (e.billable ? e.hours * rates.rate(id, e.memberId) : 0) : e.hours;
    if (e.date < burnStart) {
      before += value;
      continue;
    }
    const idx = Math.floor(daysBetween(burnStart, e.date) / 7);
    if (idx >= 0 && idx < burnWeeks) perWeek[idx] += value;
  }
  const planStart = project.startDate ?? burnStart;
  const planEnd = project.endDate;
  const planDays = planEnd ? Math.max(1, daysBetween(planStart, planEnd)) : null;
  let acc = before;
  const burn = perWeek.map((v, i) => {
    acc += v;
    const ws = addDaysIso(burnStart, i * 7);
    const weekEnd = addDaysIso(ws, 6);
    const ideal =
      budget.total && planDays ? round2(Math.min(1, Math.max(0, daysBetween(planStart, weekEnd > today ? today : weekEnd) / planDays)) * budget.total) : null;
    return { label: formatDay(ws, "d MMM"), actual: round2(acc), ideal };
  });

  const data: ProjectDetailData = {
    project: {
      id: project.id,
      name: project.name,
      code: project.code,
      color: project.color,
      status: project.status,
      billingType: project.billingType,
      currency: project.currency,
      description: project.description,
      startDate: project.startDate,
      endDate: project.endDate,
      hourlyRate: money ? project.hourlyRate : null,
      budgetHours: project.budgetHours,
      budgetAmount: money ? project.budgetAmount : null,
      monthlyRetainer: money ? project.monthlyRetainer : null,
      clientId: project.clientId,
      managerId: project.managerId,
    },
    client: client ? { id: client.id, name: client.name, country: client.country } : null,
    manager: manager ? { id: manager.id, name: manager.name, color: manager.color, position: manager.position } : null,
    stats: {
      hours: stats?.hours ?? 0,
      billableHours: stats?.billableHours ?? 0,
      monthHours: monthStats?.hours ?? 0,
      revenue: money ? (stats?.revenue ?? 0) : 0,
      costRon: money ? (stats?.costRon ?? 0) : 0,
      marginRon: money ? (stats?.marginRon ?? 0) : 0,
      marginPct: money ? (stats?.marginPct ?? 0) : 0,
      revenueRon: money ? (stats?.revenueRon ?? 0) : 0,
      uninvoicedApprovedHours: stats?.uninvoicedApprovedHours ?? 0,
      budget: money || budget.unit !== "money" ? budget : { percent: budget.percent, used: 0, total: null, unit: "money" },
    },
    weekly,
    series,
    burn: { unit: budget.unit ?? "hours", total: money || budget.unit !== "money" ? budget.total : null, points: burn },
    members: memberRows.map(({ pm, m }) => ({
      memberId: m.id,
      name: m.name,
      color: m.color,
      position: m.position,
      active: m.active,
      role: pm.role,
      rateOverride: money ? pm.hourlyRate : null,
      memberRate: money ? m.hourlyRate : null,
      memberRateCurrency: m.rateCurrency,
      effectiveRate: money ? rates.rate(id, m.id) : 0,
      hours: round2(stats?.byMember[m.id] ?? 0),
    })),
    tasks: taskRows.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      assigneeId: t.assigneeId,
      estimateHours: t.estimateHours,
      dueDate: t.dueDate,
      position: t.position,
      loggedHours: round2(taskHours.get(t.id) ?? 0),
    })),
    entries: entryRows.map((e) => ({
      id: e.id,
      date: e.date,
      hours: e.hours,
      description: e.description,
      billable: e.billable,
      status: e.status,
      memberId: e.memberId,
      memberName: memberName(e.memberId),
      memberColor: members.get(e.memberId)?.color ?? "#6d5dfc",
      memberPosition: members.get(e.memberId)?.position ?? null,
      taskId: e.taskId,
      taskTitle: e.taskId ? (taskTitle.get(e.taskId) ?? null) : null,
      invoicedDocumentId: e.invoicedDocumentId && docNumber.has(e.invoicedDocumentId) && docStatus.get(e.invoicedDocumentId) !== "cancelled" ? e.invoicedDocumentId : null,
      invoiceNumber: e.invoicedDocumentId && docStatus.get(e.invoicedDocumentId) !== "cancelled" ? (docNumber.get(e.invoicedDocumentId) ?? null) : null,
      rejectionReason: e.rejectionReason,
      running: !!e.timer,
      rate: canBill ? rates.rate(id, e.memberId) : 0,
    })),
    documents: canBill ? docs : [],
    team,
    clients,
  };

  return (
    <ProjectDetail
      data={data}
      canManage={can(ctx, "projects.manage")}
      canBill={canBill}
      showMoney={money}
      meId={ctx.teamMemberId}
      today={today}
    />
  );
}
