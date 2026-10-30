"use server";

import { and, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext, requirePermission, type AppContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projectMembers, tasks, timeEntries, type TimeEntry } from "@/lib/db/schema";
import { todayIso } from "@/lib/format";
import { addDaysIso } from "@/lib/outsourcing/dates";
import { assertTimesheetAccess, getCompanyProject } from "@/lib/outsourcing/server";
import { zDate, runAction } from "@/lib/server/action";
import { actorFrom, logActivity } from "@/lib/server/activity";
import { round2 } from "@/lib/utils";

const LOCKED = new Set(["submitted", "approved"]);

function revalidateTimesheet() {
  revalidatePath("/pontaj");
  revalidatePath("/proiecte", "layout");
}

async function assertProjectForMember(ctx: AppContext, projectId: string, memberId: string, taskId?: string | null) {
  const project = await getCompanyProject(ctx.company.id, projectId);
  const pm = await db.query.projectMembers.findFirst({
    where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.memberId, memberId)),
  });
  if (!pm) throw new Error("Membrul nu face parte din echipa acestui proiect.");
  if (taskId) {
    const t = await db.query.tasks.findFirst({ where: and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)) });
    if (!t) throw new Error("Task-ul nu aparține proiectului.");
  }
  return project;
}

function cellWhere(companyId: string, memberId: string, projectId: string, taskId: string | null, date: string) {
  return and(
    eq(timeEntries.companyId, companyId),
    eq(timeEntries.memberId, memberId),
    eq(timeEntries.projectId, projectId),
    taskId ? eq(timeEntries.taskId, taskId) : isNull(timeEntries.taskId),
    eq(timeEntries.date, date),
  );
}

/* ------------------------------------------------------------------ */
/* Celule pontaj                                                       */
/* ------------------------------------------------------------------ */

const cellSchema = z.object({
  memberId: z.string(),
  projectId: z.string(),
  taskId: z.string().nullable().optional(),
  date: zDate,
  hours: z.number().min(0, "Orele nu pot fi negative").max(24, "Maximum 24 de ore pe zi"),
  description: z.string().trim().max(500).nullable().optional(),
  billable: z.boolean().optional(),
});

export type CellInput = z.input<typeof cellSchema>;

/**
 * Setează totalul de ore al unei celule (membru × proiect × task × zi).
 * Intrările editabile se comasează într-una singură; celulele trimise/aprobate sunt blocate.
 */
export async function saveCellAction(input: CellInput) {
  return runAction(async () => {
    const ctx = await requireContext();
    const d = cellSchema.parse(input);
    const taskId = d.taskId || null;
    await assertTimesheetAccess(ctx, d.memberId);
    const cid = ctx.company.id;
    const existing = await db.select().from(timeEntries).where(cellWhere(cid, d.memberId, d.projectId, taskId, d.date));
    if (existing.some((e) => LOCKED.has(e.status) || e.invoicedDocumentId)) {
      throw new Error("Orele din această zi au fost trimise spre aprobare sau aprobate și nu mai pot fi modificate.");
    }
    const hours = round2(d.hours);
    const running = existing.find((e) => e.timerStartedAt);
    let result: { id: string | null; hours: number };

    if (!existing.length) {
      if (hours === 0) return { id: null, hours: 0 };
      const project = await assertProjectForMember(ctx, d.projectId, d.memberId, taskId);
      const [row] = await db
        .insert(timeEntries)
        .values({
          companyId: cid,
          memberId: d.memberId,
          projectId: d.projectId,
          taskId,
          date: d.date,
          hours,
          description: d.description || null,
          billable: d.billable ?? project.billingType !== "non_billable",
        })
        .returning({ id: timeEntries.id });
      result = { id: row.id, hours };
    } else if (hours === 0 && !running) {
      await db.delete(timeEntries).where(
        inArray(
          timeEntries.id,
          existing.map((e) => e.id),
        ),
      );
      result = { id: null, hours: 0 };
    } else {
      const primary = running ?? existing[0];
      const others = existing.filter((e) => e.id !== primary.id);
      const mergedDescription =
        d.description !== undefined
          ? d.description || null
          : [...new Set(existing.map((e) => e.description).filter(Boolean))].join("; ") || null;
      await db
        .update(timeEntries)
        .set({
          hours,
          description: mergedDescription,
          billable: d.billable ?? primary.billable,
          status: "draft",
          rejectionReason: null,
        })
        .where(eq(timeEntries.id, primary.id));
      if (others.length)
        await db.delete(timeEntries).where(
          inArray(
            timeEntries.id,
            others.map((e) => e.id),
          ),
        );
      result = { id: primary.id, hours };
    }
    revalidateTimesheet();
    return result;
  });
}

