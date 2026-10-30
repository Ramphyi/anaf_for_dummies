import "server-only";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { AppContext } from "@/lib/auth/session";
import { unitCode } from "@/lib/constants";
import { db } from "@/lib/db";
import { documents, partners, products } from "@/lib/db/schema";
import { todayIso } from "@/lib/format";
import { round2 } from "@/lib/utils";
import type { EtransportInput } from "./actions";

export type FormPartner = { id: string; name: string; cui: string | null; country: string; county: string | null; city: string | null; address: string | null; kind: string };
export type FormProduct = { id: string; name: string; ncCode: string | null; unit: string; price: number; currency: string };
export type FormDocument = { id: string; label: string; description: string };
export type FormCompany = { name: string; cui: string; county: string | null; city: string | null; address: string | null };

/** Nomenclatoarele necesare formularului e-Transport. */
export async function loadFormData(ctx: AppContext) {
  const cid = ctx.company.id;
  const [partnerRows, productRows, docRows] = await Promise.all([
    db.query.partners.findMany({
      where: and(eq(partners.companyId, cid), eq(partners.active, true)),
      columns: { id: true, name: true, cui: true, country: true, county: true, city: true, address: true, kind: true },
      orderBy: partners.name,
    }),
    db.query.products.findMany({
      where: and(eq(products.companyId, cid), eq(products.active, true), eq(products.type, "product")),
      columns: { id: true, name: true, ncCode: true, unit: true, price: true, currency: true },
      orderBy: products.name,
    }),
    db.query.documents.findMany({
      where: and(eq(documents.companyId, cid), inArray(documents.kind, ["invoice", "notice"]), ne(documents.status, "draft"), ne(documents.status, "cancelled")),
      columns: { id: true, kind: true, fullNumber: true, clientName: true, issueDate: true },
      orderBy: desc(documents.issueDate),
      limit: 150,
    }),
  ]);
  const company: FormCompany = { name: ctx.company.name, cui: ctx.company.cui, county: ctx.company.county, city: ctx.company.city, address: ctx.company.address };
  return {
    partners: partnerRows as FormPartner[],
    products: productRows as FormProduct[],
    documents: docRows.map<FormDocument>((d) => ({
      id: d.id,
      label: `${d.kind === "notice" ? "Aviz" : "Factură"} ${d.fullNumber}`,
      description: `${d.clientName} · ${d.issueDate.split("-").reverse().join(".")}`,
    })),
    company,
  };
}

export function emptyDeclaration(company: FormCompany): EtransportInput {
  return {
    operationType: "30",
    transportDate: todayIso(),
    startCounty: company.county,
    startCity: company.city,
    startAddress: company.address,
    items: [],
  };
}

/** Pre-completare din factură / aviz: partener, linii (cod NC din produs), valori în RON, număr document. */
export async function declarationFromDocument(ctx: AppContext, documentId: string, company: FormCompany) {
  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, documentId), eq(documents.companyId, ctx.company.id)),
    with: { lines: { with: { product: true } } },
  });
  if (!doc) return null;
  const sorted = [...doc.lines].sort((a, b) => a.position - b.position);
  const goods = sorted.filter((l) => !l.product || l.product.type === "product");
  const source = goods.length ? goods : sorted;
  const input: EtransportInput = {
    ...emptyDeclaration(company),
    partnerId: doc.partnerId,
    partnerName: doc.clientName,
    endCounty: doc.clientCounty,
    endCity: doc.clientCity,
    endAddress: doc.clientAddress,
    documentId: doc.id,
    documentNumber: doc.fullNumber,
    items: source.map((l) => ({
      name: l.name,
      ncCode: l.product?.ncCode ?? "",
      quantity: Math.abs(l.quantity),
      unitCode: unitCode(l.unit),
      netWeight: 0,
      grossWeight: 0,
      valueRon: round2(Math.abs(l.netAmount) * (doc.exchangeRate || 1)),
      purposeCode: "101",
    })),
  };
  return { input, servicesOnly: !goods.length && sorted.length > 0, label: `${doc.kind === "notice" ? "avizul" : "factura"} ${doc.fullNumber}` };
}
