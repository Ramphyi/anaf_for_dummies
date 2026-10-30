import { eq } from "drizzle-orm";
import { AlertTriangle, Boxes, Package, Wallet } from "lucide-react";
import { Kpi, KpiGrid } from "@/components/catalog/kpi";
import { ProductsView, type ProductRow } from "@/components/catalog/products-view";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { products, warehouses } from "@/lib/db/schema";
import { stockState } from "@/lib/products/schema";
import { getStockLevels } from "@/lib/stock/server";
import { round2 } from "@/lib/utils";

export const metadata = { title: "Produse & servicii" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ nou?: string; id?: string }> }) {
  const ctx = await requirePermission("billing");
  const sp = await searchParams;
  const companyId = ctx.company.id;
  const [list, levels, whs] = await Promise.all([
    db.query.products.findMany({ where: eq(products.companyId, companyId), orderBy: (p, { asc }) => [asc(p.name)] }),
    getStockLevels(companyId),
    db.query.warehouses.findMany({ where: eq(warehouses.companyId, companyId), columns: { id: true, name: true } }),
  ]);
  const whName = new Map(whs.map((w) => [w.id, w.name]));

  const rows: ProductRow[] = list.map((p) => {
    const own = levels.filter((l) => l.productId === p.id);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      type: p.type,
      unit: p.unit,
      price: p.price,
      currency: p.currency,
      vatRate: p.vatRate,
      vatCategory: p.vatCategory,
      priceIncludesVat: p.priceIncludesVat,
      trackStock: p.trackStock,
      purchasePrice: p.purchasePrice,
      ncCode: p.ncCode,
      barcode: p.barcode,
      category: p.category,
      active: p.active,
      stock: p.trackStock ? round2(own.reduce((s, l) => s + l.quantity, 0)) : null,
      stockValue: round2(own.reduce((s, l) => s + l.value, 0)),
      stockByWarehouse: own.filter((l) => l.quantity !== 0).map((l) => ({ name: whName.get(l.warehouseId) ?? "—", quantity: l.quantity })),
    };
  });

  const active = rows.filter((r) => r.active);
  const tracked = active.filter((r) => r.trackStock);
  const stockValue = round2(tracked.reduce((s, r) => s + r.stockValue, 0));
  const alerts = tracked.filter((r) => r.stock != null && stockState(r.stock) !== "ok");
  const services = active.filter((r) => r.type === "service").length;

  const initial = sp.nou === "1" ? ({ mode: "new" } as const) : sp.id ? ({ mode: "edit", id: sp.id } as const) : null;

  return (
    <div className="space-y-6">
      <ProductsView
        rows={rows}
        initial={initial}
        kpis={
          <KpiGrid>
            <Kpi label="Articole active" value={active.length} format="number" icon={<Package />} deltaLabel={`${active.length - services} produse · ${services} servicii`} />
            <Kpi label="Cu gestiune de stoc" value={tracked.length} format="number" icon={<Boxes />} tone="info" deltaLabel="intrări prin NIR, ieșiri la facturare" href="/stocuri" />
            <Kpi label="Valoarea stocului" value={stockValue} icon={<Wallet />} tone="success" deltaLabel="la cost mediu ponderat" href="/stocuri" />
            <Kpi
              label="Alerte de stoc"
              value={alerts.length}
              format="number"
              icon={<AlertTriangle />}
              tone={alerts.length ? "warning" : "success"}
              deltaLabel={alerts.length ? alerts.slice(0, 2).map((a) => a.name).join(", ") + (alerts.length > 2 ? "…" : "") : "toate stocurile sunt în regulă"}
            />
          </KpiGrid>
        }
      />
    </div>
  );
}
