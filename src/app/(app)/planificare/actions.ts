"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { allocations, projectMembers } from "@/lib/db/schema";
import { getCompanyMember, getCompanyProject } from "@/lib/outsourcing/server";
import { zDate, zOptText, runAction } from "@/lib/server/action";

const allocationSchema = z
  .object({
    id: z.string().optional().nullable(),
    memberId: z.string().min(1, "Alege membrul"),
    projectId: z.string().min(1, "Alege proiectul"),
    startDate: zDate,
    endDate: zDate,
    hoursPerDay: z.number({ error: "Ore invalide" }).gt(0, "Minimum 0,25 h/zi").max(16, "Maximum 16 h/zi"),
    notes: zOptText,
  })
  .refine((d) => d.endDate >= d.startDate, { message: "Data de final trebuie să fie după data de start", path: ["endDate"] });

export type AllocationInput = z.input<typeof allocationSchema>;

function revalidate(projectId?: string) {
  revalidatePath("/planificare");
  revalidatePath("/echipa", "layout");
  if (projectId) revalidatePath(`/proiecte/${projectId}`);
}

export async function saveAllocationAction(input: AllocationInput) {
  return runAction(async () => {
    const ctx = await requirePermission("projects.manage");
    const d = allocationSchema.parse(input);
    const cid = ctx.company.id;
    const [member] = await Promise.all([getCompanyMember(cid, d.memberId), getCompanyProject(cid, d.projectId)]);
    const values = { memberId: d.memberId, projectId: d.projectId, startDate: d.startDate, endDate: d.endDate, hoursPerDay: d.hoursPerDay, notes: d.notes };
    let saved;
    if (d.id) {
      [saved] = await db
        .update(allocations)
        .set(values)
        .where(and(eq(allocations.id, d.id), eq(allocations.companyId, cid)))
        .returning();
      if (!saved) throw new Error("Alocarea nu există.");
    } else {
      [saved] = await db
        .insert(allocations)
        .values({ ...values, companyId: cid })
        .returning();
    }
    // membrul alocat devine automat membru al proiectului (pentru pontaj)
    await db
      .insert(projectMembers)
      .values({ projectId: d.projectId, memberId: d.memberId, role: member.position })
      .onConflictDoNothing();
    revalidate(d.projectId);
    return saved;
  }, input.id ? "Alocare actualizată" : "Alocare creată");
}

const moveSchema = z
  .object({ id: z.string(), startDate: zDate, endDate: zDate, memberId: z.string().optional(), projectId: z.string().optional() })
  .refine((d) => d.endDate >= d.startDate, { message: "Interval invalid", path: ["endDate"] });

/** Mutare / redimensionare rapidă din timeline (drag) — opțional și pe alt membru / alt proiect. */
export async function moveAllocationAction(input: z.input<typeof moveSchema>) {
  return runAction(async () => {
    const ctx = await requirePermission("projects.manage");
    const d = moveSchema.parse(input);
    const cid = ctx.company.id;
    const member = d.memberId ? await getCompanyMember(cid, d.memberId) : null;
    if (d.projectId) await getCompanyProject(cid, d.projectId);
    const [saved] = await db
      .update(allocations)
      .set({ startDate: d.startDate, endDate: d.endDate, ...(d.memberId ? { memberId: d.memberId } : {}), ...(d.projectId ? { projectId: d.projectId } : {}) })
      .where(and(eq(allocations.id, d.id), eq(allocations.companyId, cid)))
      .returning();
    if (!saved) throw new Error("Alocarea nu există.");
    if (d.memberId || d.projectId) {
      await db
        .insert(projectMembers)
        .values({ projectId: saved.projectId, memberId: saved.memberId, role: member?.position ?? null })
        .onConflictDoNothing();
    }
    revalidate(saved.projectId);
    return saved;
  });
}

export async function deleteAllocationAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("projects.manage");
    const [deleted] = await db
      .delete(allocations)
      .where(and(eq(allocations.id, id), eq(allocations.companyId, ctx.company.id)))
      .returning();
    if (!deleted) throw new Error("Alocarea nu există.");
    revalidate(deleted.projectId);
    return null;
  }, "Alocare ștearsă");
}
