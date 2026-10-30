import "server-only";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, stockDocuments, stockMovements, warehouses } from "@/lib/db/schema";
import { STOCK_DOC_LABELS } from "@/lib/constants";
import { getStockLevels } from "@/lib/stock/server";
import { round2, sum } from "@/lib/utils";
import { dayBefore } from "./period";

export type StockProductRow = {
  key: string;
  productId: string;
  warehouseId: string;
  code: string | null;
  name: string;
  unit: string;
  category: string | null;
  warehouse: string;
  openingQty: number;
  openingValue: number;
  inQty: number;
  outQty: number;
  inValue: number;
  outValue: number;
  closingQty: number;
  closingValue: number;
  avgCost: number;
};

export type StockReport = Awaited<ReturnType<typeof getStockReport>>;

export async function getStockReport(companyId: string, period: { from: string; to: string }) {
  const [closing, opening, whs, prods, moves] = await Promise.all([
    getStockLevels(companyId, { upToDate: period.to }),
    getStockLevels(companyId, { upToDate: dayBefore(period.from) }),
    db.query.warehouses.findMany({ where: eq(warehouses.companyId, companyId) }),
    db.query.products.findMany({ where: eq(products.companyId, companyId), columns: { id: true, code: true, name: true, unit: true, category: true } }),
    db
      .select({ m: stockMovements, type: stockDocuments.type, docId: stockDocuments.id })
      .from(stockMovements)
      .innerJoin(stockDocuments, eq(stockDocuments.id, stockMovements.stockDocumentId))
      .where(and(eq(stockMovements.companyId, companyId), gte(stockMovements.date, period.from), lte(stockMovements.date, period.to))),
  ]);

  const whName = new Map(whs.map((w) => [w.id, w.name]));
  const prodById = new Map(prods.map((p) => [p.id, p]));

  const rows = new Map<string, StockProductRow>();
  const ensure = (productId: string, warehouseId: string) => {
    const key = `${productId}|${warehouseId}`;
    let r = rows.get(key);
    if (!r) {
      const p = prodById.get(productId);
      r = {
        key,
        productId,
        warehouseId,
        code: p?.code ?? null,
        name: p?.name ?? "Produs șters",
        unit: p?.unit ?? "buc",
        category: p?.category ?? null,
        warehouse: whName.get(warehouseId) ?? "—",
        openingQty: 0,
        openingValue: 0,
        inQty: 0,
        outQty: 0,
        inValue: 0,
        outValue: 0,
        closingQty: 0,
        closingValue: 0,
        avgCost: 0,
      };
      rows.set(key, r);
    }
    return r;
  };
  for (const l of opening) {
    const r = ensure(l.productId, l.warehouseId);
    r.openingQty = l.quantity;
    r.openingValue = l.value;
  }
  for (const l of closing) {
    const r = ensure(l.productId, l.warehouseId);
    r.closingQty = l.quantity;
    r.closingValue = l.value;
    r.avgCost = l.avgCost;
  }

  const byType = new Map<string, { type: string; label: string; docs: Set<string>; inQty: number; outQty: number; inValue: number; outValue: number }>();
  for (const { m, type, docId } of moves) {
    const r = ensure(m.productId, m.warehouseId);
    const value = Math.abs(m.quantity) * m.unitCost;
    if (m.quantity > 0) {
      r.inQty += m.quantity;
      r.inValue += value;
    } else {
      r.outQty += -m.quantity;
      r.outValue += value;
    }
    const t = byType.get(type) ?? { type, label: STOCK_DOC_LABELS[type]?.label ?? type, docs: new Set<string>(), inQty: 0, outQty: 0, inValue: 0, outValue: 0 };
    t.docs.add(docId);
    if (m.quantity > 0) {
      t.inQty += m.quantity;
      t.inValue += value;
    } else {
      t.outQty += -m.quantity;
      t.outValue += value;
    }
    byType.set(type, t);
  }

  const productRows = [...rows.values()]
    .map((r) => ({ ...r, inQty: round2(r.inQty), outQty: round2(r.outQty), inValue: round2(r.inValue), outValue: round2(r.outValue) }))
    .filter((r) => r.openingQty || r.closingQty || r.inQty || r.outQty)
    .sort((a, b) => b.closingValue - a.closingValue);

  const warehousesOut = whs
    .map((w) => {
      const mine = productRows.filter((r) => r.warehouseId === w.id);
      return {
        id: w.id,
        name: w.name,
        code: w.code,
        isDefault: w.isDefault,
        value: round2(sum(mine, (r) => r.closingValue)),
        openingValue: round2(sum(mine, (r) => r.openingValue)),
        products: mine.filter((r) => r.closingQty > 0).length,
        quantity: round2(sum(mine, (r) => r.closingQty)),
      };
    })
    .sort((a, b) => b.value - a.value);

  const typeOrder = Object.keys(STOCK_DOC_LABELS);
  const movementTypes = [...byType.values()]
    .map(({ docs, ...t }) => ({ ...t, documents: docs.size, inQty: round2(t.inQty), outQty: round2(t.outQty), inValue: round2(t.inValue), outValue: round2(t.outValue) }))
    .sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));

  // valoare pe produs (toate gestiunile) pentru grafic
  const perProduct = new Map<string, { name: string; value: number }>();
  for (const r of productRows) {
    const p = perProduct.get(r.productId) ?? { name: r.name, value: 0 };
    p.value = round2(p.value + r.closingValue);
    perProduct.set(r.productId, p);
  }

  return {
    warehouses: warehousesOut,
    products: productRows,
    movementTypes,
    topProducts: [...perProduct.values()].filter((p) => p.value > 0).sort((a, b) => b.value - a.value).slice(0, 8),
    kpis: {
      closingValue: round2(sum(productRows, (r) => r.closingValue)),
      openingValue: round2(sum(productRows, (r) => r.openingValue)),
      inValue: round2(sum(productRows, (r) => r.inValue)),
      outValue: round2(sum(productRows, (r) => r.outValue)),
      products: new Set(productRows.filter((r) => r.closingQty > 0).map((r) => r.productId)).size,
      negative: productRows.filter((r) => r.closingQty < 0).length,
    },
  };
}
