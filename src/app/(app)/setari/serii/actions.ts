"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { db, type DbOrTx } from "@/lib/db";
import { DOCUMENT_TYPES, documentSeries, documents, payments, type DocumentSeriesType } from "@/lib/db/schema";
import { actorFrom, logActivity } from "@/lib/server/activity";
import { runAction } from "@/lib/server/action";

const TYPE_LABELS: Record<DocumentSeriesType, string> = { invoice: "facturi", proforma: "proforme", notice: "avize", receipt: "chitanțe" };

const seriesSchema = z.object({
  id: z.string().optional().nullable(),
  type: z.enum(DOCUMENT_TYPES),
  prefix: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(
      z
        .string()
        .min(1, "Prefixul este obligatoriu")
        .max(12, "Maxim 12 caractere")
        .regex(/^[A-Z0-9-]+$/, "Doar litere (fără diacritice), cifre și cratimă")
        .refine((v) => v !== "CIORNA", "Prefix rezervat"),
    ),
  nextNumber: z.coerce.number().int("Număr întreg").min(1, "Minim 1").max(99_999_999, "Număr prea mare"),
  padding: z.coerce.number().int().min(0).max(10),
  isDefault: z.boolean(),
  active: z.boolean(),
});

export type SeriesInput = z.input<typeof seriesSchema>;

/** Cel mai mare număr deja folosit cu un prefix (documente sau chitanțe). */
async function maxUsedNumber(tx: DbOrTx, companyId: string, type: DocumentSeriesType, prefix: string) {
  if (type === "receipt") {
    const [r] = await tx
      .select({ max: sql<number>`coalesce(max(${payments.receiptNumber}), 0)` })
      .from(payments)
      .where(and(eq(payments.companyId, companyId), eq(payments.receiptSeries, prefix)));
    return Number(r?.max ?? 0);
  }
  const [r] = await tx
    .select({ max: sql<number>`coalesce(max(${documents.number}), 0)` })
    .from(documents)
    .where(
      and(
        eq(documents.companyId, companyId),
        eq(documents.kind, type),
        eq(documents.series, prefix),
      ),
    );
  return Number(r?.max ?? 0);
}

export async function saveSeriesAction(input: SeriesInput) {
  return runAction(async () => {
    const ctx = await requirePermission("settings");
    const d = seriesSchema.parse(input);
    const companyId = ctx.company.id;

    const saved = await db.transaction(async (tx) => {
      const existing = d.id
        ? await tx.query.documentSeries.findFirst({ where: and(eq(documentSeries.id, d.id), eq(documentSeries.companyId, companyId)) })
        : null;
      if (d.id && !existing) throw new Error("Seria nu există.");
      if (existing && existing.type !== d.type) throw new Error("Tipul unei serii existente nu poate fi schimbat.");

      const dup = await tx.query.documentSeries.findFirst({
        where: and(eq(documentSeries.companyId, companyId), eq(documentSeries.type, d.type), eq(documentSeries.prefix, d.prefix), d.id ? ne(documentSeries.id, d.id) : undefined),
      });
      if (dup) throw new Error(`Există deja o serie de ${TYPE_LABELS[d.type]} cu prefixul ${d.prefix}.`);

      const used = await maxUsedNumber(tx, companyId, d.type, d.prefix);
      if (d.nextNumber <= used) {
        throw new Error(`Numărul ${used} a fost deja folosit în seria ${d.prefix}. Următorul număr trebuie să fie cel puțin ${used + 1}, ca numerotarea să rămână continuă.`);
      }

      if (existing?.isDefault && !d.isDefault) throw new Error("Alege altă serie ca implicită; seria implicită nu poate rămâne fără înlocuitor.");
      if (d.isDefault && !d.active) throw new Error("Seria implicită trebuie să fie activă.");

      if (d.isDefault) {
        await tx
          .update(documentSeries)
          .set({ isDefault: false })
          .where(and(eq(documentSeries.companyId, companyId), eq(documentSeries.type, d.type)));
      }
      const values = { prefix: d.prefix, nextNumber: d.nextNumber, padding: d.padding, isDefault: d.isDefault, active: d.active };
      if (existing) {
        const [row] = await tx.update(documentSeries).set(values).where(eq(documentSeries.id, existing.id)).returning();
        return { row, created: false, prev: existing };
      }
      // prima serie de acest tip devine automat implicită
      const any = await tx.query.documentSeries.findFirst({ where: and(eq(documentSeries.companyId, companyId), eq(documentSeries.type, d.type)) });
      const [row] = await tx
        .insert(documentSeries)
        .values({ companyId, type: d.type, ...values, isDefault: d.isDefault || !any })
        .returning();
      return { row, created: true, prev: null };
    });

    const r = saved.row;
    const preview = `${r.prefix}${String(r.nextNumber).padStart(r.padding, "0")}`;
    await logActivity(actorFrom(ctx), {
      entity: "series",
      entityId: r.id,
      action: saved.created ? "created" : "updated",
      message: saved.created
        ? `Serie nouă de ${TYPE_LABELS[r.type]}: ${r.prefix} (următorul număr ${preview})`
        : `Seria ${saved.prev!.prefix === r.prefix ? r.prefix : `${saved.prev!.prefix} → ${r.prefix}`} actualizată (următorul număr ${preview})`,
    });
    revalidatePath("/setari/serii");
    return r;
  }, input.id ? "Seria a fost actualizată" : "Seria a fost adăugată");
}

export async function deleteSeriesAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("settings");
    const s = await db.query.documentSeries.findFirst({ where: and(eq(documentSeries.id, id), eq(documentSeries.companyId, ctx.company.id)) });
    if (!s) throw new Error("Seria nu există.");
    if (s.isDefault) throw new Error("Seria implicită nu poate fi ștearsă. Setează întâi altă serie ca implicită.");
    const used = await maxUsedNumber(db, ctx.company.id, s.type, s.prefix);
    const linked = s.type !== "receipt" && (await db.query.documents.findFirst({ where: eq(documents.seriesId, s.id), columns: { id: true } }));
    if (used > 0 || linked) throw new Error("Seria are documente emise și nu poate fi ștearsă — o poți dezactiva.");
    await db.delete(documentSeries).where(eq(documentSeries.id, s.id));
    await logActivity(actorFrom(ctx), { entity: "series", entityId: s.id, action: "deleted", message: `Seria ${s.prefix} (${TYPE_LABELS[s.type]}) a fost ștearsă` });
    revalidatePath("/setari/serii");
    return null;
  }, "Seria a fost ștearsă");
}
