import "server-only";
import { format, startOfWeek, subMonths } from "date-fns";
import { and, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activityLog,
  allocations,
  documents,
  payments,
  projects,
  purchaseInvoices,
  tasks,
  teamMembers,
  timeEntries,
  timeOff,
} from "@/lib/db/schema";
import { todayIso } from "@/lib/format";
import { round2 } from "@/lib/utils";

const ISSUED = ["issued", "partially_paid", "paid", "storned"] as const;

export function monthKeys(n = 12) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => format(subMonths(now, n - 1 - i), "yyyy-MM"));
}

/** Indicatori financiari pentru dashboard (sume în RON). */
export async function getFinanceOverview(companyId: string) {
  const months = monthKeys(12);
  const from = `${months[0]}-01`;
  const today = todayIso();
  const thisMonth = months[11];
  const prevMonth = months[10];

  const [revenueRows, expenseRows, collectedRows, receivable, efactura, upcoming, topClients] = await Promise.all([
    db
      .select({ m: sql<string>`substr(${documents.issueDate}, 1, 7)`, v: sql<number>`sum(${documents.total} * ${documents.exchangeRate})`, n: sql<number>`count(*)` })
      .from(documents)
      .where(and(eq(documents.companyId, companyId), eq(documents.kind, "invoice"), inArray(documents.status, [...ISSUED]), gte(documents.issueDate, from)))
      .groupBy(sql`1`),
    db
      .select({ m: sql<string>`substr(${purchaseInvoices.issueDate}, 1, 7)`, v: sql<number>`sum(${purchaseInvoices.total} * ${purchaseInvoices.exchangeRate})` })
      .from(purchaseInvoices)
      .where(and(eq(purchaseInvoices.companyId, companyId), ne(purchaseInvoices.status, "cancelled"), gte(purchaseInvoices.issueDate, from)))
      .groupBy(sql`1`),
    db
      .select({
        m: sql<string>`substr(${payments.date}, 1, 7)`,
        v: sql<number>`sum(${payments.amount} * coalesce(${documents.exchangeRate}, 1))`,
      })
      .from(payments)
      .leftJoin(documents, eq(documents.id, payments.documentId))
      .where(and(eq(payments.companyId, companyId), eq(payments.direction, "in"), gte(payments.date, from)))
      .groupBy(sql`1`),
    db
      .select({
        total: sql<number>`coalesce(sum((${documents.total} - ${documents.paidAmount}) * ${documents.exchangeRate}), 0)`,
        overdue: sql<number>`coalesce(sum(case when ${documents.dueDate} < ${today} then (${documents.total} - ${documents.paidAmount}) * ${documents.exchangeRate} else 0 end), 0)`,
        overdueCount: sql<number>`sum(case when ${documents.dueDate} < ${today} then 1 else 0 end)`,
        count: sql<number>`count(*)`,
      })
      .from(documents)
      .where(and(eq(documents.companyId, companyId), eq(documents.kind, "invoice"), inArray(documents.status, ["issued", "partially_paid"]))),
    db
      .select({ s: documents.efacturaStatus, n: sql<number>`count(*)` })
      .from(documents)
      .where(and(eq(documents.companyId, companyId), eq(documents.kind, "invoice"), ne(documents.status, "draft"), ne(documents.status, "cancelled")))
      .groupBy(documents.efacturaStatus),
    db.query.documents.findMany({
      where: and(eq(documents.companyId, companyId), eq(documents.kind, "invoice"), inArray(documents.status, ["issued", "partially_paid"])),
      orderBy: (d, { asc }) => [asc(d.dueDate)],
      limit: 6,
      columns: { id: true, fullNumber: true, clientName: true, dueDate: true, total: true, paidAmount: true, currency: true },
    }),
    db
      .select({
        id: documents.partnerId,
        name: documents.clientName,
        v: sql<number>`sum(${documents.total} * ${documents.exchangeRate})`,
      })
      .from(documents)
      .where(and(eq(documents.companyId, companyId), eq(documents.kind, "invoice"), inArray(documents.status, [...ISSUED]), gte(documents.issueDate, from)))
      .groupBy(documents.partnerId, documents.clientName)
      .orderBy(desc(sql`3`))
      .limit(5),
  ]);

  const byMonth = (rows: { m: string; v: number }[]) => new Map(rows.map((r) => [r.m, round2(r.v ?? 0)]));
  const rev = byMonth(revenueRows);
  const exp = byMonth(expenseRows);
  const col = byMonth(collectedRows);
  const series = months.map((m) => ({ month: m, revenue: rev.get(m) ?? 0, expenses: exp.get(m) ?? 0, collected: col.get(m) ?? 0 }));
  const pct = (a: number, b: number) => (b ? ((a - b) / Math.abs(b)) * 100 : null);
  const invoiceCountThisMonth = revenueRows.find((r) => r.m === thisMonth)?.n ?? 0;
  const ytd = series.filter((s) => s.month.startsWith(thisMonth.slice(0, 4)));

  return {
    series,
    revenue: { value: rev.get(thisMonth) ?? 0, delta: pct(rev.get(thisMonth) ?? 0, rev.get(prevMonth) ?? 0) },
    expenses: { value: exp.get(thisMonth) ?? 0, delta: pct(exp.get(thisMonth) ?? 0, exp.get(prevMonth) ?? 0) },
    collected: { value: col.get(thisMonth) ?? 0, delta: pct(col.get(thisMonth) ?? 0, col.get(prevMonth) ?? 0) },
    profitYtd: round2(ytd.reduce((a, s) => a + s.revenue - s.expenses, 0)),
    revenueYtd: round2(ytd.reduce((a, s) => a + s.revenue, 0)),
    invoiceCountThisMonth,
    receivable: {
      total: round2(receivable[0]?.total ?? 0),
      overdue: round2(receivable[0]?.overdue ?? 0),
      overdueCount: receivable[0]?.overdueCount ?? 0,
      count: receivable[0]?.count ?? 0,
    },
    efactura: Object.fromEntries(efactura.map((e) => [e.s, e.n])) as Record<string, number>,
    upcoming,
    topClients: topClients.map((c) => ({ id: c.id, name: c.name, value: round2(c.v) })),
  };
}

