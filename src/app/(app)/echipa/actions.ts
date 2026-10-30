"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { allocations, projectMembers, teamMembers, timeEntries, timeOff } from "@/lib/db/schema";
import { zDate, zOptText, zReqText, runAction } from "@/lib/server/action";
import { actorFrom, logActivity } from "@/lib/server/activity";

const memberSchema = z.object({
  id: z.string().optional().nullable(),
  name: zReqText("Numele"),
  email: z.union([z.email("Email invalid"), z.literal("")]).optional().nullable(),
  phone: zOptText,
  position: zOptText,
  department: zOptText,
  seniority: z.enum(["intern", "junior", "mid", "senior", "lead", "principal"]),
  employmentType: z.enum(["cim", "pfa", "srl", "freelancer"]),
  hourlyCost: z.number().min(0, "Costul nu poate fi negativ"),
  hourlyRate: z.number().min(0, "Tariful nu poate fi negativ"),
  rateCurrency: z.string().length(3),
  weeklyCapacity: z.number().min(0).max(80, "Maximum 80 h/săptămână"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Culoare invalidă"),
  skills: z.array(z.string().trim().min(1).max(40)).max(30),
  startDate: zDate.nullable().optional(),
  active: z.boolean(),
});

export type MemberInput = z.input<typeof memberSchema>;

export async function saveMemberAction(input: MemberInput) {
  return runAction(async () => {
    const ctx = await requirePermission("projects.manage");
    const d = memberSchema.parse(input);
    const cid = ctx.company.id;
    const values = {
      name: d.name,
      email: d.email || null,
      phone: d.phone,
      position: d.position,
      department: d.department,
      seniority: d.seniority,
      employmentType: d.employmentType,
      hourlyCost: d.hourlyCost,
      hourlyRate: d.hourlyRate,
      rateCurrency: d.rateCurrency.toUpperCase(),
      weeklyCapacity: d.weeklyCapacity,
      color: d.color,
      skills: [...new Set(d.skills)],
      startDate: d.startDate ?? null,
      active: d.active,
    };
    let id = d.id;
    if (id) {
      const [saved] = await db
        .update(teamMembers)
        .set(values)
        .where(and(eq(teamMembers.id, id), eq(teamMembers.companyId, cid)))
        .returning({ id: teamMembers.id });
      if (!saved) throw new Error("Membrul nu există.");
    } else {
      const [created] = await db.insert(teamMembers).values({ ...values, companyId: cid }).returning({ id: teamMembers.id });
      id = created.id;
      await logActivity(actorFrom(ctx), { entity: "team_member", entityId: id, action: "created", message: `Membru nou în echipă: ${d.name}` });
    }
    revalidatePath("/echipa", "layout");
    revalidatePath("/planificare");
    return { id: id! };
  }, input.id ? "Profil actualizat" : "Membru adăugat");
}

export async function deleteMemberAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("projects.manage");
    const m = await db.query.teamMembers.findFirst({ where: and(eq(teamMembers.id, id), eq(teamMembers.companyId, ctx.company.id)) });
    if (!m) throw new Error("Membrul nu există.");
    const [[entries]] = await Promise.all([db.select({ n: count() }).from(timeEntries).where(eq(timeEntries.memberId, id))]);
    if (entries.n || m.userId) {
      // are istoric → doar dezactivăm
      await db.update(teamMembers).set({ active: false }).where(eq(teamMembers.id, id));
      revalidatePath("/echipa", "layout");
      revalidatePath("/planificare");
      return { deactivated: true };
    }
    await db.transaction(async (tx) => {
      await tx.delete(allocations).where(eq(allocations.memberId, id));
      await tx.delete(timeOff).where(eq(timeOff.memberId, id));
      await tx.delete(projectMembers).where(eq(projectMembers.memberId, id));
      await tx.delete(teamMembers).where(eq(teamMembers.id, id));
    });
    revalidatePath("/echipa", "layout");
    revalidatePath("/planificare");
    return { deactivated: false };
  });
}
