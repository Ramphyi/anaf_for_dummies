import { notFound } from "next/navigation";
import { PurchaseForm } from "@/components/purchases/purchase-form";
import { requirePermission } from "@/lib/auth/session";
import { getPurchase } from "@/lib/purchases/server";
import { getPurchaseFormData } from "../../form-data";

export const metadata = { title: "Editare cheltuială" };

export default async function EditPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("billing");
  const pi = await getPurchase(ctx.company.id, id);
  if (!pi) notFound();
  const data = await getPurchaseFormData(ctx.company.id, pi.supplierId);

  return (
    <PurchaseForm
      {...data}
      initial={{
        id: pi.id,
        supplierId: pi.supplierId,
        number: pi.number,
        issueDate: pi.issueDate,
        dueDate: pi.dueDate,
        currency: pi.currency,
        exchangeRate: pi.exchangeRate,
        category: pi.category,
        projectId: pi.projectId,
        notes: pi.notes,
        source: pi.source,
        stockReceived: pi.stockReceived,
        lines: pi.lines.map((l) => ({ productId: l.productId, name: l.name, unit: l.unit, quantity: l.quantity, unitPrice: l.unitPrice, vatRate: l.vatRate })),
      }}
    />
  );
}