/** Indicatori de echipă: ore pontate săptămâna curentă, proiecte active, concedii. */
export async function getTeamOverview(companyId: string) {
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const today = todayIso();
  const monthStart = format(new Date(), "yyyy-MM-01");

  const [members, weekHours, activeProjects, projectHours, offToday, allocToday] = await Promise.all([
    db.query.teamMembers.findMany({ where: and(eq(teamMembers.companyId, companyId), eq(teamMembers.active, true)) }),
    db
      .select({ memberId: timeEntries.memberId, h: sql<number>`sum(${timeEntries.hours})`, b: sql<number>`sum(case when ${timeEntries.billable} then ${timeEntries.hours} else 0 end)` })
      .from(timeEntries)
      .where(and(eq(timeEntries.companyId, companyId), gte(timeEntries.date, weekStart)))
      .groupBy(timeEntries.memberId),
    db.query.projects.findMany({
      where: and(eq(projects.companyId, companyId), eq(projects.status, "active"), ne(projects.billingType, "non_billable")),
      with: { client: { columns: { name: true } } },
    }),
    db
      .select({ projectId: timeEntries.projectId, h: sql<number>`sum(${timeEntries.hours})`, month: sql<number>`sum(case when ${timeEntries.date} >= ${monthStart} then ${timeEntries.hours} else 0 end)` })
      .from(timeEntries)
      .where(eq(timeEntries.companyId, companyId))
      .groupBy(timeEntries.projectId),
    db.query.timeOff.findMany({
      where: and(eq(timeOff.companyId, companyId), eq(timeOff.status, "approved"), lte(timeOff.startDate, today), gte(timeOff.endDate, today)),
      with: { member: { columns: { name: true, color: true } } },
    }),
    db.query.allocations.findMany({
      where: and(eq(allocations.companyId, companyId), lte(allocations.startDate, today), gte(allocations.endDate, today)),
      columns: { memberId: true, hoursPerDay: true },
    }),
  ]);

  const hoursBy = new Map(weekHours.map((w) => [w.memberId, w]));
  const allocBy = new Map<string, number>();
  for (const a of allocToday) allocBy.set(a.memberId, (allocBy.get(a.memberId) ?? 0) + a.hoursPerDay);
  const ph = new Map(projectHours.map((p) => [p.projectId, p]));
  const dayOfWeek = Math.min(5, ((new Date().getDay() + 6) % 7) + 1);

  const team = members
    .filter((m) => m.department !== "Management" || hoursBy.has(m.id))
    .map((m) => {
      const w = hoursBy.get(m.id);
      return {
        id: m.id,
        name: m.name,
        color: m.color,
        position: m.position,
        hours: round2(w?.h ?? 0),
        billable: round2(w?.b ?? 0),
        expected: round2((m.weeklyCapacity / 5) * dayOfWeek),
        capacity: m.weeklyCapacity,
        allocatedToday: allocBy.get(m.id) ?? 0,
      };
    })
    .sort((a, b) => b.hours - a.hours);

  const totalHours = team.reduce((a, t) => a + t.hours, 0);
  const totalBillable = team.reduce((a, t) => a + t.billable, 0);
  const totalExpected = team.reduce((a, t) => a + t.expected, 0);

  return {
    team,
    totals: {
      hours: round2(totalHours),
      billablePct: totalHours ? (totalBillable / totalHours) * 100 : 0,
      utilization: totalExpected ? (totalHours / totalExpected) * 100 : 0,
    },
    projects: activeProjects
      .map((p) => {
        const used = ph.get(p.id)?.h ?? 0;
        return {
          id: p.id,
          name: p.name,
          code: p.code,
          color: p.color,
          client: p.client?.name ?? null,
          used: round2(used),
          month: round2(ph.get(p.id)?.month ?? 0),
          budget: p.budgetHours,
          pct: p.budgetHours ? (used / p.budgetHours) * 100 : null,
        };
      })
      .sort((a, b) => b.month - a.month),
    offToday: offToday.map((o) => ({ name: o.member?.name ?? "", color: o.member?.color ?? "#999", type: o.type, until: o.endDate })),
  };
}

