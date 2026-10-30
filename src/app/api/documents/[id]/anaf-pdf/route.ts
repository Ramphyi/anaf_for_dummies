import { and, eq } from "drizzle-orm";
import { xmlToPdf } from "@/lib/anaf/client";
import { generateInvoiceXml } from "@/lib/anaf/service";
import { can, getContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";

const safeName = (s: string) => s.replace(/[^\w.-]+/g, "_");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function errorPage(title: string, message: string, status: number) {
  const html = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f6fa;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0d0d18">
<div style="max-width:480px;padding:28px;margin:16px;background:#fff;border:1px solid #e5e5ee;border-radius:16px;box-shadow:0 16px 40px -12px rgba(30,30,60,.18)">
<p style="margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#e11d48">PDF ANAF indisponibil</p>
<h1 style="margin:0 0 10px;font-size:20px">${esc(title)}</h1>
<p style="margin:0;color:#66667d;font-size:14px;line-height:1.6">${esc(message)}</p>
<p style="margin:16px 0 0;font-size:13px;color:#66667d">Poți folosi în schimb varianta „Tipărește / PDF” din pagina facturii.</p>
</div></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/** PDF-ul oficial generat de serviciul public ANAF (transformare XML → PDF). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return new Response("Neautentificat", { status: 401 });
  if (!can(ctx, "billing") && !can(ctx, "anaf")) return new Response("Acces interzis", { status: 403 });
  const { id } = await params;
  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, id), eq(documents.companyId, ctx.company.id)),
    columns: { kind: true, fullNumber: true, efacturaXml: true, efacturaStatus: true, status: true },
  });
  if (!doc) return errorPage("Document inexistent", "Factura nu a fost găsită sau nu ai acces la ea.", 404);
  if (doc.kind !== "invoice" || doc.status === "draft") return errorPage("Document neeligibil", "PDF-ul ANAF se poate genera doar pentru facturi emise.", 400);
  try {
    const xml = doc.efacturaXml && doc.efacturaStatus !== "none" ? doc.efacturaXml : (await generateInvoiceXml(ctx.company.id, id)).xml;
    const pdf = await xmlToPdf(ctx.company.id, xml);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeName(doc.fullNumber)}_ANAF.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorPage(`Factura ${doc.fullNumber}`, err instanceof Error ? err.message : "Serviciul ANAF nu a răspuns.", 502);
  }
}
