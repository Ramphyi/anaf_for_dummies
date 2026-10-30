import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { AlertTriangle, Boxes, PackageX, Wallet } from "lucide-react";
import { Kpi, KpiGrid } from "@/components/catalog/kpi";
import { StockView } from "@/components/stock/stock-view";
import type { LevelRow, NewDocKind, StockDocRow, TrackedProductInfo, WarehouseInfo } from "@/components/stock/types";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { partners, products, stockDocuments, stockMovements, warehouses } from "@/lib/db/schema";
import { getStockCard } from "@/lib/products/stock-server";
import { LOW_STOCK_THRESHOLD, stockState } from "@/lib/products/schema";
import { getDefaultWarehouse, getStockLevels } from "@/lib/stock/server";
import { round2 } from "@/lib/utils";

export const metadata = { title: "Stocuri & gestiuni" };

const TABS = ["situatie", "documente", "fisa", "gestiuni"] as const;
type Tab = (typeof TABS)[number];
const NEW_KINDS: Record<string, NewDocKind> = { nir: "nir", consum: "consumption", consumption: "consumption", transfer: "transfer", inventar: "inventory", inventory: "inventory" };

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; produs?: string; gestiune?: string; doc?: string; nou?: string; furnizor?: string }>;
}) {
  const ctx = await requirePermission("billing");
  const companyId = ctx.company.id;
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : sp.produs ? "fisa" : sp.doc ? "documente" : "situatie";

  await getDefaultWarehouse(companyId); // garantează existența unei gestiuni
  const [whs, prods, levels, docs, docAgg, suppliers] = await Promise.all([
    db.query.warehouses.findMany({ where: eq(warehouses.companyId, companyId), orderBy: (w, { desc: d, asc }) => [d(w.isDefault), asc(w.name)] }),
    db.query.products.findMany({
      where: and(eq(products.companyId, companyId), eq(products.trackStock, true)),
      orderBy: (p, { asc }) => [asc(p.name)],
      columns: { id: true, name: true, code: true, unit: true, purchasePrice: true, active: true },
    }),
    getStockLevels(companyId),
    db.query.stockDocuments.findMany({ where: eq(stockDocuments.companyId, companyId), orderBy: [desc(stockDocuments.date), desc(stockDocuments.createdAt)] }),
    db
      .select({
        docId: stockMovements.stockDocumentId,
        lines: sql<number>`count(distinct ${stockMovements.productId})`,
        inValue: sql<number>`coalesce(sum(case when ${stockMovements.quantity} > 0 then ${stockMovements.quantity} * ${stockMovements.unitCost} else 0 end), 0)`,
        outValue: sql<number>`coalesce(sum(case when ${stockMovements.quantity} < 0 then -${stockMovements.quantity} * ${stockMovements.unitCost} else 0 end), 0)`,
        net: sql<number>`coalesce(sum(${stockMovements.quantity} * ${stockMovements.unitCost}), 0)`,
      })
      .from(stockMovements)
      .where(eq(stockMovements.companyId, companyId))
      .groupBy(stockMovements.stockDocumentId),
    db.query.partners.findMany({
      where: and(eq(partners.companyId, companyId), inArray(partners.kind, ["supplier", "both"]), eq(partners.active, true)),
      orderBy: (p, { asc }) => [asc(p.name)],
      columns: { id: true, name: true, cui: true },
    }),
  ]);

  const whName = new Map(whs.map((w) => [w.id, w.name]));
  const prodOf = new Map(prods.map((p) => [p.id, p]));
  const partnerIds = [...new Set(docs.map((d) => d.partnerId).filter((x): x is string => !!x))];
  const docPartners = partnerIds.length
    ? await db.query.partners.findMany({ where: and(eq(partners.companyId, companyId), inArray(partners.id, partnerIds)), columns: { id: true, name: true } })
    : [];
  const partnerName = new Map(docPartners.map((p) => [p.id, p.name]));
  const aggOf = new Map(docAgg.map((a) => [a.docId, a]));

  // situația stocurilor: produs × gestiune (+ produsele urmărite fără mișcări, cu 0)
  const levelRows: LevelRow[] = levels
    .filter((l) => prodOf.has(l.productId))
    .map((l) => {
      const p = prodOf.get(l.productId)!;
      return {
        key: `${l.productId}:${l.warehouseId}`,
        productId: l.productId,
        productName: p.name,
        productCode: p.code,
        unit: p.unit,
        warehouseId: l.warehouseId,
        warehouseName: whName.get(l.warehouseId) ?? "—",
        quantity: l.quantity,
        avgCost: l.avgCost,
        value: l.value,
      };
    });
  const defaultWh = whs.find((w) => w.isDefault) ?? whs[0];
  for (const p of prods) {
    if (p.active && defaultWh && !levelRows.some((r) => r.productId === p.id)) {
      levelRows.push({
        key: `${p.id}:${defaultWh.id}`,
        productId: p.id,
        productName: p.name,
        productCode: p.code,
        unit: p.unit,
        warehouseId: defaultWh.id,
        warehouseName: defaultWh.name,
        quantity: 0,
        avgCost: p.purchasePrice ?? 0,
        value: 0,
      });
    }
  }

  const docRows: StockDocRow[] = docs.map((d) => {
    const a = aggOf.get(d.id);
    const value = d.type === "transfer" ? (a?.inValue ?? 0) : d.type === "inventory" ? (a?.net ?? 0) : (a?.inValue ?? 0) + (a?.outValue ?? 0);
    return {
      id: d.id,
      type: d.type,
      number: d.number,
      date: d.date,
      warehouseName: whName.get(d.warehouseId) ?? "—",
      targetWarehouseName: d.targetWarehouseId ? (whName.get(d.targetWarehouseId) ?? "—") : null,
      partnerName: d.partnerId ? (partnerName.get(d.partnerId) ?? null) : null,
      purchaseInvoiceId: d.purchaseInvoiceId,
      documentId: d.documentId,
      lines: a?.lines ?? 0,
      value: round2(value),
      notes: d.notes,
    };
  });

  const warehouseInfo: WarehouseInfo[] = whs.map((w) => {
    const own = levels.filter((l) => l.warehouseId === w.id);
    return {
      id: w.id,
      name: w.name,
      code: w.code,
      address: w.address,
      isDefault: w.isDefault,
      productCount: own.filter((l) => l.quantity > 0).length,
      value: round2(own.reduce((s, l) => s + l.value, 0)),
      docCount: docs.filter((d) => d.warehouseId === w.id || d.targetWarehouseId === w.id).length,
    };
  });

  const trackedInfo: TrackedProductInfo[] = prods;
  const cardProduct = sp.produs && prodOf.has(sp.produs) ? sp.produs : null;
  const cardWarehouse = sp.gestiune && whName.has(sp.gestiune) ? sp.gestiune : null;
  const card = cardProduct ? await getStockCard(companyId, cardProduct, cardWarehouse) : null;

  // KPI-uri: pe produs (toate gestiunile)
  const perProduct = new Map<string, number>();
  for (const r of levelRows) perProduct.set(r.productId, (perProduct.get(r.productId) ?? 0) + r.quantity);
  const totalValue = round2(levelRows.reduce((s, r) => s + r.value, 0));
  const inStock = [...perProduct.values()].filter((q) => q > 0).length;
  // alertele sunt pe poziție (produs × gestiune), ca în tabel
  const low = levelRows.filter((r) => stockState(r.quantity) === "low").length;
  const outOrNeg = levelRows.filter((r) => r.quantity <= 0).length;

  return (
    <div className="space-y-6">
      <StockView
        tab={tab}
        levels={levelRows}
        documents={docRows}
        warehouses={warehouseInfo}
        products={trackedInfo}
        suppliers={suppliers}
        card={card}
        cardProductId={cardProduct}
        cardWarehouseId={cardWarehouse}
        openDocId={sp.doc ?? null}
        newDoc={sp.nou ? (NEW_KINDS[sp.nou] ?? null) : null}
        newDocSupplierId={sp.furnizor ?? null}
        kpis={
          <KpiGrid>
            <Kpi label="Valoarea stocului" value={totalValue} icon={<Wallet />} deltaLabel={`${whs.length} ${whs.length === 1 ? "gestiune" : "gestiuni"} · cost mediu ponderat`} />
            <Kpi label="Produse în stoc" value={inStock} format="number" icon={<Boxes />} tone="success" deltaLabel={`din ${prods.length} produse gestionate`} />
            <Kpi
              label="Poziții cu stoc scăzut"
              value={low}
              format="number"
              icon={<AlertTriangle />}
              tone={low ? "warning" : "success"}
              deltaLabel={low ? `cel mult ${LOW_STOCK_THRESHOLD} unități în gestiune` : "nicio alertă"}
            />
            <Kpi
              label="Poziții epuizate / negative"
              value={outOrNeg}
              format="number"
              icon={<PackageX />}
              tone={outOrNeg ? "danger" : "success"}
              deltaLabel={outOrNeg ? "necesită recepție sau inventar" : "toate produsele au stoc"}
            />
          </KpiGrid>
        }
      />
    </div>
  );
}
