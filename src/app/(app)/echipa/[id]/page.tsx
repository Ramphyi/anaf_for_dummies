import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { can, requireContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { allocations, projectMembers, projects, teamMembers, timeEntries, timeOff } from "@/lib/db/schema";
import { todayIso } from "@/lib/format";
import { addDaysIso, daysBetween, formatDay, monthStartOf, weekStartOf, workingDaysCount } from "@/lib/outsourcing/dates";
import { convertAmount } from "@/lib/outsourcing/metrics";
import { canSeeMoney, getMemberUtilization, loadRateBook } from "@/lib/outsourcing/server";
import { round2 } from "@/lib/utils";
import { MemberProfile, type MemberProfileData } from "@/components/outsourcing/member-profile";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext();
  const m = await db.query.teamMembers.findFirst({ where: and(eq(teamMembers.id, id), eq(teamMembers.companyId, ctx.company.id)), columns: { name: true } });
  return { title: m?.name ?? "Membru" };
}

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext();
  const cid = ctx.company.id;
  const member = await db.query.teamMembers.findFirst({ where: and(eq(teamMembers.id, id), eq(teamMembers.companyId, cid)) });
  if (!member) notFound();

  const today = todayIso();
  const money = canSeeMoney(ctx);
  const monthStart = monthStartOf(today);
  const firstWeek = addDaysIso(weekStartOf(today), -7 * 11);

  const [rates, util4w, utilMonth, entries, memberships, allocRows, offRows] = await Promise.all([
    loadRateBook(cid),
    getMemberUtilization(cid, addDaysIso(today, -27), today),
    getMemberUtilization(cid, monthStart, today),
    db
      .select({ projectId: timeEntries.projectId, date: timeEntries.date, hours: timeEntries.hours, billable: timeEntries.billable, status: timeEntries.status })
      .from(timeEntries)
      .where(and(eq(timeEntries.companyId, cid), eq(timeEntries.memberId, id))),
    db
      .select({ p: projects, role: projectMembers.role, rateOverride: projectMembers.hourlyRate })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(and(eq(projectMembers.memberId, id), eq(projects.companyId, cid))),
    db
      .select({ a: allocations, name: projects.name, color: projects.color, code: projects.code })
      .from(allocations)
      .innerJoin(projects, eq(projects.id, allocations.projectId))
      .where(and(eq(allocations.companyId, cid), eq(allocations.memberId, id), gte(allocations.endDate, today)))
      .orderBy(allocations.startDate),
    db
      .select()
      .from(timeOff)
      .where(and(eq(timeOff.companyId, cid), eq(timeOff.memberId, id), gte(timeOff.endDate, addDaysIso(today, -60)), inArray(timeOff.status, ["approved", "pending", "rejected"])))
      .orderBy(desc(timeOff.startDate)),
  ]);

  const projectInfo = new Map<string, { name: string; color: string; code: string | null; currency: string; billingType: string }>();
  for (const m of memberships) projectInfo.set(m.p.id, { name: m.p.name, color: m.p.color, code: m.p.code, currency: m.p.currency, billingType: m.p.billingType });
  const missing = [...new Set(entries.map((e) => e.projectId))].filter((pid) => !projectInfo.has(pid));
  if (missing.length) {
    const extra = await db.select().from(projects).where(and(eq(projects.companyId, cid), inArray(projects.id, missing)));
    for (const p of extra) projectInfo.set(p.id, { name: p.name, color: p.color, code: p.code, currency: p.currency, billingType: p.billingType });
  }

  /* venit generat luna aceasta (EUR) */
  let revenueEur = 0;
  const hoursByProject = new Map<string, number>();
  for (const e of entries) {
    hoursByProject.set(e.projectId, (hoursByProject.get(e.projectId) ?? 0) + e.hours);
    if (e.date < monthStart || e.date > today || !e.billable) continue;
    const p = projectInfo.get(e.projectId);
    if (!p || p.billingType === "non_billable" || p.billingType === "retainer") continue;
    revenueEur += convertAmount(e.hours * rates.rate(e.projectId, id), p.currency, "EUR", rates.fx);
  }

  /* ore pe săptămână (12 săpt.), pe proiect */
  const weekly: Record<string, number | string>[] = Array.from({ length: 12 }, (_, i) => {
    const ws = addDaysIso(firstWeek, i * 7);
    return { week: ws, label: formatDay(ws, "d MMM") };
  });
  const seriesIds = new Set<string>();
  for (const e of entries) {
    if (e.date < firstWeek || e.date > addDaysIso(firstWeek, 83)) continue;
    const idx = Math.floor(daysBetween(firstWeek, e.date) / 7);
    weekly[idx][e.projectId] = round2(((weekly[idx][e.projectId] as number) ?? 0) + e.hours);
    seriesIds.add(e.projectId);
  }

  const data: MemberProfileData = {
    member: {
      id: member.id,
      name: member.name,
      email: member.email,
      phone: member.phone,
      position: member.position,
      department: member.department,
      seniority: member.seniority,
      employmentType: member.employmentType,
      hourlyRate: money ? member.hourlyRate : 0,
      hourlyCost: money ? member.hourlyCost : 0,
      rateCurrency: member.rateCurrency,
      weeklyCapacity: member.weeklyCapacity,
      color: member.color,
      skills: member.skills ?? [],
      startDate: member.startDate,
      active: member.active,
    },
    hasUser: !!member.userId,
    stats: {
      monthHours: utilMonth.get(id)?.hours ?? 0,
      monthBillablePct: utilMonth.get(id)?.billablePct ?? 0,
      utilization: util4w.get(id)?.utilization ?? 0,
      hours4w: util4w.get(id)?.hours ?? 0,
      capacity4w: util4w.get(id)?.capacity ?? 0,
      revenueEur: money ? round2(revenueEur) : 0,
      totalHours: round2(entries.reduce((a, e) => a + e.hours, 0)),
    },
    weekly,
    series: [...seriesIds].map((pid) => ({ id: pid, name: projectInfo.get(pid)?.code ?? projectInfo.get(pid)?.name ?? "Proiect", color: projectInfo.get(pid)?.color ?? "#888" })),
    projects: memberships
      .map((m) => ({
        id: m.p.id,
        name: m.p.name,
        code: m.p.code,
        color: m.p.color,
        status: m.p.status,
        role: m.role,
        hours: round2(hoursByProject.get(m.p.id) ?? 0),
        rate: money ? rates.rate(m.p.id, id) : 0,
        currency: m.p.currency,
      }))
      .sort((a, b) => b.hours - a.hours),
    allocations: allocRows.map(({ a, name, color, code }) => ({
      id: a.id,
      projectName: name,
      projectColor: color,
      projectCode: code,
      startDate: a.startDate,
      endDate: a.endDate,
      hoursPerDay: a.hoursPerDay,
      notes: a.notes,
      current: a.startDate <= today,
    })),
    timeOff: offRows.map((t) => ({
      id: t.id,
      type: t.type,
      startDate: t.startDate,
      endDate: t.endDate,
      status: t.status,
      days: workingDaysCount(t.startDate, t.endDate),
      upcoming: t.endDate >= today,
    })),
  };

  return <MemberProfile data={data} canManage={can(ctx, "projects.manage")} showMoney={money} isMe={ctx.teamMemberId === id} canSeeTimesheet={can(ctx, "timesheet.approve") || ctx.teamMemberId === id} />;
}
