"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { lookupCompany } from "@/lib/anaf/cui";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { documents, partners, purchaseInvoices, PARTNER_KINDS, type Partner } from "@/lib/db/schema";
import { actorFrom, logActivity } from "@/lib/server/activity";
import { runAction } from "@/lib/server/action";
import { normalizeCui } from "@/lib/utils";

const partnerSchema = z.object({
  id: z.string().optional().nullable(),
  kind: z.enum(PARTNER_KINDS),
  entityType: z.enum(["pj", "pf"]),
  name: z.string().trim().min(2, "Denumirea este obligatorie"),
  cui: z.string().trim().optional().nullable(),
  regCom: z.string().trim().optional().nullable(),
  vatPayer: z.boolean(),
  address: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  county: z.string().trim().optional().nullable(),
  country: z.string().trim().length(2).default("RO"),
  postalCode: z.string().trim().optional().nullable(),
  email: z.union([z.email("Email invalid"), z.literal("")]).optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  iban: z.string().trim().optional().nullable(),
  bank: z.string().trim().optional().nullable(),
  contactPerson: z.string().trim().optional().nullable(),
  paymentTermDays: z.number().int().min(0).max(365).optional().nullable(),
  defaultCurrency: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  eInvoiceRegistered: z.boolean().optional(),
});

export type PartnerInput = z.input<typeof partnerSchema>;

/** Creează sau actualizează un client/furnizor. Returnează partenerul salvat. */
export async function savePartnerAction(input: PartnerInput) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const d = partnerSchema.parse(input);
    const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
    const values = {
      kind: d.kind,
      entityType: d.entityType,
      name: d.name,
      cui: d.country === "RO" && d.entityType === "pj" ? normalizeCui(d.cui) || null : clean(d.cui),
      regCom: clean(d.regCom),
      vatPayer: d.vatPayer,
      address: clean(d.address),
      city: clean(d.city),
      county: d.country === "RO" ? clean(d.county) : null,
      country: d.country.toUpperCase(),
      postalCode: clean(d.postalCode),
      email: clean(d.email),
      phone: clean(d.phone),
      iban: clean(d.iban)?.replace(/\s/g, "").toUpperCase() ?? null,
      bank: clean(d.bank),
      contactPerson: clean(d.contactPerson),
      paymentTermDays: d.paymentTermDays ?? null,
      defaultCurrency: clean(d.defaultCurrency),
      notes: clean(d.notes),
      eInvoiceRegistered: d.eInvoiceRegistered ?? false,
    };
    let saved: Partner;
    if (d.id) {
      [saved] = await db
        .update(partners)
        .set(values)
        .where(and(eq(partners.id, d.id), eq(partners.companyId, ctx.company.id)))
        .returning();
      if (!saved) throw new Error("Partenerul nu există.");
    } else {
      if (values.cui) {
        const dup = await db.query.partners.findFirst({ where: and(eq(partners.companyId, ctx.company.id), eq(partners.cui, values.cui)) });
        if (dup) {
          // același CUI ca client și furnizor → devine „both”
          if (dup.kind !== values.kind && dup.kind !== "both") {
            [saved] = await db.update(partners).set({ kind: "both" }).where(eq(partners.id, dup.id)).returning();
            return saved;
          }
          throw new Error(`Există deja un partener cu CUI ${values.cui}: ${dup.name}.`);
        }
      }
      [saved] = await db.insert(partners).values({ companyId: ctx.company.id, ...values }).returning();
      await logActivity(actorFrom(ctx), {
        entity: "partner",
        entityId: saved.id,
        action: "created",
        message: `${values.kind === "supplier" ? "Furnizor" : "Client"} nou: ${values.name}`,
      });
    }
    revalidatePath("/clienti");
    revalidatePath("/furnizori");
    return saved;
  }, input.id ? "Datele au fost actualizate" : "Partener adăugat");
}

export async function deletePartnerAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const used =
      (await db.query.documents.findFirst({ where: and(eq(documents.companyId, ctx.company.id), eq(documents.partnerId, id)), columns: { id: true } })) ||
      (await db.query.purchaseInvoices.findFirst({ where: and(eq(purchaseInvoices.companyId, ctx.company.id), eq(purchaseInvoices.supplierId, id)), columns: { id: true } }));
    if (used) {
      await db.update(partners).set({ active: false }).where(and(eq(partners.id, id), eq(partners.companyId, ctx.company.id)));
      revalidatePath("/clienti");
      revalidatePath("/furnizori");
      return { archived: true };
    }
    await db.delete(partners).where(and(eq(partners.id, id), eq(partners.companyId, ctx.company.id)));
    revalidatePath("/clienti");
    revalidatePath("/furnizori");
    return { archived: false };
  });
}

/** Caută datele unei firme la ANAF (registrul TVA) după CUI. */
export async function lookupPartnerCuiAction(cui: string) {
  return runAction(async () => {
    await requirePermission("billing");
    const r = await lookupCompany(cui);
    if (!r) throw new Error("CUI-ul nu a fost găsit în baza ANAF.");
    const { raw: _raw, ...rest } = r;
    return rest;
  });
}
