import { and, eq, like, or } from "drizzle-orm";
import { getContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { documents, partners, products, projects } from "@/lib/db/schema";
import { DOC_KIND_LABELS } from "@/lib/constants";
import { formatMoney } from "@/lib/format";

/** Căutare globală pentru command palette (⌘K). */
export async function GET(request: Request) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ hits: [] }, { status: 401 });
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return Response.json({ hits: [] });
  const pattern = `%${q}%`;
  const cid = ctx.company.id;

  const [docs, parts, prods, projs] = await Promise.all([
    db.query.documents.findMany({
      where: and(eq(documents.companyId, cid), or(like(documents.fullNumber, pattern), like(documents.clientName, pattern))),
      limit: 6,
      orderBy: (d, { desc }) => [desc(d.issueDate)],
    }),
    db.query.partners.findMany({
      where: and(eq(partners.companyId, cid), or(like(partners.name, pattern), like(partners.cui, pattern))),
      limit: 5,
    }),
    db.query.products.findMany({
      where: and(eq(products.companyId, cid), or(like(products.name, pattern), like(products.code, pattern))),
      limit: 4,
    }),
    db.query.projects.findMany({
      where: and(eq(projects.companyId, cid), or(like(projects.name, pattern), like(projects.code, pattern))),
      limit: 4,
    }),
  ]);

  const hits = [
    ...docs.map((d) => ({
      type: "invoice" as const,
      id: d.id,
      title: `${d.isCreditNote ? "Storno" : DOC_KIND_LABELS[d.kind].one} ${d.fullNumber}`,
      subtitle: `${d.clientName} · ${formatMoney(d.total, d.currency)}`,
      href: `${DOC_KIND_LABELS[d.kind].path}/${d.id}`,
    })),
    ...parts.map((p) => ({
      type: "client" as const,
      id: p.id,
      title: p.name,
      subtitle: `${p.kind === "supplier" ? "Furnizor" : "Client"}${p.cui ? ` · CUI ${p.cui}` : ""}`,
      href: p.kind === "supplier" ? `/furnizori/${p.id}` : `/clienti/${p.id}`,
    })),
    ...prods.map((p) => ({
      type: "product" as const,
      id: p.id,
      title: p.name,
      subtitle: `${p.code ?? ""} ${formatMoney(p.price, p.currency)} / ${p.unit}`.trim(),
      href: `/produse?id=${p.id}`,
    })),
    ...projs.map((p) => ({ type: "project" as const, id: p.id, title: p.name, subtitle: p.code ?? "Proiect", href: `/proiecte/${p.id}` })),
  ];
  return Response.json({ hits });
}
