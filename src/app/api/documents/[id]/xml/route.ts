import { and, eq } from "drizzle-orm";
import { generateInvoiceXml } from "@/lib/anaf/service";
import { can, getContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";

const safeName = (s: string) => s.replace(/[^\w.-]+/g, "_");

/** Descarcă XML-ul UBL (CIUS-RO) al unei facturi: versiunea transmisă în SPV, dacă există. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return new Response("Neautentificat", { status: 401 });
  if (!can(ctx, "billing") && !can(ctx, "anaf")) return new Response("Acces interzis", { status: 403 });
  const { id } = await params;
  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, id), eq(documents.companyId, ctx.company.id)),
    columns: { kind: true, fullNumber: true, efacturaXml: true, efacturaStatus: true },
  });
  if (!doc) return new Response("Documentul nu există", { status: 404 });
  if (doc.kind !== "invoice") return new Response("Doar facturile au XML e-Factura", { status: 400 });
  const xml = doc.efacturaXml && doc.efacturaStatus !== "none" ? doc.efacturaXml : (await generateInvoiceXml(ctx.company.id, id)).xml;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName(doc.fullNumber)}.xml"`,
      "Cache-Control": "no-store",
    },
  });
}
