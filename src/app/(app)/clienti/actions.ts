"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { partners } from "@/lib/db/schema";
import { actorFrom, logActivity } from "@/lib/server/activity";
import { runAction } from "@/lib/server/action";

/** Reactivează un client/furnizor arhivat (folosit și din /furnizori). */
export async function restorePartnerAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const partnerId = z.string().min(1).parse(id);
    const [p] = await db
      .update(partners)
      .set({ active: true })
      .where(and(eq(partners.id, partnerId), eq(partners.companyId, ctx.company.id)))
      .returning({ id: partners.id, name: partners.name });
    if (!p) throw new Error("Partenerul nu există.");
    await logActivity(actorFrom(ctx), { entity: "partner", entityId: p.id, action: "restored", message: `Partener reactivat: ${p.name}` });
    revalidatePath("/clienti");
    revalidatePath("/furnizori");
    revalidatePath(`/clienti/${p.id}`);
    revalidatePath(`/furnizori/${p.id}`);
    return p;
  }, "Partener reactivat");
}
