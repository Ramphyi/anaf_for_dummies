import "server-only";
import { and, asc, eq, inArray, like, or } from "drizzle-orm";
import { db, type DbOrTx } from "@/lib/db";
import { products, purchaseInvoices, stockDocuments, stockMovements, warehouses, type StockDocType } from "@/lib/db/schema";
import { STOCK_DOC_LABELS } from "@/lib/constants";
import { createStockDocument, getStockLevels, type StockLineInput } from "@/lib/stock/server";
import { logActivity, type Actor } from "@/lib/server/activity";
import { round2 } from "@/lib/utils";

/**
 * Următorul număr liber pentru un tip de document de stoc (max + 1, nu count + 1),
 * ca să nu apară dubluri după ștergeri sau importuri.
 */
export async function nextStockDocNumber(tx: DbOrTx, companyId: string, type: StockDocType) {
  const prefix = STOCK_DOC_LABELS[type].short;
  const rows = await tx
    .select({ number: stockDocuments.number })
    .from(stockDocuments)
    .where(and(eq(stockDocuments.companyId, companyId), eq(stockDocuments.type, type), like(stockDocuments.number, `${prefix}-%`)));
  const max = rows.reduce((m, r) => Math.max(m, Number(r.number.slice(prefix.length + 1)) || 0), 0);
  return `${prefix}-${String(max + 1).padStart(5, "0")}`;
}

async function assertWarehouse(tx: DbOrTx, companyId: string, id: string) {
  const w = await tx.query.warehouses.findFirst({ where: and(eq(warehouses.id, id), eq(warehouses.companyId, companyId)) });
  if (!w) throw new Error("Gestiunea nu există.");
  return w;
}

/** Încarcă produsele și verifică faptul că au gestiune de stoc activată. */
export async function trackedProducts(tx: DbOrTx, companyId: string, ids: string[]) {
  if (!ids.length) return new Map<string, typeof products.$inferSelect>();
  const rows = await tx.query.products.findMany({ where: and(eq(products.companyId, companyId), inArray(products.id, ids)) });
  const map = new Map(rows.map((p) => [p.id, p]));
  for (const id of ids) {
    const p = map.get(id);
    if (!p) throw new Error("Unul dintre produse nu există.");
    if (!p.trackStock) throw new Error(`„${p.name}” nu are gestiune de stoc activată.`);
  }
  return map;
}

export type ManualStockInput = {
  type: Extract<StockDocType, "nir" | "consumption" | "transfer" | "opening">;
  date: string;
  warehouseId: string;
  targetWarehouseId?: string | null;
  partnerId?: string | null;
  notes?: string | null;
  lines: { productId: string; quantity: number; unitCost?: number | null }[];
};

/**
 * Creează un NIR / bon de consum / transfer manual.
 * Ieșirile se valorizează la costul mediu ponderat al gestiunii sursă; se blochează stocul negativ.
 */
