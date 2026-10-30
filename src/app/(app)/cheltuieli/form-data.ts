import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { ProductOption, ProjectOption, SupplierOption } from "@/components/purchases/purchase-form";
import { db } from "@/lib/db";
import { partners, products, projects, purchaseInvoices } from "@/lib/db/schema";

/** Opțiunile pentru formularul de cheltuieli: furnizori, proiecte, produse. */
export async function getPurchaseFormData(companyId: string, includeSupplierId?: string | null) {
  const [sup, projs, prods, recent] = await Promise.all([
    db.query.partners.findMany({
      where: and(eq(partners.companyId, companyId), inArray(partners.kind, ["supplier", "both"])),
      orderBy: (p, { asc }) => [asc(p.name)],
      columns: { id: true, name: true, cui: true, city: true, paymentTermDays: true, defaultCurrency: true, active: true },
    }),
    db.query.projects.findMany({
      where: and(eq(projects.companyId, companyId), inArray(projects.status, ["planning", "active", "on_hold"])),
      orderBy: (p, { asc }) => [asc(p.name)],
      with: { client: { columns: { name: true } } },
      columns: { id: true, name: true, code: true, color: true },
    }),
    db.query.products.findMany({
      where: and(eq(products.companyId, companyId), eq(products.active, true)),
      orderBy: (p, { asc }) => [asc(p.name)],
      columns: { id: true, name: true, code: true, unit: true, price: true, purchasePrice: true, vatRate: true, trackStock: true },
    }),
    db
      .select({ supplierId: purchaseInvoices.supplierId, category: purchaseInvoices.category })
      .from(purchaseInvoices)
      .where(eq(purchaseInvoices.companyId, companyId))
      .orderBy(desc(purchaseInvoices.issueDate)),
  ]);
  const lastCategory = new Map<string, string>();
  for (const r of recent) if (r.supplierId && !lastCategory.has(r.supplierId)) lastCategory.set(r.supplierId, r.category);

  const suppliers: SupplierOption[] = sup
    .filter((s) => s.active || s.id === includeSupplierId)
    .map((s) => ({ id: s.id, name: s.name, cui: s.cui, city: s.city, paymentTermDays: s.paymentTermDays, defaultCurrency: s.defaultCurrency, lastCategory: lastCategory.get(s.id) ?? null }));
  const projectOptions: ProjectOption[] = projs.map((p) => ({ id: p.id, name: p.name, code: p.code, color: p.color, clientName: p.client?.name ?? null }));
  const productOptions: ProductOption[] = prods;
  return { suppliers, projects: projectOptions, products: productOptions };
}
