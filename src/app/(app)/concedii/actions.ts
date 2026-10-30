"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, requireContext, requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { timeOff, TIME_OFF_TYPES } from "@/lib/db/schema";
import { getCompanyMember } from "@/lib/outsourcing/server";
import { zDate, zOptText, runAction } from "@/lib/server/action";
import { actorFrom, logActivity } from "@/lib/server/activity";

const requestSchema = z
  .object({
    id: z.string().optional().nullable(),
    memberId: z.string().min(1, "Alege persoana"),
    type: z.enum(TIME_OFF_TYPES),
    startDate: zDate,
    endDate: zDate,
    notes: zOptText,
  })
  .refine((d) => d.endDate >= d.startDate, { message: "Data de final trebuie să fie după data de start", path: ["endDate"] });

export type TimeOffInput = z.input<typeof requestSchema>;

function revalidate() {
  revalidatePath("/concedii");
  revalidatePath("/planificare");
  revalidatePath("/pontaj");
  revalidatePath("/echipa", "layout");
}

export async function saveTimeOffAction(input: TimeOffInput) {
  return runAction(async () => {
    const ctx = await requireContext();
    const d = requestSchema.parse(input);
    const manager = can(ctx, "timesheet.approve");
    if (!manager && d.memberId !== ctx.teamMemberId) throw new Error("Poți solicita concediu doar pentru tine.");
    const member = await getCompanyMember(ctx.company.id, d.memberId);
    const values = { memberId: d.memberId, type: d.type, startDate: d.startDate, endDate: d.endDate, notes: d.notes };
    if (d.id) {
      const prev = await db.query.timeOff.findFirst({ where: and(eq(timeOff.id, d.id), eq(timeOff.companyId, ctx.company.id)) });
      if (!prev) throw new Error("Cererea nu există.");
      if (!manager && (prev.memberId !== ctx.teamMemberId || prev.status !== "pending")) throw new Error("Poți modifica doar cererile tale în așteptare.");
      await db.update(timeOff).set(values).where(eq(timeOff.id, d.id));
    } else {
      // managerii pot înregistra direct concedii aprobate (ex. medical); sărbătorile sunt automat aprobate
      const status = manager || d.type === "holiday" ? "approved" : "pending";
      await db.insert(timeOff).values({ ...values, companyId: ctx.company.id, status });
      await logActivity(actorFrom(ctx), {
        entity: "time_off",
        entityId: d.memberId,
        action: "requested",
        message: `Concediu ${status === "approved" ? "înregistrat" : "solicitat"} pentru ${member.name}: ${d.startDate} … ${d.endDate}`,
      });
    }
    revalidate();
    return null;
  }, input.id ? "Cerere actualizată" : "Cerere înregistrată");
}

export async function decideTimeOffAction(id: string, status: "approved" | "rejected" | "pending") {
  return runAction(async () => {
    const ctx = await requirePermission("timesheet.approve");
    const parsed = z.enum(["approved", "rejected", "pending"]).parse(status);
    const [row] = await db
      .update(timeOff)
      .set({ status: parsed })
      .where(and(eq(timeOff.id, id), eq(timeOff.companyId, ctx.company.id)))
      .returning();
    if (!row) throw new Error("Cererea nu există.");
    revalidate();
    return null;
  }, status === "approved" ? "Concediu aprobat" : status === "rejected" ? "Cerere respinsă" : "Cerere redeschisă");
}

export async function deleteTimeOffAction(id: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    const row = await db.query.timeOff.findFirst({ where: and(eq(timeOff.id, id), eq(timeOff.companyId, ctx.company.id)) });
    if (!row) throw new Error("Cererea nu există.");
    const manager = can(ctx, "timesheet.approve");
    if (!manager && (row.memberId !== ctx.teamMemberId || row.status !== "pending")) throw new Error("Poți anula doar cererile tale în așteptare.");
    await db.delete(timeOff).where(eq(timeOff.id, id));
    revalidate();
    return null;
  }, "Cerere ștearsă");
}
