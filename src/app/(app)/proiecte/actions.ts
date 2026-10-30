"use server";

import { addDays, format, parseISO } from "date-fns";
import { and, asc, count, eq, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getExchangeRate } from "@/lib/anaf/bnr";
import { can, requireContext, requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  BILLING_TYPES,
  documents,
  partners,
  PROJECT_STATUSES,
  projectMembers,
  projects,
  TASK_PRIORITIES,
  TASK_STATUSES,
  tasks,
  teamMembers,
  timeEntries,
} from "@/lib/db/schema";
import { createDocument } from "@/lib/documents/server";
import { todayIso } from "@/lib/format";
import { buildInvoiceLines, defaultServiceVat, type BillableEntry } from "@/lib/outsourcing/invoice";
import { getCompanyMember, getCompanyProject, loadRateBook } from "@/lib/outsourcing/server";
import { zDate, zOptText, zReqText, runAction } from "@/lib/server/action";
import { actorFrom, logActivity } from "@/lib/server/activity";

const optNum = z.number().min(0, "Valoarea nu poate fi negativă").nullable().optional();
const optDate = zDate.nullable().optional();

/* ------------------------------------------------------------------ */
/* Proiecte                                                            */
/* ------------------------------------------------------------------ */

const projectSchema = z
  .object({
    id: z.string().optional().nullable(),
    name: zReqText("Numele proiectului"),
    code: zOptText,
    clientId: zOptText,
    description: zOptText,
    status: z.enum(PROJECT_STATUSES),
    billingType: z.enum(BILLING_TYPES),
    hourlyRate: optNum,
    currency: z.string().length(3),
    budgetHours: optNum,
    budgetAmount: optNum,
    monthlyRetainer: optNum,
    startDate: optDate,
    endDate: optDate,
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Culoare invalidă"),
    managerId: zOptText,
    memberIds: z.array(z.string()).optional(),
  })
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, { message: "Data de final trebuie să fie după data de start", path: ["endDate"] });

export type ProjectInput = z.input<typeof projectSchema>;

export async function saveProjectAction(input: ProjectInput) {
  return runAction(async () => {
    const ctx = await requirePermission("projects.manage");
    const d = projectSchema.parse(input);
    const cid = ctx.company.id;
    if (d.clientId) {
      const client = await db.query.partners.findFirst({ where: and(eq(partners.id, d.clientId), eq(partners.companyId, cid)) });
      if (!client) throw new Error("Clientul selectat nu există.");
    }
    if (d.managerId) await getCompanyMember(cid, d.managerId);
    const values = {
      name: d.name,
      code: d.code?.toUpperCase() ?? null,
      clientId: d.clientId,
      description: d.description,
      status: d.status,
      billingType: d.billingType,
      hourlyRate: d.hourlyRate ?? null,
      currency: d.currency.toUpperCase(),
      budgetHours: d.budgetHours || null,
      budgetAmount: d.budgetAmount || null,
      monthlyRetainer: d.billingType === "retainer" ? d.monthlyRetainer || null : null,
      startDate: d.startDate ?? null,
      endDate: d.endDate ?? null,
      color: d.color,
      managerId: d.managerId,
    };
    let id = d.id;
    if (id) {
      const [saved] = await db
        .update(projects)
        .set(values)
        .where(and(eq(projects.id, id), eq(projects.companyId, cid)))
        .returning({ id: projects.id });
      if (!saved) throw new Error("Proiectul nu există.");
    } else {
      const [created] = await db.insert(projects).values({ ...values, companyId: cid }).returning({ id: projects.id });
      id = created.id;
      const memberIds = [...new Set([...(d.memberIds ?? []), ...(d.managerId ? [d.managerId] : [])])];
      if (memberIds.length) {
        const valid = await db
          .select({ id: teamMembers.id, position: teamMembers.position })
          .from(teamMembers)
          .where(and(eq(teamMembers.companyId, cid), inArray(teamMembers.id, memberIds)));
        if (valid.length) await db.insert(projectMembers).values(valid.map((m) => ({ projectId: id!, memberId: m.id, role: m.position })));
      }
      await logActivity(actorFrom(ctx), { entity: "project", entityId: id, action: "created", message: `Proiect nou: ${d.name}` });
    }
    revalidatePath("/proiecte");
    revalidatePath(`/proiecte/${id}`);
    revalidatePath("/planificare");
    return { id: id! };
  }, input.id ? "Proiect actualizat" : "Proiect creat");
}

