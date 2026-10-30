"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { requireContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { actorFrom, logActivity } from "@/lib/server/activity";
import { runAction } from "@/lib/server/action";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Numele este prea scurt").max(120, "Numele este prea lung"),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Culoare invalidă"),
});

export async function updateProfileAction(input: z.input<typeof profileSchema>) {
  return runAction(async () => {
    const ctx = await requireContext();
    const d = profileSchema.parse(input);
    await db.update(users).set(d).where(eq(users.id, ctx.user.id));
    revalidatePath("/", "layout");
    return d;
  }, "Profilul a fost actualizat");
}

const passwordSchema = z
  .object({
    current: z.string().min(1, "Introdu parola curentă"),
    next: z.string().min(8, "Parola nouă trebuie să aibă minim 8 caractere").max(200),
    confirm: z.string(),
  })
  .refine((d) => d.next === d.confirm, { path: ["confirm"], message: "Parolele nu coincid" })
  .refine((d) => d.next !== d.current, { path: ["next"], message: "Parola nouă trebuie să fie diferită de cea curentă" });

export async function changePasswordAction(input: z.input<typeof passwordSchema>) {
  return runAction(async () => {
    const ctx = await requireContext();
    const d = passwordSchema.parse(input);
    const user = await db.query.users.findFirst({ where: eq(users.id, ctx.user.id) });
    if (!user || !(await verifyPassword(d.current, user.passwordHash))) throw new Error("Parola curentă este incorectă.");
    await db.update(users).set({ passwordHash: await hashPassword(d.next) }).where(eq(users.id, user.id));
    await logActivity(actorFrom(ctx), { entity: "user", entityId: user.id, action: "password_changed", message: `${user.name} și-a schimbat parola` });
    return null;
  }, "Parola a fost schimbată");
}
