import { addDays, format, parseISO } from "date-fns";
import { PurchaseForm } from "@/components/purchases/purchase-form";
import { requirePermission } from "@/lib/auth/session";
import { todayIso } from "@/lib/format";
import { getPurchaseFormData } from "../form-data";

export const metadata = { title: "Cheltuială nouă" };

export default async function NewPurchasePage({ searchParams }: { searchParams: Promise<{ supplier?: string; project?: string }> }) {
  const ctx = await requirePermission("billing");
  const sp = await searchParams;
  const data = await getPurchaseFormData(ctx.company.id, sp.supplier);
  const today = todayIso();
  const supplier = data.suppliers.find((s) => s.id === sp.supplier) ?? null;
  const project = data.projects.find((p) => p.id === sp.project) ?? null;

  return (
    <PurchaseForm
      {...data}
      initial={{
        supplierId: supplier?.id ?? null,
        number: "",
        issueDate: today,
        dueDate: supplier?.paymentTermDays != null ? format(addDays(parseISO(today), supplier.paymentTermDays), "yyyy-MM-dd") : null,
        currency: "RON",
        exchangeRate: 1,
        category: supplier?.lastCategory ?? "altele",
        projectId: project?.id ?? null,
        notes: null,
        lines: [],
      }}
    />
  );
}
