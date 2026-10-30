import { and, eq } from "drizzle-orm";
import { Truck } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page";
import { buildEtransportXml, ETRANSPORT_OPERATIONS } from "@/lib/anaf/etransport";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { documents, etransportDeclarations, partners } from "@/lib/db/schema";
import { DOC_KIND_LABELS } from "@/lib/constants";
import { todayIso } from "@/lib/format";
import { DeclarationActions, DeclarationDetail } from "./declaration-detail";

export const metadata = { title: "Declarație e-Transport" };

export default async function EtransportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("anaf");
  const decl = await db.query.etransportDeclarations.findFirst({
    where: and(eq(etransportDeclarations.id, id), eq(etransportDeclarations.companyId, ctx.company.id)),
  });
  if (!decl) notFound();

  const partner = decl.partnerId
    ? await db.query.partners.findFirst({
        where: and(eq(partners.id, decl.partnerId), eq(partners.companyId, ctx.company.id)),
        columns: { cui: true, country: true },
      })
    : null;

  const linkedDoc = decl.documentId
    ? await db.query.documents.findFirst({
        where: and(eq(documents.id, decl.documentId), eq(documents.companyId, ctx.company.id)),
        columns: { id: true, kind: true },
      })
    : null;

  // Pentru ciorne afișăm XML-ul care va fi transmis
  let xml = decl.xml;
  let xmlIsPreview = false;
  if (!xml) {
    try {
      xml = buildEtransportXml(ctx.company, { ...decl, partnerCui: partner?.cui ?? null, partnerCountry: partner?.country ?? "RO" });
      xmlIsPreview = true;
    } catch {
      xml = null;
    }
  }

  const { createdAt, updatedAt, ...rest } = decl;
  return (
    <>
      <PageHeader
        title={decl.uit ? `UIT ${decl.uit}` : "Declarație e-Transport"}
        description={`${ETRANSPORT_OPERATIONS[decl.operationType] ?? decl.operationType} · ${decl.partnerName ?? "partener necompletat"}`}
        icon={<Truck />}
        breadcrumbs={[{ label: "e-Transport", href: "/etransport" }, { label: decl.uit ?? "Ciornă" }]}
        actions={<DeclarationActions id={decl.id} status={decl.status} />}
      />
      <DeclarationDetail
        decl={{ ...rest, xml, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() }}
        partnerCui={partner?.cui ?? null}
        documentHref={linkedDoc ? `${DOC_KIND_LABELS[linkedDoc.kind].path}/${linkedDoc.id}` : null}
        xmlIsPreview={xmlIsPreview}
        today={todayIso()}
      />
    </>
  );
}
