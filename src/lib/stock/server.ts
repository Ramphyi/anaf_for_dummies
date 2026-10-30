import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type DbOrTx, type Tx } from "@/lib/db";
import { documents, products, stockDocuments, stockMovements, warehouses, type StockDocType } from "@/lib/db/schema";
import { STOCK_DOC_LABELS } from "@/lib/constants";
import { round2 } from "@/lib/utils";
import type { Actor } from "@/lib/server/activity";

export async function getDefaultWarehouse(companyId: string, tx: DbOrTx = db) {
  const all = await tx.query.warehouses.findMany({ where: eq(warehouses.companyId, companyId) });
  const w = all.find((x) => x.isDefault) ?? all[0];
  if (w) return w;
  const [created] = await tx.insert(warehouses).values({ companyId, name: "Depozit principal", code: "DEP1", isDefault: true }).returning();
  return created;
}

/** Următorul număr din seria tipului (max sufix numeric + 1 — sigur și când există goluri sau importuri). */
async function nextStockNumber(tx: DbOrTx, companyId: string, type: StockDocType) {
  const prefix = `${STOCK_DOC_LABELS[type].short}-`;
  const [row] = await tx
    .select({ max: sql<number>`coalesce(max(cast(substr(${stockDocuments.number}, ${prefix.length + 1}) as integer)), 0)` })
    .from(stockDocuments)
    .where(and(eq(stockDocuments.companyId, companyId), eq(stockDocuments.type, type), sql`${stockDocuments.number} like ${prefix + "%"}`));
  return `${prefix}${String((row?.max ?? 0) + 1).padStart(5, "0")}`;
}

export type StockLineInput = { productId: string; quantity: number; unitCost?: number };

/**
 * Creează un document de stoc și mișcările aferente.
 * - nir / sale_return / opening: cantități pozitive → intrări
 * - consumption / sale: cantități pozitive → ieșiri (se salvează negativ)
 * - transfer: ieșire din warehouseId, intrare în targetWarehouseId
 * - inventory: `quantity` = diferența (pozitivă sau negativă) față de stocul scriptic
 */
export async function createStockDocument(
  tx: Tx,
  actor: Actor,
  input: {
    type: StockDocType;
    date: string;
    warehouseId: string;
    targetWarehouseId?: string | null;
    partnerId?: string | null;
    purchaseInvoiceId?: string | null;
    documentId?: string | null;
    number?: string;
    notes?: string | null;
    lines: StockLineInput[];
  },
) {
  const number = input.number ?? (await nextStockNumber(tx, actor.companyId, input.type));
  const [doc] = await tx
    .insert(stockDocuments)
    .values({
      companyId: actor.companyId,
      type: input.type,
      number,
      date: input.date,
      warehouseId: input.warehouseId,
      targetWarehouseId: input.targetWarehouseId ?? null,
      partnerId: input.partnerId ?? null,
      purchaseInvoiceId: input.purchaseInvoiceId ?? null,
      documentId: input.documentId ?? null,
      notes: input.notes ?? null,
      createdBy: actor.userId ?? null,
    })
    .returning();
  const sign = STOCK_DOC_LABELS[input.type].sign;
  const rows = input.lines.flatMap((l) => {
    const base = { companyId: actor.companyId, stockDocumentId: doc.id, productId: l.productId, unitCost: l.unitCost ?? 0, date: input.date };
    if (input.type === "transfer") {
      if (!input.targetWarehouseId) throw new Error("Transferul necesită gestiunea destinație.");
      return [
        { ...base, warehouseId: input.warehouseId, quantity: -Math.abs(l.quantity) },
        { ...base, warehouseId: input.targetWarehouseId, quantity: Math.abs(l.quantity) },
      ];
    }
    const quantity = sign === 0 ? l.quantity : sign * Math.abs(l.quantity);
    return [{ ...base, warehouseId: input.warehouseId, quantity }];
  });
  if (rows.length) await tx.insert(stockMovements).values(rows);
  return doc;
}

