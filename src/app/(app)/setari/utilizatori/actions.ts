"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { requirePermission, type AppContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { memberships, ROLES, teamMembers, users, type Role } from "@/lib/db/schema";
import { PALETTE, ROLE_LABELS } from "@/lib/constants";
import { actorFrom, logActivity } from "@/lib/server/activity";
import { runAction } from "@/lib/server/action";

const addUserSchema = z.object({
  email: z.email("Email invalid").transform((v) => v.trim().toLowerCase()),
  name: z.string().trim().max(120).optional().default(""),
  password: z.string().max(200).optional().default(""),
  role: z.enum(ROLES),
  teamMember: z.string().default("none"), // "none" | "create" | id membru existent
});

export type AddUserInput = z.input<typeof addUserSchema>;

function assertCanGrant(ctx: AppContext, role: Role) {
  if (role === "owner" && ctx.role !== "owner") throw new Error("Doar un proprietar poate acorda rolul de proprietar.");
}

async function ownersCount(companyId: string) {
  const rows = await db.query.memberships.findMany({ where: and(eq(memberships.companyId, companyId), eq(memberships.role, "owner")), columns: { id: true } });
  return rows.length;
}

/** Adaugă un utilizator în firmă: cont nou (cu parolă temporară) sau acces pentru un cont existent. */
export async function addUserAction(input: AddUserInput) {
  return runAction(async () => {
    const ctx = await requirePermission("users");
    const d = addUserSchema.parse(input);
    assertCanGrant(ctx, d.role);
    const companyId = ctx.company.id;

    const result = await db.transaction(async (tx) => {
      let user = await tx.query.users.findFirst({ where: eq(users.email, d.email) });
      const existed = !!user;
      if (user) {
        const already = await tx.query.memberships.findFirst({ where: and(eq(memberships.userId, user.id), eq(memberships.companyId, companyId)) });
        if (already) throw new Error(`${user.name} are deja acces la această firmă.`);
      } else {
        if (d.name.length < 2) throw new Error("Numele este obligatoriu pentru un cont nou.");
        if (d.password.length < 8) throw new Error("Parola temporară trebuie să aibă minim 8 caractere.");
        [user] = await tx
          .insert(users)
          .values({ email: d.email, name: d.name, passwordHash: await hashPassword(d.password), avatarColor: PALETTE[Math.floor(Math.random() * PALETTE.length)], lastCompanyId: companyId })
          .returning();
      }

      let teamMemberId: string | null = null;
      if (d.teamMember === "create") {
        const [m] = await tx.insert(teamMembers).values({ companyId, userId: user!.id, name: user!.name, email: user!.email }).returning();
        teamMemberId = m.id;
      } else if (d.teamMember && d.teamMember !== "none") {
        const m = await tx.query.teamMembers.findFirst({ where: and(eq(teamMembers.id, d.teamMember), eq(teamMembers.companyId, companyId)) });
        if (!m) throw new Error("Membrul de echipă selectat nu există.");
        const linked = await tx.query.memberships.findFirst({ where: and(eq(memberships.companyId, companyId), eq(memberships.teamMemberId, m.id)) });
        if (linked) throw new Error(`${m.name} este deja asociat altui utilizator.`);
        await tx.update(teamMembers).set({ userId: user!.id }).where(eq(teamMembers.id, m.id));
        teamMemberId = m.id;
      }

      await tx.insert(memberships).values({ userId: user!.id, companyId, role: d.role, teamMemberId });
      return { user: user!, existed };
    });

    await logActivity(actorFrom(ctx), {
      entity: "user",
      entityId: result.user.id,
      action: "invited",
      message: `${result.user.name} (${result.user.email}) a primit acces ca ${ROLE_LABELS[d.role]}${result.existed ? " — cont existent" : ""}`,
    });
    revalidatePath("/setari/utilizatori");
    return { existed: result.existed, name: result.user.name, email: result.user.email };
  });
}

const updateSchema = z.object({
  membershipId: z.string().min(1),
  role: z.enum(ROLES).optional(),
  teamMemberId: z.string().nullable().optional(),
});