export async function deleteProjectAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("projects.manage");
    const p = await getCompanyProject(ctx.company.id, id);
    const [[entries], [docs]] = await Promise.all([
      db.select({ n: count() }).from(timeEntries).where(eq(timeEntries.projectId, id)),
      db.select({ n: count() }).from(documents).where(and(eq(documents.companyId, ctx.company.id), eq(documents.projectId, id))),
    ]);
    if (entries.n || docs.n) throw new Error("Proiectul are pontaje sau facturi asociate. Schimbă-i statusul în „Anulat” sau „Finalizat”.");
    await db.transaction(async (tx) => {
      await tx.delete(tasks).where(eq(tasks.projectId, id));
      await tx.delete(projectMembers).where(eq(projectMembers.projectId, id));
      await tx.delete(projects).where(eq(projects.id, id));
      await logActivity(actorFrom(ctx), { entity: "project", entityId: id, action: "deleted", message: `Proiect șters: ${p.name}` }, tx);
    });
    revalidatePath("/proiecte");
    revalidatePath("/planificare");
    return null;
  }, "Proiect șters");
}

/* ------------------------------------------------------------------ */
/* Membri proiect                                                      */
/* ------------------------------------------------------------------ */

const memberSchema = z.object({
  projectId: z.string(),
  memberId: z.string(),
  role: zOptText,
  hourlyRate: optNum,
});

export async function addProjectMemberAction(input: z.input<typeof memberSchema>) {
  return runAction(async () => {
    const ctx = await requirePermission("projects.manage");
    const d = memberSchema.parse(input);
    await getCompanyProject(ctx.company.id, d.projectId);
    const m = await getCompanyMember(ctx.company.id, d.memberId);
    await db
      .insert(projectMembers)
      .values({ projectId: d.projectId, memberId: d.memberId, role: d.role ?? m.position, hourlyRate: d.hourlyRate || null })
      .onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.memberId], set: { role: d.role ?? m.position, hourlyRate: d.hourlyRate || null } });
    revalidatePath(`/proiecte/${d.projectId}`);
    revalidatePath("/proiecte");
    return null;
  }, "Membru adăugat în proiect");
}

export async function updateProjectMemberAction(input: z.input<typeof memberSchema>) {
  return runAction(async () => {
    const ctx = await requirePermission("projects.manage");
    const d = memberSchema.parse(input);
    await getCompanyProject(ctx.company.id, d.projectId);
    await db
      .update(projectMembers)
      .set({ role: d.role, hourlyRate: d.hourlyRate || null })
      .where(and(eq(projectMembers.projectId, d.projectId), eq(projectMembers.memberId, d.memberId)));
    revalidatePath(`/proiecte/${d.projectId}`);
    return null;
  }, "Membru actualizat");
}

export async function removeProjectMemberAction(projectId: string, memberId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("projects.manage");
    await getCompanyProject(ctx.company.id, projectId);
    await db.delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.memberId, memberId)));
    // task-urile rămân, dar fără responsabil
    await db
      .update(tasks)
      .set({ assigneeId: null })
      .where(and(eq(tasks.projectId, projectId), eq(tasks.assigneeId, memberId), ne(tasks.status, "done")));
    revalidatePath(`/proiecte/${projectId}`);
    revalidatePath("/proiecte");
    return null;
  }, "Membru eliminat din proiect");
}

/* ------------------------------------------------------------------ */
/* Task-uri                                                            */
/* ------------------------------------------------------------------ */

const taskSchema = z.object({
  id: z.string().optional().nullable(),
  projectId: z.string(),
  title: zReqText("Titlul"),
  description: zOptText,
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  assigneeId: zOptText,
  estimateHours: optNum,
  dueDate: optDate,
});

export type TaskInput = z.input<typeof taskSchema>;