const rowSchema = z.object({ memberId: z.string(), projectId: z.string(), taskId: z.string().nullable().optional(), weekStart: zDate });

/** Șterge un rând din săptămână (doar orele editabile). */
export async function deleteRowAction(input: z.input<typeof rowSchema>) {
  return runAction(async () => {
    const ctx = await requireContext();
    const d = rowSchema.parse(input);
    await assertTimesheetAccess(ctx, d.memberId);
    const end = addDaysIso(d.weekStart, 6);
    const rows = await db
      .select()
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.companyId, ctx.company.id),
          eq(timeEntries.memberId, d.memberId),
          eq(timeEntries.projectId, d.projectId),
          d.taskId ? eq(timeEntries.taskId, d.taskId) : isNull(timeEntries.taskId),
          gte(timeEntries.date, d.weekStart),
          lte(timeEntries.date, end),
        ),
      );
    if (rows.some((e) => LOCKED.has(e.status) || e.invoicedDocumentId)) throw new Error("Rândul conține ore trimise sau aprobate.");
    if (rows.some((e) => e.timerStartedAt)) throw new Error("Oprește întâi cronometrul pornit pe acest rând.");
    if (rows.length)
      await db.delete(timeEntries).where(
        inArray(
          timeEntries.id,
          rows.map((r) => r.id),
        ),
      );
    revalidateTimesheet();
    return null;
  }, "Rând șters");
}

/* ------------------------------------------------------------------ */
/* Săptămână                                                           */
/* ------------------------------------------------------------------ */

const weekSchema = z.object({ memberId: z.string(), weekStart: zDate });

/** Copiază orele din săptămâna anterioară în celulele goale ale săptămânii curente (ca ciorne). */
export async function copyPreviousWeekAction(input: z.input<typeof weekSchema>) {
  return runAction(async () => {
    const ctx = await requireContext();
    const d = weekSchema.parse(input);
    await assertTimesheetAccess(ctx, d.memberId);
    const cid = ctx.company.id;
    const prevStart = addDaysIso(d.weekStart, -7);
    const end = addDaysIso(d.weekStart, 6);
    const [prev, current, memberships] = await Promise.all([
      db
        .select()
        .from(timeEntries)
        .where(and(eq(timeEntries.companyId, cid), eq(timeEntries.memberId, d.memberId), gte(timeEntries.date, prevStart), lte(timeEntries.date, addDaysIso(prevStart, 6)))),
      db
        .select()
        .from(timeEntries)
        .where(and(eq(timeEntries.companyId, cid), eq(timeEntries.memberId, d.memberId), gte(timeEntries.date, d.weekStart), lte(timeEntries.date, end))),
      db.select({ projectId: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.memberId, d.memberId)),
    ]);
    const allowed = new Set(memberships.map((m) => m.projectId));
    const taken = new Set(current.map((e) => `${e.projectId}:${e.taskId ?? ""}:${e.date}`));
    const merged = new Map<string, Omit<TimeEntry, "id" | "createdAt" | "updatedAt">>();
    for (const e of prev) {
      if (!allowed.has(e.projectId) || e.hours <= 0) continue;
      const date = addDaysIso(e.date, 7);
      const key = `${e.projectId}:${e.taskId ?? ""}:${date}`;
      if (taken.has(key)) continue;
      const m = merged.get(key);
      if (m) m.hours = round2(m.hours + e.hours);
      else
        merged.set(key, {
          companyId: cid,
          memberId: d.memberId,
          projectId: e.projectId,
          taskId: e.taskId,
          date,
          hours: e.hours,
          description: e.description,
          billable: e.billable,
          status: "draft",
          rejectionReason: null,
          approvedBy: null,
          approvedAt: null,
          invoicedDocumentId: null,
          timerStartedAt: null,
        });
    }
    const values = [...merged.values()];
    if (values.length) await db.insert(timeEntries).values(values);
    revalidateTimesheet();
    return { count: values.length };
  });
}