/** Schimbă rolul și/sau membrul de echipă asociat unui utilizator. */
export async function updateMembershipAction(input: z.input<typeof updateSchema>) {
  return runAction(async () => {
    const ctx = await requirePermission("users");
    const d = updateSchema.parse(input);
    const companyId = ctx.company.id;
    const m = await db.query.memberships.findFirst({ where: and(eq(memberships.id, d.membershipId), eq(memberships.companyId, companyId)), with: { user: true } });
    if (!m) throw new Error("Utilizatorul nu are acces la această firmă.");

    const patch: { role?: Role; teamMemberId?: string | null } = {};
    const notes: string[] = [];
    if (d.role && d.role !== m.role) {
      if (m.role === "owner" || d.role === "owner") assertCanGrant(ctx, "owner");
      if (m.role === "owner" && (await ownersCount(companyId)) <= 1) throw new Error("Firma trebuie să aibă cel puțin un proprietar. Desemnează întâi alt proprietar.");
      patch.role = d.role;
      notes.push(`rol ${ROLE_LABELS[m.role]} → ${ROLE_LABELS[d.role]}`);
    }
    if (d.teamMemberId !== undefined && d.teamMemberId !== m.teamMemberId) {
      if (d.teamMemberId) {
        const tm = await db.query.teamMembers.findFirst({ where: and(eq(teamMembers.id, d.teamMemberId), eq(teamMembers.companyId, companyId)) });
        if (!tm) throw new Error("Membrul de echipă nu există.");
        const other = await db.query.memberships.findFirst({
          where: and(eq(memberships.companyId, companyId), eq(memberships.teamMemberId, tm.id), ne(memberships.id, m.id)),
        });
        if (other) throw new Error(`${tm.name} este deja asociat altui utilizator.`);
        await db.update(teamMembers).set({ userId: m.userId }).where(eq(teamMembers.id, tm.id));
        notes.push(`asociat cu ${tm.name}`);
      } else {
        notes.push("dezasociat de membrul de echipă");
      }
      if (m.teamMemberId) await db.update(teamMembers).set({ userId: null }).where(and(eq(teamMembers.id, m.teamMemberId), eq(teamMembers.companyId, companyId)));
      patch.teamMemberId = d.teamMemberId;
    }
    if (!Object.keys(patch).length) return null;
    await db.update(memberships).set(patch).where(eq(memberships.id, m.id));
    await logActivity(actorFrom(ctx), { entity: "user", entityId: m.userId, action: "updated", message: `Acces ${m.user.name}: ${notes.join(", ")}` });
    revalidatePath("/setari/utilizatori");
    // propriul rol schimbat → meniul se recalculează
    if (m.userId === ctx.user.id) revalidatePath("/", "layout");
    return null;
  }, "Accesul a fost actualizat");
}

/** Revocă accesul unui utilizator la firma curentă (contul rămâne pentru alte firme). */
export async function removeMembershipAction(membershipId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("users");
    const companyId = ctx.company.id;
    const m = await db.query.memberships.findFirst({ where: and(eq(memberships.id, membershipId), eq(memberships.companyId, companyId)), with: { user: true } });
    if (!m) throw new Error("Utilizatorul nu are acces la această firmă.");
    if (m.userId === ctx.user.id) throw new Error("Nu îți poți revoca propriul acces.");
    if (m.role === "owner") {
      assertCanGrant(ctx, "owner");
      if ((await ownersCount(companyId)) <= 1) throw new Error("Nu poți elimina ultimul proprietar al firmei.");
    }
    await db.transaction(async (tx) => {
      await tx.delete(memberships).where(eq(memberships.id, m.id));
      if (m.teamMemberId) await tx.update(teamMembers).set({ userId: null }).where(and(eq(teamMembers.id, m.teamMemberId), eq(teamMembers.companyId, companyId)));
      if (m.user.lastCompanyId === companyId) await tx.update(users).set({ lastCompanyId: null }).where(eq(users.id, m.userId));
    });
    await logActivity(actorFrom(ctx), { entity: "user", entityId: m.userId, action: "removed", message: `Accesul lui ${m.user.name} (${m.user.email}) a fost revocat` });
    revalidatePath("/setari/utilizatori");
    return null;
  }, "Accesul a fost revocat");
}
