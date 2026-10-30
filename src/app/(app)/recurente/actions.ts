"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { lineSchema, zOptDate, zOptId } from "@/components/documents/schemas";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { documentSeries, partners, recurringInvoices } from "@/lib/db/schema";
import { actorFrom, logActivity } from "@/lib/server/activity";
import { runAction, zDate, zOptText, zReqText } from "@/lib/server/action";
import { generateFromRecurring } from "@/lib/recurring/server";

const recurringSchema = z
  .object({
    id: zOptId,
    name: zReqText("Denumirea"),
    partnerId: z.string({ error: "Alege clientul" }).min(1, "Alege clientul"),
    seriesId: zOptId,
    frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
    intervalCount: z.number().int().min(1, "Intervalul minim este 1").max(24, "Intervalul maxim este 24"),
    startDate: zDate,
    nextRunDate: zDate,
    endDate: zOptDate,
    dueDays: z.number({ error: "Termen invalid" }).int().min(0).max(365),
    currency: z.string().length(3),
    notes: zOptText,
    autoIssue: z.boolean(),
    autoSendEmail: z.boolean(),
    autoSendEfactura: z.boolean(),
    active: z.boolean(),
    lines: z.array(lineSchema).min(1, "Adaugă cel puțin o linie"),
  })
  .refine((d) => !d.endDate || d.endDate >= d.startDate, { path: ["endDate"], message: "Data de sfârșit trebuie să fie după data de început" });

export type RecurringFormInput = z.input<typeof recurringSchema>;

function revalidateRecurring(id?: string | null) {
  revalidatePath("/recurente");
  if (id) revalidatePath(`/recurente/${id}`);
}

export async function saveRecurringAction(input: RecurringFormInput) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const d = recurringSchema.parse(input);
    const cid = ctx.company.id;
    const partner = await db.query.partners.findFirst({ where: and(eq(partners.id, d.partnerId), eq(partners.companyId, cid)), columns: { id: true, name: true } });
    if (!partner) throw new Error("Clientul selectat nu există.");
    if (d.seriesId) {
      const s = await db.query.documentSeries.findFirst({ where: and(eq(documentSeries.id, d.seriesId), eq(documentSeries.companyId, cid), eq(documentSeries.type, "invoice")) });
      if (!s) throw new Error("Seria selectată nu există.");
    }
    const values = {
      name: d.name,
      partnerId: d.partnerId,
      seriesId: d.seriesId,
      frequency: d.frequency,
      intervalCount: d.intervalCount,
      startDate: d.startDate,
      nextRunDate: d.nextRunDate,
      endDate: d.endDate,
      dueDays: d.dueDays,
      currency: d.currency,
      notes: d.notes,
      autoIssue: d.autoIssue,
      autoSendEmail: d.autoIssue && d.autoSendEmail,
      autoSendEfactura: d.autoIssue && d.autoSendEfactura,
      active: d.active,
      lines: d.lines.map((l) => ({ ...l, vatRate: l.vatCategory === "S" ? l.vatRate : 0 })),
    };
    let id = d.id;
    if (id) {
      const [u] = await db
        .update(recurringInvoices)
        .set(values)
        .where(and(eq(recurringInvoices.id, id), eq(recurringInvoices.companyId, cid)))
        .returning({ id: recurringInvoices.id });
      if (!u) throw new Error("Șablonul nu există.");
    } else {
      const [c] = await db.insert(recurringInvoices).values({ companyId: cid, ...values }).returning({ id: recurringInvoices.id });
      id = c.id;
      await logActivity(actorFrom(ctx), { entity: "recurring", entityId: id, action: "created", message: `Șablon recurent „${d.name}” creat pentru ${partner.name}` });
    }
    revalidateRecurring(id);
    return { id };
  }, "Șablonul a fost salvat");
}

export async function toggleRecurringAction(id: string, active: boolean) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    await db.update(recurringInvoices).set({ active }).where(and(eq(recurringInvoices.id, id), eq(recurringInvoices.companyId, ctx.company.id)));
    revalidateRecurring(id);
    return null;
  }, active ? "Șablon activat" : "Șablon pus pe pauză");
}

export async function deleteRecurringAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const r = await db.query.recurringInvoices.findFirst({ where: and(eq(recurringInvoices.id, id), eq(recurringInvoices.companyId, ctx.company.id)), columns: { name: true } });
    if (!r) throw new Error("Șablonul nu există.");
    await db.delete(recurringInvoices).where(eq(recurringInvoices.id, id));
    await logActivity(actorFrom(ctx), { entity: "recurring", entityId: id, action: "deleted", message: `Șablonul recurent „${r.name}” a fost șters` });
    revalidateRecurring();
    return null;
  }, "Șablonul a fost șters");
}

export async function generateRecurringNowAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const r = await generateFromRecurring(actorFrom(ctx), id);
    revalidateRecurring(id);
    revalidatePath("/facturi");
    revalidatePath("/", "layout");
    return r;
  });
}
