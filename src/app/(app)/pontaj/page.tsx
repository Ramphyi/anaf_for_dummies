import { and, count, desc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import Link from "next/link";
import { CheckCheck, Timer, UserX } from "lucide-react";
import { can, requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projectMembers, projects, tasks, teamMembers, timeEntries, timeOff } from "@/lib/db/schema";
import { TIME_OFF_TYPE } from "@/lib/constants";
import { todayIso } from "@/lib/format";
import { addDaysIso, holidayName, isWeekendIso, parseWeekParam, weekDays } from "@/lib/outsourcing/dates";
import { loadMembersLite } from "@/lib/outsourcing/server";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { Timesheet, type TimesheetData } from "@/components/outsourcing/timesheet";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Pontaj" };

export default async function TimesheetPage({ searchParams }: { searchParams: Promise<{ week?: string; membru?: string }> }) {
  const ctx = await requirePermission("timesheet.own");
  const sp = await searchParams;
  const cid = ctx.company.id;
  const canApprove = can(ctx, "timesheet.approve");
  const weekStart = parseWeekParam(sp.week);
  const weekEnd = addDaysIso(weekStart, 6);
  const today = todayIso();

  const requested = canApprove && sp.membru ? sp.membru : ctx.teamMemberId;
  const member = requested
    ? await db.query.teamMembers.findFirst({ where: and(eq(teamMembers.id, requested), eq(teamMembers.companyId, cid)) })
    : null;
  const allMembers = canApprove ? await loadMembersLite(cid) : [];
  const [pendingApprovals] = canApprove
    ? await db.select({ n: count() }).from(timeEntries).where(and(eq(timeEntries.companyId, cid), eq(timeEntries.status, "submitted")))
    : [{ n: 0 }];

  const header = (
    <PageHeader
      title="Pontaj"
      description="Orele lucrate pe proiecte, săptămână cu săptămână."
      icon={<Timer />}
      actions={
        canApprove ? (
          <Button variant="outline" asChild>
            <Link href="/pontaj/aprobari">
              <CheckCheck /> Aprobări
              {pendingApprovals.n > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-[11px] leading-5 font-semibold text-primary-foreground tabular">{pendingApprovals.n}</span>
              )}
            </Link>
          </Button>
        ) : undefined
      }
    />
  );

  if (!member) {
    return (
      <>
        {header}
        <div className="rounded-xl border border-dashed border-border bg-card/50">
          <EmptyState
            icon={<UserX />}
            title="Contul tău nu este asociat unui membru al echipei"
            description={
              canApprove
                ? "Alege un coleg din pagina Echipă sau asociază-ți contul unui membru din Setări → Utilizatori."
                : "Roagă un administrator să-ți asocieze contul unui membru al echipei (Setări → Utilizatori)."
            }
          />
        </div>
      </>
    );
  }

  const isOwn = member.id === ctx.teamMemberId;
  const prevStart = addDaysIso(weekStart, -7);

  const [weekRows, memberProjects, prevRows, offRows, runningRows, recentRows] = await Promise.all([
    db
      .select()
      .from(timeEntries)
      .where(and(eq(timeEntries.companyId, cid), eq(timeEntries.memberId, member.id), gte(timeEntries.date, weekStart), lte(timeEntries.date, weekEnd))),
    db
      .select({ p: projects, role: projectMembers.role })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(and(eq(projectMembers.memberId, member.id), eq(projects.companyId, cid))),
    db
      .selectDistinct({ projectId: timeEntries.projectId, taskId: timeEntries.taskId })
      .from(timeEntries)
      .where(and(eq(timeEntries.companyId, cid), eq(timeEntries.memberId, member.id), gte(timeEntries.date, prevStart), lte(timeEntries.date, addDaysIso(prevStart, 6)))),
    db
      .select()
      .from(timeOff)
      .where(and(eq(timeOff.companyId, cid), eq(timeOff.memberId, member.id), inArray(timeOff.status, ["approved", "pending"]), lte(timeOff.startDate, weekEnd), gte(timeOff.endDate, weekStart))),
    isOwn
      ? db
          .select()
          .from(timeEntries)
          .where(and(eq(timeEntries.companyId, cid), eq(timeEntries.memberId, member.id), isNotNull(timeEntries.timerStartedAt)))
          .limit(1)
      : Promise.resolve([]),
    db
      .select()
      .from(timeEntries)
      .where(and(eq(timeEntries.companyId, cid), eq(timeEntries.memberId, member.id)))
      .orderBy(desc(timeEntries.date), desc(timeEntries.updatedAt))
      .limit(12),
  ]);

  // proiecte: cele în care e membru (active) + cele care apar deja în pontaj
  const referenced = new Set([...weekRows, ...recentRows, ...runningRows].map((e) => e.projectId));
  const extraIds = [...referenced].filter((id) => !memberProjects.some((m) => m.p.id === id));
  const extra = extraIds.length ? await db.select().from(projects).where(and(eq(projects.companyId, cid), inArray(projects.id, extraIds))) : [];
  const allProjects = [...memberProjects.map((m) => ({ ...m.p, assigned: true })), ...extra.map((p) => ({ ...p, assigned: false }))];
  const projectIds = allProjects.map((p) => p.id);
  const taskRows = projectIds.length
    ? await db
        .select({ id: tasks.id, projectId: tasks.projectId, title: tasks.title, status: tasks.status })
        .from(tasks)
        .where(inArray(tasks.projectId, projectIds))
        .orderBy(tasks.position)
    : [];
  const clientNames = new Map<string, string>();
  {
    const withClient = allProjects.filter((p) => p.clientId).map((p) => p.clientId!);
    if (withClient.length) {
      const rows = await db.query.partners.findMany({ where: (t, { inArray: inArr }) => inArr(t.id, withClient), columns: { id: true, name: true } });
      for (const r of rows) clientNames.set(r.id, r.name);
    }
  }

  const days = weekDays(weekStart).map((date) => {
    const off = offRows.find((o) => o.startDate <= date && o.endDate >= date);
    return {
      date,
      weekend: isWeekendIso(date),
      holiday: holidayName(date) ?? null,
      off: off ? { type: off.type, label: TIME_OFF_TYPE[off.type]?.label ?? off.type, status: off.status } : null,
    };
  });

  const projectName = new Map(allProjects.map((p) => [p.id, p]));
  const taskTitle = new Map(taskRows.map((t) => [t.id, t.title]));
  const running = runningRows[0];

  const data: TimesheetData = {
    member: { id: member.id, name: member.name, color: member.color, position: member.position, weeklyCapacity: member.weeklyCapacity },
    isOwn,
    canApprove,
    members: allMembers.filter((m) => m.active || m.id === member.id),
    weekStart,
    today,
    days,
    entries: weekRows.map((e) => ({
      id: e.id,
      projectId: e.projectId,
      taskId: e.taskId,
      date: e.date,
      hours: e.hours,
      status: e.status,
      description: e.description,
      billable: e.billable,
      rejectionReason: e.rejectionReason,
      running: !!e.timerStartedAt,
      invoiced: !!e.invoicedDocumentId,
    })),
    projects: allProjects
      .sort((a, b) => a.name.localeCompare(b.name, "ro"))
      .map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        color: p.color,
        status: p.status,
        billingType: p.billingType,
        currency: p.currency,
        clientName: p.clientId ? (clientNames.get(p.clientId) ?? null) : null,
        assignable: p.assigned && ["active", "planning", "on_hold"].includes(p.status),
        tasks: taskRows.filter((t) => t.projectId === p.id).map((t) => ({ id: t.id, projectId: t.projectId, title: t.title, status: t.status })),
      })),
    prevRows: prevRows.filter((r) => projectName.has(r.projectId)).map((r) => ({ projectId: r.projectId, taskId: r.taskId })),
    timer: running
      ? {
          entryId: running.id,
          projectId: running.projectId,
          taskId: running.taskId,
          description: running.description,
          startedAt: running.timerStartedAt!.getTime(),
          baseHours: running.hours,
          date: running.date,
        }
      : null,
    recent: recentRows.map((e) => ({
      id: e.id,
      date: e.date,
      hours: e.hours,
      status: e.status,
      description: e.description,
      projectName: projectName.get(e.projectId)?.name ?? "Proiect",
      projectColor: projectName.get(e.projectId)?.color ?? "#6d5dfc",
      taskTitle: e.taskId ? (taskTitle.get(e.taskId) ?? null) : null,
      rejectionReason: e.rejectionReason,
      running: !!e.timerStartedAt,
    })),
  };

  return (
    <>
      {header}
      <Timesheet data={data} />
    </>
  );
}