/** Trimite spre aprobare toate orele editabile (ciornă / respinse) din săptămână. */
export async function submitWeekAction(input: z.input<typeof weekSchema>) {
  return runAction(async () => {
    const ctx = await requireContext();
    const d = weekSchema.parse(input);
    const member = await assertTimesheetAccess(ctx, d.memberId);
    const end = addDaysIso(d.weekStart, 6);
    const rows = await db
      .update(timeEntries)
      .set({ status: "submitted", rejectionReason: null })
      .where(
        and(
          eq(timeEntries.companyId, ctx.company.id),
          eq(timeEntries.memberId, d.memberId),
          gte(timeEntries.date, d.weekStart),
          lte(timeEntries.date, end),
          inArray(timeEntries.status, ["draft", "rejected"]),
          isNull(timeEntries.timerStartedAt),
        ),
      )
      .returning({ id: timeEntries.id, hours: timeEntries.hours });
    if (!rows.length) throw new Error("Nu există ore noi de trimis în această săptămână.");
    const total = round2(rows.reduce((a, r) => a + r.hours, 0));
    await logActivity(actorFrom(ctx), {
      entity: "timesheet",
      entityId: d.memberId,
      action: "submitted",
      message: `${member.name} a trimis spre aprobare ${total.toLocaleString("ro-RO")} h (săpt. ${d.weekStart})`,
    });
    revalidateTimesheet();
    revalidatePath("/", "layout");
    return { count: rows.length, hours: total };
  });
}

/** Retrage trimiterea (submitted → draft) pentru săptămână. */
export async function retractWeekAction(input: z.input<typeof weekSchema>) {
  return runAction(async () => {
    const ctx = await requireContext();
    const d = weekSchema.parse(input);
    await assertTimesheetAccess(ctx, d.memberId);
    const rows = await db
      .update(timeEntries)
      .set({ status: "draft" })
      .where(
        and(
          eq(timeEntries.companyId, ctx.company.id),
          eq(timeEntries.memberId, d.memberId),
          gte(timeEntries.date, d.weekStart),
          lte(timeEntries.date, addDaysIso(d.weekStart, 6)),
          eq(timeEntries.status, "submitted"),
        ),
      )
      .returning({ id: timeEntries.id });
    if (!rows.length) throw new Error("Nu există ore trimise de retras.");
    revalidateTimesheet();
    revalidatePath("/", "layout");
    return { count: rows.length };
  }, "Trimiterea a fost retrasă");
}

/* ------------------------------------------------------------------ */
/* Cronometru                                                          */
/* ------------------------------------------------------------------ */

async function stopRunning(companyId: string, memberId: string) {
  const running = await db
    .select()
    .from(timeEntries)
    .where(and(eq(timeEntries.companyId, companyId), eq(timeEntries.memberId, memberId), isNotNull(timeEntries.timerStartedAt)));
  let added = 0;
  for (const e of running) {
    const elapsed = round2((Date.now() - e.timerStartedAt!.getTime()) / 3_600_000);
    added += elapsed;
    await db
      .update(timeEntries)
      .set({ hours: round2(Math.min(24, e.hours + elapsed)), timerStartedAt: null })
      .where(eq(timeEntries.id, e.id));
  }
  return round2(added);
}

