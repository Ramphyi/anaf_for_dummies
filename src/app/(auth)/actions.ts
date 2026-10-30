"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { lookupCompany } from "@/lib/anaf/cui";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { memberships, users } from "@/lib/db/schema";
import { runAction } from "@/lib/server/action";
import { createCompanyWithDefaults } from "@/lib/server/onboarding";
import { PALETTE } from "@/lib/constants";
import { isValidCui } from "@/lib/utils";

export type AuthState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

export async function loginAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");
  if (!email || !password) return { error: "Completează emailul și parola." };
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || !(await verifyPassword(password, user.passwordHash))) return { error: "Email sau parolă incorecte." };
  const m = await db.query.memberships.findMany({ where: eq(memberships.userId, user.id) });
  const companyId = m.find((x) => x.companyId === user.lastCompanyId)?.companyId ?? m[0]?.companyId;
  if (!companyId) return { error: "Contul nu este asociat niciunei firme." };
  await createSession(user.id, companyId);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

const registerSchema = z.object({
  name: z.string().trim().min(2, "Numele este prea scurt"),
  email: z.email("Email invalid").transform((v) => v.toLowerCase()),
  password: z.string().min(8, "Parola trebuie să aibă minim 8 caractere"),
  companyName: z.string().trim().min(2, "Denumirea firmei este obligatorie"),
  cui: z.string().trim().refine(isValidCui, "CUI invalid (cifra de control nu corespunde)"),
  regCom: z.string().trim().optional(),
  // Adresa completă a furnizorului e obligatorie pe factură și în e-Factura (CIUS-RO).
  address: z.string().trim().min(3, "Adresa este obligatorie"),
  city: z.string().trim().min(2, "Localitatea este obligatorie"),
  county: z.string().trim().min(1, "Alege județul"),
  vatPayer: z.string().optional(),
});

export async function registerAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: "Verifică datele introduse.", fieldErrors };
  }
  const d = parsed.data;
  const exists = await db.query.users.findFirst({ where: eq(users.email, d.email) });
  if (exists) return { error: "Există deja un cont cu acest email.", fieldErrors: { email: "Email deja folosit" } };

  const { userId, companyId } = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email: d.email,
        name: d.name,
        passwordHash: await hashPassword(d.password),
        avatarColor: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      })
      .returning();
    const company = await createCompanyWithDefaults(
      tx,
      { userId: user.id, name: d.name, email: d.email },
      {
        name: d.companyName,
        cui: d.cui,
        regCom: d.regCom || null,
        address: d.address,
        city: d.city,
        county: d.county,
        vatPayer: d.vatPayer === "on" || d.vatPayer === "true",
      },
    );
    await tx.update(users).set({ lastCompanyId: company.id }).where(eq(users.id, user.id));
    return { userId: user.id, companyId: company.id };
  });
  await createSession(userId, companyId);
  redirect("/dashboard?welcome=1");
}

/** Interogare publică ANAF după CUI — folosită la înregistrare și la adăugarea clienților. */
export async function lookupCuiAction(cui: string) {
  return runAction(async () => {
    const r = await lookupCompany(cui);
    if (!r) throw new Error("CUI-ul nu a fost găsit în baza ANAF.");
    const { raw: _raw, ...rest } = r;
    return rest;
  });
}
