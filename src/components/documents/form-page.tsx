import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import type { DocKind } from "@/lib/db/schema";
import { getDocument } from "@/lib/documents/server";
import { isEditable } from "@/lib/documents/status";
import { todayIso } from "@/lib/format";
import { DocumentEditor, type DocumentInitial } from "./document-editor";
import { companyDefaults, latestRates, loadEditorData, toPartnerOption } from "./server";
import { docHref } from "./shared";

/** Pagina de creare / editare pentru facturi, proforme și avize. */
export async function DocumentFormPage({ kind, id, clientId, projectId }: { kind: DocKind; id?: string; clientId?: string | null; projectId?: string | null }) {
  const ctx = await requirePermission("billing");
  const [data, rates] = await Promise.all([loadEditorData(ctx.company.id, kind), latestRates()]);
  const company = companyDefaults(ctx.company);

  if (id) {
    const doc = await getDocument(ctx.company.id, id);
    if (!doc) notFound();
    if (doc.kind !== kind) redirect(`${docHref(doc.kind, id)}/editare`);
    if (!isEditable(doc)) redirect(docHref(kind, id));
    if (doc.partner && !data.partners.some((p) => p.id === doc.partner!.id)) data.partners.push(toPartnerOption(doc.partner));
    const initial: DocumentInitial = {
      partnerId: doc.partnerId,
      seriesId: doc.seriesId,
      issueDate: doc.issueDate,
      dueDate: doc.dueDate,
      deliveryDate: doc.deliveryDate,
      currency: doc.currency,
      exchangeRate: doc.exchangeRate,
      notes: doc.notes,
      internalNotes: doc.internalNotes,
      issuedBy: doc.issuedBy,
      delegateName: doc.delegateName,
      delegateIdCard: doc.delegateIdCard,
      transportMeans: doc.transportMeans,
      warehouseId: doc.warehouseId,
      projectId: doc.projectId,
      lines: doc.lines.map((l) => ({
        productId: l.productId,
        name: l.name,
        description: l.description,
        unit: l.unit,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPercent: l.discountPercent,
        vatRate: l.vatRate,
        vatCategory: l.vatCategory,
      })),
    };
    let warning: string | null = null;
    if (doc.status !== "draft") {
      warning =
        kind === "invoice"
          ? doc.efacturaStatus === "nok" || doc.efacturaStatus === "error"
            ? `Factura ${doc.fullNumber} a fost respinsă de ANAF. Corectează datele, salvează și retransmite-o în SPV — numărul rămâne același.`
            : `Factura ${doc.fullNumber} este deja emisă. Modificările actualizează documentul (numărul rămâne același), recalculează stocul și încasările. Dacă factura a fost comunicată clientului, emite o factură storno în locul modificării.`
          : `Documentul ${doc.fullNumber} este emis. Modificările se aplică documentului existent.`;
    }
    return (
      <DocumentEditor
        kind={kind}
        documentId={doc.id}
        status={doc.status}
        fullNumber={doc.fullNumber}
        initial={initial}
        warning={warning}
        company={company}
        rates={rates}
        {...data}
      />
    );
  }

  const project = projectId ? data.projects.find((p) => p.id === projectId) : undefined;
  const partner = data.partners.find((p) => p.id === (clientId ?? project?.clientId));
  const initial: DocumentInitial = {
    partnerId: partner?.id ?? null,
    seriesId: null,
    issueDate: todayIso(),
    dueDate: null,
    deliveryDate: null,
    currency: partner?.defaultCurrency ?? ctx.company.defaultCurrency,
    exchangeRate: 1,
    notes: null,
    internalNotes: null,
    issuedBy: ctx.user.name,
    delegateName: null,
    delegateIdCard: null,
    transportMeans: null,
    warehouseId: null,
    projectId: project?.id ?? null,
    lines: [],
  };
  return <DocumentEditor kind={kind} initial={initial} company={company} rates={rates} {...data} />;
}