const timerSchema = z.object({
  projectId: z.string().min(1, "Alege proiectul"),
  taskId: z.string().nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

/** Pornește cronometrul pentru membrul curent (oprește automat cronometrul anterior). */
export async function startTimerAction(input: z.input<typeof timerSchema>) {
  return runAction(async () => {
    const ctx = await requirePermission("timesheet.own");
    if (!ctx.teamMemberId) throw new Error("Contul tău nu este asociat unui membru al echipei.");
    const d = timerSchema.parse(input);
    const memberId = ctx.teamMemberId;
    const taskId = d.taskId || null;
    const project = await assertProjectForMember(ctx, d.projectId, memberId, taskId);
    await stopRunning(ctx.company.id, memberId);
    const date = todayIso();
    const cell = await db.select().from(timeEntries).where(cellWhere(ctx.company.id, memberId, d.projectId, taskId, date));
    const editable = cell.find((e) => !LOCKED.has(e.status) && !e.invoicedDocumentId);
    const desc = d.description || null;
    if (editable) {
      const description = desc && editable.description && !editable.description.includes(desc) ? `${editable.description}; ${desc}` : (editable.description ?? desc);
      await db
        .update(timeEntries)
        .set({ timerStartedAt: new Date(), description, status: "draft", rejectionReason: null })
        .where(eq(timeEntries.id, editable.id));
    } else {
      await db.insert(timeEntries).values({
        companyId: ctx.company.id,
        memberId,
        projectId: d.projectId,
        taskId,
        date,
        hours: 0,
        description: desc,
        billable: project.billingType !== "non_billable",
        timerStartedAt: new Date(),
      });
    }
    revalidateTimesheet();
    return null;
  }, "Cronometru pornit");
}

/** Oprește cronometrul: timpul scurs se adaugă la intrarea de pontaj. */
export async function stopTimerAction() {
  return runAction(async () => {
    const ctx = await requirePermission("timesheet.own");
    if (!ctx.teamMemberId) throw new Error("Contul tău nu este asociat unui membru al echipei.");
    const added = await stopRunning(ctx.company.id, ctx.teamMemberId);
    revalidateTimesheet();
    return { added };
  });
}

/** Renunță la cronometru fără a adăuga timpul. */
export async function discardTimerAction() {
  return runAction(async () => {
    const ctx = await requirePermission("timesheet.own");
    if (!ctx.teamMemberId) throw new Error("Contul tău nu este asociat unui membru al echipei.");
    const running = await db
      .select()
      .from(timeEntries)
      .where(and(eq(timeEntries.companyId, ctx.company.id), eq(timeEntries.memberId, ctx.teamMemberId), isNotNull(timeEntries.timerStartedAt)));
    for (const e of running) {
      if (e.hours === 0) await db.delete(timeEntries).where(eq(timeEntries.id, e.id));
      else await db.update(timeEntries).set({ timerStartedAt: null }).where(eq(timeEntries.id, e.id));
    }
    revalidateTimesheet();
    return null;
  }, "Cronometru anulat");
}

/* ------------------------------------------------------------------ */
/* Aprobări                                                            */
/* ------------------------------------------------------------------ */

const idsSchema = z.object({ ids: z.array(z.string()).min(1, "Nu ai selectat nicio intrare") });

export async function approveEntriesAction(input: z.input<typeof idsSchema>) {
  return runAction(async () => {
    const ctx = await requirePermission("timesheet.approve");
    const d = idsSchema.parse(input);
    const rows = await db
      .update(timeEntries)
      .set({ status: "approved", approvedBy: ctx.user.id, approvedAt: new Date(), rejectionReason: null })
      .where(and(eq(timeEntries.companyId, ctx.company.id), inArray(timeEntries.id, d.ids), eq(timeEntries.status, "submitted")))
      .returning({ id: timeEntries.id, hours: timeEntries.hours });
    const hours = round2(rows.reduce((a, r) => a + r.hours, 0));
    await logActivity(actorFrom(ctx), { entity: "timesheet", action: "approved", message: `Pontaj aprobat: ${hours.toLocaleString("ro-RO")} h (${rows.length} intrări)` });
    revalidateTimesheet();
    revalidatePath("/", "layout");
    return { count: rows.length, hours };
  });
}

const rejectSchema = idsSchema.extend({ reason: z.string().trim().min(3, "Scrie motivul respingerii").max(500) });

export async function rejectEntriesAction(input: z.input<typeof rejectSchema>) {
  return runAction(async () => {
    const ctx = await requirePermission("timesheet.approve");
    const d = rejectSchema.parse(input);
    const rows = await db
      .update(timeEntries)
      .set({ status: "rejected", rejectionReason: d.reason, approvedBy: null, approvedAt: null })
      .where(and(eq(timeEntries.companyId, ctx.company.id), inArray(timeEntries.id, d.ids), eq(timeEntries.status, "submitted")))
      .returning({ id: timeEntries.id });
    await logActivity(actorFrom(ctx), { entity: "timesheet", action: "rejected", message: `Pontaj respins (${rows.length} intrări): ${d.reason}` });
    revalidateTimesheet();
    revalidatePath("/", "layout");
    return { count: rows.length };
  });
}