async function nextPosition(projectId: string, status: string) {
  const rows = await db
    .select({ position: tasks.position })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), eq(tasks.status, status as (typeof TASK_STATUSES)[number])));
  return rows.length ? Math.max(...rows.map((r) => r.position)) + 1 : 0;
}

export async function saveTaskAction(input: TaskInput) {
  return runAction(async () => {
    const ctx = await requirePermission("projects.manage");
    const d = taskSchema.parse(input);
    const cid = ctx.company.id;
    await getCompanyProject(cid, d.projectId);
    if (d.assigneeId) await getCompanyMember(cid, d.assigneeId);
    const values = {
      title: d.title,
      description: d.description,
      status: d.status,
      priority: d.priority,
      assigneeId: d.assigneeId,
      estimateHours: d.estimateHours || null,
      dueDate: d.dueDate ?? null,
    };
    let saved;
    if (d.id) {
      const prev = await db.query.tasks.findFirst({ where: and(eq(tasks.id, d.id), eq(tasks.companyId, cid)) });
      if (!prev) throw new Error("Task-ul nu există.");
      const position = prev.status !== d.status ? await nextPosition(d.projectId, d.status) : prev.position;
      [saved] = await db
        .update(tasks)
        .set({ ...values, position })
        .where(and(eq(tasks.id, d.id), eq(tasks.companyId, cid)))
        .returning();
    } else {
      [saved] = await db
        .insert(tasks)
        .values({ ...values, companyId: cid, projectId: d.projectId, position: await nextPosition(d.projectId, d.status) })
        .returning();
    }
    revalidatePath(`/proiecte/${d.projectId}`);
    return saved;
  }, input.id ? "Task actualizat" : "Task creat");
}

export async function deleteTaskAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("projects.manage");
    const t = await db.query.tasks.findFirst({ where: and(eq(tasks.id, id), eq(tasks.companyId, ctx.company.id)) });
    if (!t) throw new Error("Task-ul nu există.");
    await db.update(timeEntries).set({ taskId: null }).where(eq(timeEntries.taskId, id));
    await db.delete(tasks).where(eq(tasks.id, id));
    revalidatePath(`/proiecte/${t.projectId}`);
    return null;
  }, "Task șters");
}

const moveSchema = z.object({ id: z.string(), status: z.enum(TASK_STATUSES), index: z.number().int().min(0) });

/** Mută un task într-o coloană, la poziția dată; renumerotează coloana (0…n). */
export async function moveTaskAction(input: z.input<typeof moveSchema>) {
  return runAction(async () => {
    const ctx = await requireContext();
    const d = moveSchema.parse(input);
    const t = await db.query.tasks.findFirst({ where: and(eq(tasks.id, d.id), eq(tasks.companyId, ctx.company.id)) });
    if (!t) throw new Error("Task-ul nu există.");
    const allowed = can(ctx, "projects.manage") || (!!ctx.teamMemberId && t.assigneeId === ctx.teamMemberId);
    if (!allowed) throw new Error("Poți muta doar task-urile atribuite ție.");
    await db.transaction(async (tx) => {
      const column = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.projectId, t.projectId), eq(tasks.status, d.status), ne(tasks.id, d.id)))
        .orderBy(asc(tasks.position), asc(tasks.createdAt));
      const ids = column.map((c) => c.id);
      ids.splice(Math.min(d.index, ids.length), 0, d.id);
      for (let i = 0; i < ids.length; i++) {
        await tx
          .update(tasks)
          .set(ids[i] === d.id ? { position: i, status: d.status } : { position: i })
          .where(eq(tasks.id, ids[i]));
      }
    });
    revalidatePath(`/proiecte/${t.projectId}`);
    return null;
  });
}

/* ------------------------------------------------------------------ */
/* Facturare ore aprobate                                              */
/* ------------------------------------------------------------------ */

const invoiceSchema = z
  .object({
    projectId: z.string(),
    from: zDate,
    to: zDate,
    grouping: z.enum(["member", "task", "single"]),
  })
  .refine((d) => d.to >= d.from, { message: "Perioada este invalidă", path: ["to"] });

