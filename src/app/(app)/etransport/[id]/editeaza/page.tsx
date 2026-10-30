import { and, eq } from "drizzle-orm";
import { FilePen } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { etransportDeclarations } from "@/lib/db/schema";
import { EtransportForm } from "../../etransport-form";
import { declarationFromDocument, loadFormData } from "../../form-data";

export const metadata = { title: "Editează declarația e-Transport" };

export default async function EditEtransportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ document?: string }>;
}) {
  const [{ id }, { document }] = await Promise.all([params, searchParams]);
  const ctx = await requirePermission("anaf");
  const decl = await db.query.etransportDeclarations.findFirst({
    where: and(eq(etransportDeclarations.id, id), eq(etransportDeclarations.companyId, ctx.company.id)),
    columns: { xml: false },
  });
  if (!decl) notFound();
  if (decl.status === "ok" || decl.status === "pending") redirect(`/etransport/${id}`);

  const data = await loadFormData(ctx);
  const fromDoc = document ? await declarationFromDocument(ctx, document, data.company) : null;
  const initial = fromDoc
    ? { ...fromDoc.input, id: decl.id }
    : {
        id: decl.id,
        operationType: decl.operationType,
        partnerId: decl.partnerId,
        partnerName: decl.partnerName,
        vehicleNumber: decl.vehicleNumber,
        trailer1: decl.trailer1,
        carrierName: decl.carrierName,
        carrierCui: decl.carrierCui,
        transportDate: decl.transportDate,
        startCounty: decl.startCounty,
        startCity: decl.startCity,
        startAddress: decl.startAddress,
        endCounty: decl.endCounty,
        endCity: decl.endCity,
        endAddress: decl.endAddress,
        documentId: decl.documentId,
        documentNumber: decl.documentNumber,
        items: decl.items,
      };

  return (
    <>
      <PageHeader
        title="Editează declarația"
        description={decl.status === "draft" ? "Ciornă — nu a fost încă transmisă la ANAF." : "Corectează datele și declară din nou transportul."}
        icon={<FilePen />}
        breadcrumbs={[
          { label: "e-Transport", href: "/etransport" },
          { label: decl.partnerName ?? "Declarație", href: `/etransport/${id}` },
          { label: "Editare" },
        ]}
      />
      <EtransportForm
        key={document ?? id}
        initial={initial}
        partners={data.partners}
        products={data.products}
        documents={data.documents}
        company={data.company}
        prefillNote={fromDoc ? `Date preluate din ${fromDoc.label}. Verifică greutățile și codurile NC.` : decl.message ? `Mesaj ANAF: ${decl.message}` : null}
      />
    </>
  );
}