export async function getRecentActivity(companyId: string, limit = 8) {
  return db.query.activityLog.findMany({
    where: eq(activityLog.companyId, companyId),
    orderBy: (a, { desc }) => [desc(a.createdAt)],
    limit,
  });
}

/** Pentru angajați: ce am de lucru și cât am pontat. */
export async function getPersonalOverview(companyId: string, memberId: string | null) {
  if (!memberId) return null;
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const [member, myTasks, week, running] = await Promise.all([
    db.query.teamMembers.findFirst({ where: eq(teamMembers.id, memberId) }),
    db.query.tasks.findMany({
      where: and(eq(tasks.companyId, companyId), eq(tasks.assigneeId, memberId), ne(tasks.status, "done")),
      with: { project: { columns: { name: true, color: true, id: true } } },
      orderBy: (t, { asc }) => [asc(t.dueDate)],
      limit: 8,
    }),
    db
      .select({ h: sql<number>`coalesce(sum(${timeEntries.hours}), 0)` })
      .from(timeEntries)
      .where(and(eq(timeEntries.companyId, companyId), eq(timeEntries.memberId, memberId), gte(timeEntries.date, weekStart))),
    db.query.timeEntries.findFirst({
      where: and(eq(timeEntries.companyId, companyId), eq(timeEntries.memberId, memberId), sql`${timeEntries.timerStartedAt} is not null`),
      with: { project: { columns: { name: true, color: true } } },
    }),
  ]);
  return {
    member,
    tasks: myTasks,
    weekHours: round2(week[0]?.h ?? 0),
    running: running ? { project: running.project?.name ?? "", color: running.project?.color ?? "#999", since: running.timerStartedAt?.getTime() ?? Date.now(), description: running.description } : null,
  };
}