export async function createManualStockDocument(actor: Actor, input: ManualStockInput) {
  if (!input.lines.length) throw new Error("Adaugă cel puțin un produs.");
  if (input.type === "transfer") {
    if (!input.targetWarehouseId) throw new Error("Alege gestiunea destinație.");
    if (input.targetWarehouseId === input.warehouseId) throw new Error("Gestiunea sursă și destinație trebuie să fie diferite.");
  }
  // linii duplicate → le cumulăm
  const merged = new Map<string, { productId: string; quantity: number; unitCost?: number | null }>();
  for (const l of input.lines) {
    if (!(l.quantity > 0)) throw new Error("Cantitățile trebuie să fie pozitive.");
    const prev = merged.get(l.productId);
    if (prev) prev.quantity = round2(prev.quantity + l.quantity);
    else merged.set(l.productId, { ...l });
  }
  const lines = [...merged.values()];

  return db.transaction(async (tx) => {
    await assertWarehouse(tx, actor.companyId, input.warehouseId);
    if (input.targetWarehouseId) await assertWarehouse(tx, actor.companyId, input.targetWarehouseId);
    const prods = await trackedProducts(tx, actor.companyId, lines.map((l) => l.productId));

    let stockLines: StockLineInput[];
    if (input.type === "consumption" || input.type === "transfer") {
      const levels = await getStockLevels(actor.companyId, { warehouseId: input.warehouseId });
      const byProduct = new Map(levels.map((l) => [l.productId, l]));
      stockLines = lines.map((l) => {
        const lvl = byProduct.get(l.productId);
        const available = lvl?.quantity ?? 0;
        const p = prods.get(l.productId)!;
        if (l.quantity > available + 1e-9) {
          throw new Error(`Stoc insuficient pentru „${p.name}”: disponibil ${available} ${p.unit}, solicitat ${l.quantity}.`);
        }
        return { productId: l.productId, quantity: l.quantity, unitCost: lvl?.avgCost || p.purchasePrice || 0 };
      });
    } else {
      stockLines = lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        unitCost: round2(l.unitCost ?? prods.get(l.productId)?.purchasePrice ?? 0),
      }));
    }

    const number = await nextStockDocNumber(tx, actor.companyId, input.type);
    const doc = await createStockDocument(tx, actor, {
      type: input.type,
      date: input.date,
      warehouseId: input.warehouseId,
      targetWarehouseId: input.type === "transfer" ? input.targetWarehouseId : null,
      partnerId: input.type === "nir" ? (input.partnerId ?? null) : null,
      notes: input.notes ?? null,
      number,
      lines: stockLines,
    });
    await logActivity(
      actor,
      { entity: "stock", entityId: doc.id, action: "created", message: `${STOCK_DOC_LABELS[input.type].label} ${number} (${stockLines.length} produse)` },
      tx,
    );
    return doc;
  });
}

/**
 * Inventar: pentru fiecare produs se primește cantitatea faptică; se salvează diferența față de scriptic.
 * Produsele fără diferență nu generează mișcări.
 */
export async function createInventory(
  actor: Actor,
  input: { date: string; warehouseId: string; notes?: string | null; counts: { productId: string; counted: number }[] },
) {
  return db.transaction(async (tx) => {
    await assertWarehouse(tx, actor.companyId, input.warehouseId);
    const prods = await trackedProducts(tx, actor.companyId, input.counts.map((c) => c.productId));
    const levels = await getStockLevels(actor.companyId, { warehouseId: input.warehouseId, upToDate: input.date });
    const byProduct = new Map(levels.map((l) => [l.productId, l]));
    const lines: StockLineInput[] = [];
    for (const c of input.counts) {
      if (c.counted < 0) throw new Error("Cantitatea faptică nu poate fi negativă.");
      const lvl = byProduct.get(c.productId);
      const delta = round2(c.counted - (lvl?.quantity ?? 0));
      if (Math.abs(delta) < 0.005) continue;
      lines.push({ productId: c.productId, quantity: delta, unitCost: lvl?.avgCost || prods.get(c.productId)?.purchasePrice || 0 });
    }
    if (!lines.length) throw new Error("Nu există diferențe între stocul faptic și cel scriptic.");
    const number = await nextStockDocNumber(tx, actor.companyId, "inventory");
    const doc = await createStockDocument(tx, actor, {
      type: "inventory",
      date: input.date,
      warehouseId: input.warehouseId,
      notes: input.notes ?? null,
      number,
      lines,
    });
    await logActivity(actor, { entity: "stock", entityId: doc.id, action: "created", message: `Inventar ${number}: ${lines.length} diferențe înregistrate` }, tx);
    return { doc, differences: lines.length };
  });
}