/** Descarcă din gestiune produsele cu stoc urmărit de pe un document emis (factură/aviz). */
export async function applySaleStock(tx: Tx, actor: Actor, documentId: string) {
  const doc = await tx.query.documents.findFirst({ where: eq(documents.id, documentId), with: { lines: true } });
  if (!doc) return;
  const productIds = doc.lines.map((l) => l.productId).filter((x): x is string => !!x);
  if (!productIds.length) return;
  const tracked = await tx.query.products.findMany({
    where: and(inArray(products.id, productIds), eq(products.trackStock, true)),
  });
  if (!tracked.length) return;
  const costOf = new Map(tracked.map((p) => [p.id, p.purchasePrice ?? 0]));
  const lines = doc.lines.filter((l) => l.productId && costOf.has(l.productId));
  const outs = lines.filter((l) => l.quantity > 0);
  const ins = lines.filter((l) => l.quantity < 0);
  const warehouseId = doc.warehouseId ?? (await getDefaultWarehouse(actor.companyId, tx)).id;
  if (outs.length) {
    await createStockDocument(tx, actor, {
      type: "sale",
      date: doc.issueDate,
      warehouseId,
      partnerId: doc.partnerId,
      documentId: doc.id,
      notes: `Descărcare automată ${doc.fullNumber}`,
      lines: outs.map((l) => ({ productId: l.productId!, quantity: l.quantity, unitCost: costOf.get(l.productId!) })),
    });
  }
  if (ins.length) {
    await createStockDocument(tx, actor, {
      type: "sale_return",
      date: doc.issueDate,
      warehouseId,
      partnerId: doc.partnerId,
      documentId: doc.id,
      notes: `Retur automat ${doc.fullNumber}`,
      lines: ins.map((l) => ({ productId: l.productId!, quantity: Math.abs(l.quantity), unitCost: costOf.get(l.productId!) })),
    });
  }
}

/** Anulează mișcările de stoc generate automat de un document (la anulare / editare). */
export async function revertSaleStock(tx: Tx, _actor: Actor, documentId: string) {
  const docs = await tx.query.stockDocuments.findMany({
    where: and(eq(stockDocuments.documentId, documentId), inArray(stockDocuments.type, ["sale", "sale_return"])),
  });
  if (!docs.length) return;
  const ids = docs.map((d) => d.id);
  await tx.delete(stockMovements).where(inArray(stockMovements.stockDocumentId, ids));
  await tx.delete(stockDocuments).where(inArray(stockDocuments.id, ids));
}

export type StockLevel = {
  productId: string;
  warehouseId: string;
  quantity: number;
  value: number; // cost mediu ponderat × cantitate
  avgCost: number;
};

/** Stocul curent pe produs × gestiune (cost mediu ponderat din intrări). */
export async function getStockLevels(companyId: string, opts?: { warehouseId?: string; productId?: string; upToDate?: string }) {
  const conds = [eq(stockMovements.companyId, companyId)];
  if (opts?.warehouseId) conds.push(eq(stockMovements.warehouseId, opts.warehouseId));
  if (opts?.productId) conds.push(eq(stockMovements.productId, opts.productId));
  if (opts?.upToDate) conds.push(sql`${stockMovements.date} <= ${opts.upToDate}`);
  const rows = await db
    .select({
      productId: stockMovements.productId,
      warehouseId: stockMovements.warehouseId,
      quantity: sql<number>`sum(${stockMovements.quantity})`,
      inQty: sql<number>`sum(case when ${stockMovements.quantity} > 0 then ${stockMovements.quantity} else 0 end)`,
      inValue: sql<number>`sum(case when ${stockMovements.quantity} > 0 then ${stockMovements.quantity} * ${stockMovements.unitCost} else 0 end)`,
    })
    .from(stockMovements)
    .where(and(...conds))
    .groupBy(stockMovements.productId, stockMovements.warehouseId);
  return rows.map<StockLevel>((r) => {
    const avgCost = r.inQty > 0 ? r.inValue / r.inQty : 0;
    return {
      productId: r.productId,
      warehouseId: r.warehouseId,
      quantity: round2(r.quantity),
      avgCost: round2(avgCost),
      value: round2(r.quantity * avgCost),
    };
  });
}
