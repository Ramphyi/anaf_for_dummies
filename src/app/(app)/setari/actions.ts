"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { lookupCompany } from "@/lib/anaf/cui";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { CURRENCIES, VAT_RATES } from "@/lib/constants";
import { todayIso } from "@/lib/format";
import { actorFrom, logActivity } from "@/lib/server/activity";
import { runAction, zOptText } from "@/lib/server/action";
import { isValidCui, isValidIban, normalizeCui } from "@/lib/utils";
import { allDataZip, invoicesCsv } from "./export-data";

const MAX_LOGO_CHARS = 420_000; // ≈ 300 KB în base64

const companySchema = z.object({
  name: z.string().trim().min(2, "Denumirea firmei este obligatorie"),
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
  iban: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v.replace(/\s/g, "").toUpperCase() : null))
    .refine((v) => !v || isValidIban(v), "IBAN invalid (verifică cifrele de control)"),
  bank: zOptText,
  email: z.union([z.email("Email invalid"), z.literal("")]).optional().nullable().transform((v) => v || null),
  phone: zOptText,
  website: zOptText,
  shareCapital: zOptText,
  logoDataUrl: z
    .string()
    .max(MAX_LOGO_CHARS, "Logo-ul depășește 300 KB")
    .regex(/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/, "Format de imagine neacceptat")
    .nullable()
    .optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Culoare invalidă"),
  defaultCurrency: z.enum(CURRENCIES),
  defaultVatRate: z.number().refine((v) => VAT_RATES.some((r) => r.value === v), "Cotă TVA invalidă"),
  defaultDueDays: z.number().int("Număr întreg").min(0, "Minim 0 zile").max(365, "Maxim 365 de zile"),
  invoiceFooter: z.string().trim().max(1000, "Maxim 1000 de caractere").optional().nullable().transform((v) => v || null),
});

export type CompanySettingsInput = z.input<typeof companySchema>;

export async function saveCompanyAction(input: CompanySettingsInput) {
  return runAction(async () => {
    const ctx = await requirePermission("settings");
    const d = companySchema.parse(input);
    await db
      .update(companies)
      .set({ ...d, vatOnCollection: d.vatPayer && d.vatOnCollection, logoDataUrl: d.logoDataUrl ?? null })
      .where(eq(companies.id, ctx.company.id));
    const changed: string[] = [];
    if (d.name !== ctx.company.name) changed.push(`denumire: ${d.name}`);
    if (d.cui !== ctx.company.cui) changed.push(`CUI: ${d.cui}`);
    if (d.vatPayer !== ctx.company.vatPayer) changed.push(d.vatPayer ? "plătitor de TVA" : "neplătitor de TVA");
    if (d.vatOnCollection !== ctx.company.vatOnCollection) changed.push(d.vatOnCollection ? "TVA la încasare activat" : "TVA la încasare dezactivat");
    await logActivity(actorFrom(ctx), {
      entity: "company",
      entityId: ctx.company.id,
      action: "updated",
      message: `Datele firmei au fost actualizate${changed.length ? ` (${changed.join(", ")})` : ""}`,
    });
    revalidatePath("/", "layout");
    return null;
  }, "Datele firmei au fost salvate");
}

/** Preia datele firmei curente din registrul ANAF. */
export async function lookupCompanyCuiAction(cui: string) {
  return runAction(async () => {
    await requirePermission("settings");
    const r = await lookupCompany(cui);
    if (!r) throw new Error("CUI-ul nu a fost găsit în baza ANAF.");
    const { raw: _raw, ...rest } = r;
    return rest;
  });
}

export async function exportInvoicesCsvAction() {
  return runAction(async () => {
    const ctx = await requirePermission("settings");
    const csv = await invoicesCsv(ctx.company.id);
    await logActivity(actorFrom(ctx), { entity: "company", entityId: ctx.company.id, action: "exported", message: "Export CSV cu toate facturile" });
    return { filename: `facturi-${normalizeCui(ctx.company.cui)}-${todayIso()}.csv`, csv };
  });
}

export async function exportAllDataAction() {
  return runAction(async () => {
    const ctx = await requirePermission("settings");
    const base64 = await allDataZip(ctx.company.id);
    await logActivity(actorFrom(ctx), { entity: "company", entityId: ctx.company.id, action: "exported", message: "Export complet al datelor (ZIP cu CSV-uri)" });
    return { filename: `anaf-for-dummies-${normalizeCui(ctx.company.cui)}-${todayIso()}.zip`, base64 };
  });
}
