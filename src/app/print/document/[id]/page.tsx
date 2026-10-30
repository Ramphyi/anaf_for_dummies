import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { DocumentPaper } from "@/components/documents/document-paper";
import { PrintToolbar } from "@/components/documents/print-toolbar";
import { docHref, KIND_META } from "@/components/documents/shared";
import { getContext, requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { getDocument } from "@/lib/documents/server";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const ctx = await getContext();
  if (!ctx) return { title: "Document" };
  const d = await db.query.documents.findFirst({
    where: and(eq(documents.id, id), eq(documents.companyId, ctx.company.id)),
    columns: { fullNumber: true, kind: true, clientName: true, isCreditNote: true },
  });
  // Titlul devine numele fișierului la „Salvează ca PDF”.
  return { title: { absolute: d ? `${d.isCreditNote ? "Storno" : KIND_META[d.kind].one} ${d.fullNumber} - ${d.clientName}` : "Document" } };
}

export default async function PrintDocumentPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { print } = await searchParams;
  const ctx = await requirePermission("billing");
  const doc = await getDocument(ctx.company.id, id);
  if (!doc) notFound();
  const related =
    doc.isCreditNote && doc.relatedDocumentId
      ? await db.query.documents.findFirst({
          where: and(eq(documents.id, doc.relatedDocumentId), eq(documents.companyId, ctx.company.id)),
          columns: { fullNumber: true, issueDate: true },
        })
      : null;

  return (
    <>
      <main className="mx-auto w-full max-w-[210mm] px-3 py-6 sm:py-10 print:p-0">
        <div className="print-page overflow-hidden rounded-2xl border border-border bg-card shadow-lift">
          <DocumentPaper doc={doc} company={ctx.company} related={related} />
        </div>
        <p className="no-print mt-4 pb-20 text-center text-xs text-muted-foreground">
          Sfat: în dialogul de tipărire alege „Salvează ca PDF” și dezactivează antetele/subsolurile browserului.
        </p>
      </main>
      <PrintToolbar backHref={docHref(doc.kind, doc.id)} label={doc.fullNumber} autoPrint={print === "1"} />
    </>
  );
}
