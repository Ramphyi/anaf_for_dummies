import "server-only";
import { eachDayOfInterval, format, isWeekend, parseISO } from "date-fns";
import { and, eq, gte, inArray, lte, ne, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, teamMembers, timeEntries, timeOff } from "@/lib/db/schema";
import { RO_PUBLIC_HOLIDAYS } from "@/lib/constants";
import { todayIso } from "@/lib/format";
import { round2, sum } from "@/lib/utils";

export type TimesheetFilters = { projectId?: string | null; memberId?: string | null; approvedOnly?: boolean };

export type TimesheetEntryRow = {
  id: string;
  date: string;
  memberId: string;
  projectId: string;
  hours: number;
  billable: boolean;
  status: string;
  description: string | null;
};

export type TimesheetReport = Awaited<ReturnType<typeof getTimesheetReport>>;

/** Zile lucrătoare (L–V, fără sărbători legale) într-un interval. */
function workingDays(from: string, to: string): string[] {
  if (from > to) return [];
  return eachDayOfInterval({ start: parseISO(from), end: parseISO(to) })
    .filter((d) => !isWeekend(d))
    .map((d) => format(d, "yyyy-MM-dd"))
    .filter((d) => !RO_PUBLIC_HOLIDAYS[d]);
}

export async function getTimesheetReport(companyId: string, period: { from: string; to: string }, filters: TimesheetFilters) {
  const conds: SQL[] = [
    eq(timeEntries.companyId, companyId),
    gte(timeEntries.date, period.from),
    lte(timeEntries.date, period.to),
    filters.approvedOnly ? eq(timeEntries.status, "approved") : ne(timeEntries.status, "rejected"),
  ];
  if (filters.projectId) conds.push(eq(timeEntries.projectId, filters.projectId));
  if (filters.memberId) conds.push(eq(timeEntries.memberId, filters.memberId));

  const [entries, allMembers, allProjects] = await Promise.all([
    db.query.timeEntries.findMany({
      where: and(...conds),
      columns: { id: true, date: true, memberId: true, projectId: true, hours: true, billable: true, status: true, description: true },
      orderBy: (t, { asc }) => [asc(t.date)],
    }),
    db.query.teamMembers.findMany({ where: eq(teamMembers.companyId, companyId) }),
    db.query.projects.findMany({ where: eq(projects.companyId, companyId), columns: { id: true, name: true, code: true, color: true, billingType: true, status: true } }),
  ]);

  // Capacitatea se calculează doar până azi (zilele viitoare nu „scad” utilizarea).
  const today = todayIso();
  const capTo = period.to < today ? period.to : today;
  const days = workingDays(period.from, capTo);
  const daySet = new Set(days);

  const memberIds = new Set(entries.map((e) => e.memberId));
  const members = allMembers
    .filter((m) => (filters.memberId ? m.id === filters.memberId : memberIds.has(m.id) || (m.active && !filters.projectId)))
    .sort((a, b) => a.name.localeCompare(b.name, "ro"));

  const leaves = members.length
    ? await db.query.timeOff.findMany({
        where: and(
          eq(timeOff.companyId, companyId),
          eq(timeOff.status, "approved"),
          inArray(
            timeOff.memberId,
            members.map((m) => m.id),
          ),
          lte(timeOff.startDate, capTo),
          gte(timeOff.endDate, period.from),
        ),
      })
    : [];

  const projectIds = new Set(entries.map((e) => e.projectId));
  const projectsOut = allProjects
    .filter((p) => projectIds.has(p.id))
    .map((p) => ({ ...p, hours: round2(sum(entries.filter((e) => e.projectId === p.id), (e) => e.hours)) }))
    .sort((a, b) => b.hours - a.hours);

  const cells: Record<string, Record<string, { hours: number; billable: number }>> = {};
  for (const e of entries) {
    const row = (cells[e.memberId] ??= {});
    const c = (row[e.projectId] ??= { hours: 0, billable: 0 });
    c.hours = round2(c.hours + e.hours);
    if (e.billable) c.billable = round2(c.billable + e.hours);
  }

  const membersOut = members.map((m) => {
    const mine = entries.filter((e) => e.memberId === m.id);
    const hours = round2(sum(mine, (e) => e.hours));
    const billable = round2(sum(mine.filter((e) => e.billable), (e) => e.hours));
    const leaveDays = new Set<string>();
    for (const l of leaves.filter((x) => x.memberId === m.id)) {
      for (const d of workingDays(l.startDate > period.from ? l.startDate : period.from, l.endDate < capTo ? l.endDate : capTo)) if (daySet.has(d)) leaveDays.add(d);
    }
    const daily = m.weeklyCapacity / 5;
    const capacity = round2(daily * Math.max(0, days.length - leaveDays.size));
    return {
      id: m.id,
      name: m.name,
      color: m.color,
      position: m.position,
      department: m.department,
      active: m.active,
      hours,
      billable,
      billablePct: hours ? (billable / hours) * 100 : 0,
      capacity,
      leaveDays: leaveDays.size,
      utilization: capacity ? (hours / capacity) * 100 : 0,
      billableUtilization: capacity ? (billable / capacity) * 100 : 0,
    };
  });

  const totalHours = round2(sum(entries, (e) => e.hours));
  const billableHours = round2(sum(entries.filter((e) => e.billable), (e) => e.hours));
  const capacity = round2(sum(membersOut, (m) => m.capacity));
  const maxCell = Math.max(0, ...Object.values(cells).flatMap((r) => Object.values(r).map((c) => c.hours)));

  return {
    members: membersOut,
    projects: projectsOut,
    cells,
    maxCell,
    entries: entries.map<TimesheetEntryRow>((e) => ({ ...e, hours: round2(e.hours) })),
    options: {
      members: allMembers.filter((m) => m.active || memberIds.has(m.id)).map((m) => ({ value: m.id, label: m.name })),
      projects: allProjects.map((p) => ({ value: p.id, label: p.name })),
    },
    kpis: {
      totalHours,
      billableHours,
      billablePct: totalHours ? (billableHours / totalHours) * 100 : 0,
      capacity,
      utilization: capacity ? (totalHours / capacity) * 100 : 0,
      workingDays: days.length,
      pendingHours: round2(sum(entries.filter((e) => e.status !== "approved"), (e) => e.hours)),
      capTo,
    },
  };
}