/** Șterge un document de stoc introdus manual (nu și pe cele generate automat de facturi). */
export async function deleteStockDocument(actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const doc = await tx.query.stockDocuments.findFirst({ where: and(eq(stockDocuments.id, id), eq(stockDocuments.companyId, actor.companyId)) });
    if (!doc) throw new Error("Documentul nu există.");
    if (doc.type === "sale" || doc.type === "sale_return") {
      throw new Error("Documentele generate automat din facturi se anulează din factura respectivă.");
    }
    await tx.delete(stockMovements).where(eq(stockMovements.stockDocumentId, id));
    await tx.delete(stockDocuments).where(eq(stockDocuments.id, id));
    if (doc.purchaseInvoiceId) {
      await tx.update(purchaseInvoices).set({ stockReceived: false }).where(eq(purchaseInvoices.id, doc.purchaseInvoiceId));
    }
    await logActivity(actor, { entity: "stock", entityId: id, action: "deleted", message: `${STOCK_DOC_LABELS[doc.type].label} ${doc.number} șters` }, tx);
    return doc;
  });
}

/* ------------------------------ Gestiuni ------------------------------ */

export async function saveWarehouse(actor: Actor, input: { id?: string | null; name: string; code?: string | null; address?: string | null; isDefault: boolean }) {
  return db.transaction(async (tx) => {
    const all = await tx.query.warehouses.findMany({ where: eq(warehouses.companyId, actor.companyId) });
    const current = input.id ? all.find((w) => w.id === input.id) : undefined;
    if (input.id && !current) throw new Error("Gestiunea nu există.");
    const others = all.filter((w) => w.id !== input.id);
    // prima gestiune e implicită; gestiunea implicită nu se poate „debifa” (se alege alta ca implicită)
    const isDefault = input.isDefault || others.length === 0 || !!current?.isDefault;
    if (isDefault && others.some((w) => w.isDefault)) {
      await tx.update(warehouses).set({ isDefault: false }).where(eq(warehouses.companyId, actor.companyId));
    }
    const values = { name: input.name, code: input.code ?? null, address: input.address ?? null, isDefault };
    if (current) {
      const [w] = await tx.update(warehouses).set(values).where(eq(warehouses.id, current.id)).returning();
      return w;
    }
    const [w] = await tx.insert(warehouses).values({ companyId: actor.companyId, ...values }).returning();
    await logActivity(actor, { entity: "warehouse", entityId: w.id, action: "created", message: `Gestiune nouă: ${w.name}` }, tx);
    return w;
  });
}

export async function deleteWarehouse(actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const w = await tx.query.warehouses.findFirst({ where: and(eq(warehouses.id, id), eq(warehouses.companyId, actor.companyId)) });
    if (!w) throw new Error("Gestiunea nu există.");
    const used =
      (await tx.query.stockMovements.findFirst({ where: and(eq(stockMovements.companyId, actor.companyId), eq(stockMovements.warehouseId, id)), columns: { id: true } })) ||
      (await tx.query.stockDocuments.findFirst({
        where: and(eq(stockDocuments.companyId, actor.companyId), or(eq(stockDocuments.warehouseId, id), eq(stockDocuments.targetWarehouseId, id))),
        columns: { id: true },
      }));
    if (used) throw new Error("Gestiunea are mișcări de stoc și nu poate fi ștearsă.");
    await tx.delete(warehouses).where(eq(warehouses.id, id));
    if (w.isDefault) {
      const next = await tx.query.warehouses.findFirst({ where: eq(warehouses.companyId, actor.companyId), orderBy: [asc(warehouses.createdAt)] });
      if (next) await tx.update(warehouses).set({ isDefault: true }).where(eq(warehouses.id, next.id));
    }
    await logActivity(actor, { entity: "warehouse", entityId: id, action: "deleted", message: `Gestiune ștearsă: ${w.name}` }, tx);
    return w;
  });
}

/* ------------------------------ Interogări ------------------------------ */

export type StockDocDetail = Awaited<ReturnType<typeof getStockDocumentDetail>>;

