"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { documentLines, documents, products, purchaseLines, purchaseInvoices, stockMovements, type Product } from "@/lib/db/schema";
import { priceWithoutVat } from "@/lib/documents/totals";
import { actorFrom, logActivity } from "@/lib/server/activity";
import { runAction } from "@/lib/server/action";
import { round } from "@/lib/utils";
import { productSchema, type ProductInput } from "./schema";

function revalidateCatalog() {
  revalidatePath("/produse");
  revalidatePath("/stocuri");
}

/**
 * Creează sau actualizează un produs/serviciu.
 * `price` se salvează mereu FĂRĂ TVA; dacă `priceIncludesVat` e bifat, prețul introdus
 * (cu TVA) se convertește, iar flag-ul rămâne doar ca preferință de afișare în formular.
 */
export async function saveProductAction(input: ProductInput) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const d = productSchema.parse(input);
    const companyId = ctx.company.id;
    const effectiveRate = d.vatCategory === "S" ? d.vatRate : 0;
    const netPrice = d.priceIncludesVat ? priceWithoutVat(d.price, effectiveRate) : round(d.price, 4);

    if (d.code) {
      const dup = await db.query.products.findFirst({
        where: and(eq(products.companyId, companyId), eq(products.code, d.code), d.id ? ne(products.id, d.id) : undefined),
        columns: { id: true, name: true },
      });
      if (dup) throw new Error(`Codul ${d.code} este folosit deja de „${dup.name}”.`);
    }

    const values = {
      code: d.code,
      name: d.name,
      description: d.description,
      type: d.type,
      unit: d.unit,
      price: netPrice,
      currency: d.currency,
      vatRate: d.vatRate,
      vatCategory: d.vatCategory,
      priceIncludesVat: d.priceIncludesVat,
      // serviciile nu au stoc
      trackStock: d.type === "product" ? d.trackStock : false,
      purchasePrice: d.purchasePrice ?? null,
      ncCode: d.ncCode,
      barcode: d.barcode,
      category: d.category,
      active: d.active,
    };

    let saved: Product;
    if (d.id) {
      [saved] = await db
        .update(products)
        .set(values)
        .where(and(eq(products.id, d.id), eq(products.companyId, companyId)))
        .returning();
      if (!saved) throw new Error("Produsul nu există.");
    } else {
      [saved] = await db.insert(products).values({ companyId, ...values }).returning();
      await logActivity(actorFrom(ctx), {
        entity: "product",
        entityId: saved.id,
        action: "created",
        message: `${values.type === "service" ? "Serviciu" : "Produs"} nou: ${values.name}`,
      });
    }
    revalidateCatalog();
    return saved;
  }, input.id ? "Produsul a fost actualizat" : "Produs adăugat");
}

/** Verifică dacă un produs apare pe documente (facturi, cheltuieli, mișcări de stoc). */
async function isProductUsed(companyId: string, productId: string) {
  const [onDocs] = await db
    .select({ id: documentLines.id })
    .from(documentLines)
    .innerJoin(documents, eq(documents.id, documentLines.documentId))
    .where(and(eq(documents.companyId, companyId), eq(documentLines.productId, productId)))
    .limit(1);
  if (onDocs) return true;
  const [onPurchases] = await db
    .select({ id: purchaseLines.id })
    .from(purchaseLines)
    .innerJoin(purchaseInvoices, eq(purchaseInvoices.id, purchaseLines.purchaseInvoiceId))
    .where(and(eq(purchaseInvoices.companyId, companyId), eq(purchaseLines.productId, productId)))
    .limit(1);
  if (onPurchases) return true;
  const mov = await db.query.stockMovements.findFirst({
    where: and(eq(stockMovements.companyId, companyId), eq(stockMovements.productId, productId)),
    columns: { id: true },
  });
  return !!mov;
}

/** Șterge produsul; dacă a fost folosit pe documente, doar îl dezactivează (istoricul rămâne intact). */
export async function deleteProductAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const product = await db.query.products.findFirst({ where: and(eq(products.id, id), eq(products.companyId, ctx.company.id)) });
    if (!product) throw new Error("Produsul nu există.");
    if (await isProductUsed(ctx.company.id, id)) {
      await db.update(products).set({ active: false }).where(eq(products.id, id));
      revalidateCatalog();
      return { archived: true };
    }
    await db.delete(products).where(eq(products.id, id));
    await logActivity(actorFrom(ctx), { entity: "product", entityId: id, action: "deleted", message: `Produs șters: ${product.name}` });
    revalidateCatalog();
    return { archived: false };
  });
}

export async function setProductActiveAction(id: string, active: boolean) {
  return runAction(
    async () => {
      const ctx = await requirePermission("billing");
      const [p] = await db
        .update(products)
        .set({ active })
        .where(and(eq(products.id, id), eq(products.companyId, ctx.company.id)))
        .returning({ id: products.id });
      if (!p) throw new Error("Produsul nu există.");
      revalidateCatalog();
      return p;
    },
    active ? "Produs reactivat" : "Produs dezactivat",
  );
}
