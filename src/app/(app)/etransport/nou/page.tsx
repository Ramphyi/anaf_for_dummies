import { Truck } from "lucide-react";
import { PageHeader } from "@/components/ui/page";
import { requirePermission } from "@/lib/auth/session";
import { EtransportForm } from "../etransport-form";
import { declarationFromDocument, emptyDeclaration, loadFormData } from "../form-data";

export const metadata = { title: "Declarație e-Transport nouă" };

export default async function NewEtransportPage({ searchParams }: { searchParams: Promise<{ document?: string }> }) {
  const { document } = await searchParams;
  const ctx = await requirePermission("anaf");
  const data = await loadFormData(ctx);
  const fromDoc = document ? await declarationFromDocument(ctx, document, data.company) : null;

  let note: string | null = null;
  if (document && !fromDoc) note = "Documentul selectat nu a fost găsit — completează declarația manual.";
  else if (fromDoc) {
    note = `Date preluate din ${fromDoc.label}. Verifică greutățile (netă/brută) și codurile NC înainte de declarare.`;
    if (fromDoc.servicesOnly) note += " Atenție: documentul conține doar servicii — e-Transport se aplică doar bunurilor.";
  }

  return (
    <>
      <PageHeader
        title="Declarație e-Transport nouă"
        description="Completează datele transportului; la declarare primești codul UIT de la ANAF."
        icon={<Truck />}
        breadcrumbs={[{ label: "e-Transport", href: "/etransport" }, { label: "Declarație nouă" }]}
      />
      <EtransportForm
        key={document ?? "new"}
        initial={fromDoc?.input ?? emptyDeclaration(data.company)}
        partners={data.partners}
        products={data.products}
        documents={data.documents}
        company={data.company}
        prefillNote={note}
      />
    </>
  );
}