export async function getStockDocumentDetail(companyId: string, id: string) {
  const doc = await db.query.stockDocuments.findFirst({
    where: and(eq(stockDocuments.id, id), eq(stockDocuments.companyId, companyId)),
    with: { movements: { with: { product: { columns: { id: true, name: true, code: true, unit: true } }, warehouse: { columns: { id: true, name: true } } } } },
  });
  if (!doc) throw new Error("Documentul nu există.");
  const [wh, target, partner, purchase, sale] = await Promise.all([
    db.query.warehouses.findFirst({ where: eq(warehouses.id, doc.warehouseId), columns: { name: true } }),
    doc.targetWarehouseId ? db.query.warehouses.findFirst({ where: eq(warehouses.id, doc.targetWarehouseId), columns: { name: true } }) : null,
    doc.partnerId ? db.query.partners.findFirst({ where: (p, { eq: e }) => e(p.id, doc.partnerId!), columns: { id: true, name: true, kind: true } }) : null,
    doc.purchaseInvoiceId
      ? db.query.purchaseInvoices.findFirst({ where: eq(purchaseInvoices.id, doc.purchaseInvoiceId), columns: { id: true, number: true, supplierName: true } })
      : null,
    doc.documentId ? db.query.documents.findFirst({ where: (d, { eq: e }) => e(d.id, doc.documentId!), columns: { id: true, fullNumber: true, kind: true } }) : null,
  ]);
  return {
    id: doc.id,
    type: doc.type,
    number: doc.number,
    date: doc.date,
    notes: doc.notes,
    warehouseName: wh?.name ?? "—",
    targetWarehouseName: target?.name ?? null,
    partner: partner ?? null,
    purchase: purchase ?? null,
    sale: sale ?? null,
    movements: doc.movements.map((m) => ({
      id: m.id,
      productId: m.productId,
      productName: m.product?.name ?? "Produs șters",
      productCode: m.product?.code ?? null,
      unit: m.product?.unit ?? "buc",
      warehouseName: m.warehouse?.name ?? "—",
      quantity: m.quantity,
      unitCost: m.unitCost,
      value: round2(m.quantity * m.unitCost),
    })),
  };
}

/** Fișa magaziei: mișcările cronologice ale unui produs, cu sold cumulat. */
export async function getStockCard(companyId: string, productId: string, warehouseId?: string | null) {
  const conds = [eq(stockMovements.companyId, companyId), eq(stockMovements.productId, productId)];
  if (warehouseId) conds.push(eq(stockMovements.warehouseId, warehouseId));
  const rows = await db
    .select({
      id: stockMovements.id,
      date: stockMovements.date,
      quantity: stockMovements.quantity,
      unitCost: stockMovements.unitCost,
      createdAt: stockMovements.createdAt,
      warehouseId: stockMovements.warehouseId,
      docId: stockDocuments.id,
      docType: stockDocuments.type,
      docNumber: stockDocuments.number,
      notes: stockDocuments.notes,
      warehouseName: warehouses.name,
    })
    .from(stockMovements)
    .innerJoin(stockDocuments, eq(stockDocuments.id, stockMovements.stockDocumentId))
    .leftJoin(warehouses, eq(warehouses.id, stockMovements.warehouseId))
    .where(and(...conds))
    .orderBy(asc(stockMovements.date), asc(stockMovements.createdAt));
  let balance = 0;
  let inQty = 0;
  let inValue = 0;
  return rows.map((r) => {
    balance = round2(balance + r.quantity);
    if (r.quantity > 0) {
      inQty += r.quantity;
      inValue += r.quantity * r.unitCost;
    }
    return {
      id: r.id,
      date: r.date,
      docId: r.docId,
      docType: r.docType,
      docNumber: r.docNumber,
      notes: r.notes,
      warehouseName: r.warehouseName ?? "—",
      in: r.quantity > 0 ? r.quantity : 0,
      out: r.quantity < 0 ? -r.quantity : 0,
      unitCost: r.unitCost,
      balance,
      avgCost: inQty > 0 ? round2(inValue / inQty) : 0,
    };
  });
}
