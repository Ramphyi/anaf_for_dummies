"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { lookupCompany } from "@/lib/anaf/cui";
import { requireContext, switchCompany } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { logActivity } from "@/lib/server/activity";
import { runAction, zOptText } from "@/lib/server/action";
import { createCompanyWithDefaults } from "@/lib/server/onboarding";
import { isValidCui, isValidIban, normalizeCui } from "@/lib/utils";

/** Interogare ANAF pentru o firmă nouă (disponibilă oricărui utilizator autentificat). */
export async function lookupNewCompanyAction(cui: string) {
  return runAction(async () => {
    await requireContext();
    const r = await lookupCompany(cui);
    if (!r) throw new Error("CUI-ul nu a fost găsit în baza ANAF. Poți completa datele manual.");
    const { raw: _raw, ...rest } = r;
    return rest;
  });
}

const newCompanySchema = z.object({
  name: z.string().trim().min(2, "Denumirea firmei este obligatorie").max(200),
  cui: z
    .string()
    .trim()
    .transform((v) => normalizeCui(v))
    .refine(isValidCui, "CUI invalid (cifra de control nu corespunde)"),
  regCom: zOptText,
  vatPayer: z.boolean(),
  vatOnCollection: z.boolean(),
  address: zOptText,
  city: zOptText,
  county: zOptText,
  postalCode: zOptText,
  email: z.union([z.email("Email invalid"), z.literal("")]).optional().nullable().transform((v) => v || null),
  phone: zOptText,
  iban: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v.replace(/\s/g, "").toUpperCase() : null))
    .refine((v) => !v || isValidIban(v), "IBAN invalid"),
  bank: zOptText,
});

export type NewCompanyFormInput = z.input<typeof newCompanySchema>;

/** Creează o firmă nouă pentru utilizatorul curent (proprietar) și comută pe ea. */
export async function createCompanyAction(input: NewCompanyFormInput) {
  return runAction(async () => {
    const ctx = await requireContext();
    const d = newCompanySchema.parse(input);
    const dup = ctx.companies.find((c) => normalizeCui(c.cui) === d.cui);
    if (dup) throw new Error(`Ai deja acces la ${dup.name} (CUI ${d.cui}). Comută pe ea din lista „Firmele tale”.`);

    const company = await db.transaction(async (tx) => {
      const c = await createCompanyWithDefaults(tx, { userId: ctx.user.id, name: ctx.user.name, email: ctx.user.email }, { ...d, vatOnCollection: d.vatPayer && d.vatOnCollection });
      await tx.update(users).set({ lastCompanyId: c.id }).where(eq(users.id, ctx.user.id));
      return c;
    });
    await logActivity({ companyId: company.id, userId: ctx.user.id, userName: ctx.user.name }, {
      entity: "company",
      entityId: company.id,
      action: "created",
      message: `Firma ${company.name} (CUI ${company.cui}) a fost creată`,
    });
    await switchCompany(company.id);
    revalidatePath("/", "layout");
    return { id: company.id, name: company.name };
  });
}