export async function createProjectInvoiceAction(input: z.input<typeof invoiceSchema>) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const d = invoiceSchema.parse(input);
    const cid = ctx.company.id;
    const project = await getCompanyProject(cid, d.projectId);
    if (project.billingType === "non_billable") throw new Error("Proiectul este intern (nefacturabil).");
    if (!project.clientId) throw new Error("Proiectul nu are un client asociat. Setează clientul din editarea proiectului.");
    const client = await db.query.partners.findFirst({ where: and(eq(partners.id, project.clientId), eq(partners.companyId, cid)) });
    if (!client) throw new Error("Clientul proiectului nu mai există.");

    const rows = await db
      .select({
        id: timeEntries.id,
        date: timeEntries.date,
        hours: timeEntries.hours,
        memberId: timeEntries.memberId,
        memberName: teamMembers.name,
        memberPosition: teamMembers.position,
        taskId: timeEntries.taskId,
        taskTitle: tasks.title,
      })
      .from(timeEntries)
      .innerJoin(teamMembers, eq(teamMembers.id, timeEntries.memberId))
      .leftJoin(tasks, eq(tasks.id, timeEntries.taskId))
      .leftJoin(documents, eq(documents.id, timeEntries.invoicedDocumentId))
      .where(
        and(
          eq(timeEntries.companyId, cid),
          eq(timeEntries.projectId, project.id),
          eq(timeEntries.status, "approved"),
          eq(timeEntries.billable, true),
          // nefacturate sau legate de o factură ștearsă / anulată
          or(isNull(timeEntries.invoicedDocumentId), isNull(documents.id), eq(documents.status, "cancelled")),
          gte(timeEntries.date, d.from),
          lte(timeEntries.date, d.to),
        ),
      );
    if (!rows.length && project.billingType !== "retainer") throw new Error("Nu există ore aprobate și nefacturate în perioada aleasă.");

    const rates = await loadRateBook(cid);
    const entries: BillableEntry[] = rows.map((r) => ({ ...r, rate: rates.rate(project.id, r.memberId) }));
    const { lines } = buildInvoiceLines(project, entries, d.grouping, d);
    if (!lines.length) throw new Error("Nu am putut genera linii de factură (verifică tarifele).");

    const currency = project.currency;
    let exchangeRate = 1;
    if (currency !== "RON") {
      const fx = await getExchangeRate(currency);
      if (!fx) throw new Error(`Nu am putut obține cursul BNR pentru ${currency}.`);
      exchangeRate = fx.rate;
    }
    const vat = defaultServiceVat(ctx.company.vatPayer, client.country);
    const issueDate = todayIso();
    const dueDate = client.paymentTermDays ? format(addDays(parseISO(issueDate), client.paymentTermDays), "yyyy-MM-dd") : null;

    const actor = actorFrom(ctx);
    const docId = await createDocument(actor, {
      kind: "invoice",
      partnerId: client.id,
      issueDate,
      dueDate,
      currency,
      exchangeRate,
      projectId: project.id,
      issue: false,
      internalNotes: `Generată din pontaj — ${project.name}, ${d.from} … ${d.to}`,
      lines: lines.map((l) => ({
        name: l.name,
        description: l.description,
        unit: l.unit,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        vatRate: vat.vatRate,
        vatCategory: vat.vatCategory,
      })),
    });
    if (rows.length) {
      await db
        .update(timeEntries)
        .set({ invoicedDocumentId: docId })
        .where(
          and(
            eq(timeEntries.companyId, cid),
            inArray(
              timeEntries.id,
              rows.map((r) => r.id),
            ),
          ),
        );
    }
    await logActivity(actor, {
      entity: "project",
      entityId: project.id,
      action: "invoiced",
      message: `Ore facturate pentru ${project.name}: ${rows.reduce((a, r) => a + r.hours, 0).toLocaleString("ro-RO")} h`,
    });
    revalidatePath(`/proiecte/${project.id}`);
    revalidatePath("/proiecte");
    revalidatePath("/facturi");
    return { id: docId };
  }, "Factura ciornă a fost creată");
}
