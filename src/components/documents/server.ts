import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { generateInvoiceXml } from "@/lib/anaf/service";
import { db } from "@/lib/db";
import {
  companies,
  documents,
  documentSeries,
  exchangeRates,
  partners,
  products,
  projects,
  warehouses,
  type Company,
  type DocKind,
  type Document,
  type Partner,
  type Product,
} from "@/lib/db/schema";
import { getDocument } from "@/lib/documents/server";
import { remaining } from "@/lib/documents/status";
import { formatDate, formatMoney } from "@/lib/format";
import { logActivity, type Actor } from "@/lib/server/activity";
import { emailLayout, sendMail } from "@/lib/server/email";
import { KIND_META, type PartnerOption, type ProductOption, type SeriesOption } from "./shared";

export function toPartnerOption(p: Partner): PartnerOption {
  return {
    id: p.id,
    name: p.name,
    cui: p.cui,
    entityType: p.entityType,
    vatPayer: p.vatPayer,
    country: p.country,
    city: p.city,
    email: p.email,
    paymentTermDays: p.paymentTermDays,
    defaultCurrency: p.defaultCurrency,
  };
}

export function toProductOption(p: Product): ProductOption {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    unit: p.unit,
    price: p.price,
    currency: p.currency,
    vatRate: p.vatRate,
    vatCategory: p.vatCategory,
    priceIncludesVat: p.priceIncludesVat,
    type: p.type,
  };
}

/** Nomenclatoarele necesare editorului de documente. */
export async function loadEditorData(companyId: string, kind: DocKind | "recurring") {
  const seriesType = kind === "recurring" ? "invoice" : kind;
  const [partnerRows, productRows, seriesRows, warehouseRows, projectRows] = await Promise.all([
    db.query.partners.findMany({
      where: and(eq(partners.companyId, companyId), inArray(partners.kind, ["client", "both"]), eq(partners.active, true)),
      orderBy: asc(partners.name),
    }),
    db.query.products.findMany({ where: and(eq(products.companyId, companyId), eq(products.active, true)), orderBy: asc(products.name) }),
    db.query.documentSeries.findMany({
      where: and(eq(documentSeries.companyId, companyId), eq(documentSeries.type, seriesType), eq(documentSeries.active, true)),
      orderBy: asc(documentSeries.prefix),
    }),
    db.query.warehouses.findMany({ where: eq(warehouses.companyId, companyId), orderBy: asc(warehouses.name) }),
    db.query.projects.findMany({
      where: and(eq(projects.companyId, companyId), inArray(projects.status, ["planning", "active", "on_hold"])),
      orderBy: asc(projects.name),
      columns: { id: true, name: true, clientId: true, code: true, color: true },
    }),
  ]);
  return {
    partners: partnerRows.map(toPartnerOption),
    products: productRows.map(toProductOption),
    series: seriesRows.map<SeriesOption>((s) => ({ id: s.id, prefix: s.prefix, nextNumber: s.nextNumber, padding: s.padding, isDefault: s.isDefault })),
    warehouses: warehouseRows.map((w) => ({ id: w.id, name: w.name, isDefault: w.isDefault })),
    projects: projectRows,
  };
}

/** Ultimele cursuri BNR cunoscute (din cache), RON per unitate de valută. */
export async function latestRates(): Promise<Record<string, number>> {
  const rows = await db.select().from(exchangeRates).orderBy(desc(exchangeRates.date)).limit(400);
  const out: Record<string, number> = { RON: 1 };
  for (const r of rows) if (!(r.currency in out)) out[r.currency] = r.rate;
  return out;
}

/** Titlul paginii pentru un document (generateMetadata). */
export async function documentTitle(companyId: string | undefined, id: string, fallback: string) {
  if (!companyId) return fallback;
  const d = await db.query.documents.findFirst({
    where: and(eq(documents.id, id), eq(documents.companyId, companyId)),
    columns: { fullNumber: true, kind: true, isCreditNote: true },
  });
  return d ? `${d.isCreditNote ? "Storno" : KIND_META[d.kind].one} ${d.fullNumber}` : fallback;
}

export function companyDefaults(c: Company) {
  return { vatPayer: c.vatPayer, defaultDueDays: c.defaultDueDays, defaultVatRate: c.defaultVatRate, defaultCurrency: c.defaultCurrency, country: c.country };
}

/** Invalidează paginile afectate de modificarea unui document (inclusiv contoarele din sidebar). */
export function revalidateDocument(kind: DocKind, id?: string | null) {
  const base = KIND_META[kind].path;
  revalidatePath(base);
  if (id) revalidatePath(`${base}/${id}`);
  revalidatePath("/incasari");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
}

/* ------------------------------------------------------------------ */
/* Email                                                               */
/* ------------------------------------------------------------------ */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function defaultEmailFor(
  company: Pick<Company, "name">,
  doc: Pick<Document, "kind" | "fullNumber" | "isCreditNote" | "total" | "currency" | "dueDate" | "clientName">,
) {
  const title = doc.isCreditNote ? "Factura storno" : doc.kind === "invoice" ? "Factura" : doc.kind === "proforma" ? "Factura proformă" : "Avizul de însoțire";
  const subject = `${title} ${doc.fullNumber} — ${company.name}`;
  const due = doc.kind === "invoice" && doc.dueDate && !doc.isCreditNote ? `, cu scadența la ${formatDate(doc.dueDate)}` : "";
  const message = `Bună ziua,\n\nVă transmitem atașat ${title.toLowerCase()} ${doc.fullNumber} în valoare de ${formatMoney(doc.total, doc.currency)}${due}.\n\nVă mulțumim pentru colaborare!\n${company.name}`;
  return { subject, message };
}

function emailBody(company: Company, doc: NonNullable<Awaited<ReturnType<typeof getDocument>>>, message: string) {
  const meta = KIND_META[doc.kind];
  const color = company.brandColor || "#6d5dfc";
  const row = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:6px 0;color:#666">${label}</td><td style="padding:6px 0;text-align:right;${strong ? "font-weight:700;font-size:16px;color:#111" : "color:#111"}">${value}</td></tr>`;
  const lines = doc.lines
    .slice(0, 12)
    .map(
      (l) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${esc(l.name)}<div style="color:#888;font-size:12px">${l.quantity} ${esc(l.unit)} × ${formatMoney(l.unitPrice, doc.currency)}</div></td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${formatMoney(l.totalAmount, doc.currency)}</td></tr>`,
    )
    .join("");
  const rest = remaining(doc);
  return `
<p style="margin:0 0 16px">${esc(message).replace(/\n/g, "<br>")}</p>
<div style="margin:20px 0;padding:18px 20px;border-radius:12px;background:#f7f7fb;border:1px solid #ececf3">
  <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${color};font-weight:700">${doc.isCreditNote ? "Factură storno" : meta.printTitle}</div>
  <div style="font-size:20px;font-weight:700;margin:4px 0 12px">${esc(doc.fullNumber)}</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
    ${row("Data emiterii", formatDate(doc.issueDate))}
    ${doc.kind === "invoice" && doc.dueDate ? row("Scadență", formatDate(doc.dueDate)) : ""}
    ${row("Total", formatMoney(doc.total, doc.currency), true)}
    ${doc.kind === "invoice" && doc.paidAmount > 0 && rest > 0 ? row("Rest de plată", formatMoney(rest, doc.currency)) : ""}
  </table>
</div>
<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:16px">${lines}</table>
${company.iban && doc.kind !== "notice" ? `<p style="margin:16px 0 0;font-size:13px;color:#555">Plata se poate efectua în contul <strong>${esc(company.iban)}</strong>${company.bank ? ` deschis la ${esc(company.bank)}` : ""}.</p>` : ""}`;
}

/** Trimite documentul pe email (rezumat HTML + XML UBL atașat pentru facturi). */
export async function sendDocumentEmail(actor: Actor, documentId: string, opts: { to: string[]; subject?: string; message?: string }) {
  const company = await db.query.companies.findFirst({ where: eq(companies.id, actor.companyId) });
  const doc = await getDocument(actor.companyId, documentId);
  if (!company || !doc) throw new Error("Documentul nu există.");
  if (doc.status === "draft") throw new Error("Emite documentul înainte de a-l trimite pe email.");
  const to = opts.to.map((t) => t.trim()).filter(Boolean);
  if (!to.length) throw new Error("Adaugă cel puțin un destinatar.");
  const defaults = defaultEmailFor(company, doc);
  const attachments: { filename: string; content: string; contentType: string }[] = [];
  if (doc.kind === "invoice") {
    const { xml } = await generateInvoiceXml(actor.companyId, documentId);
    attachments.push({ filename: `${doc.fullNumber}.xml`, content: xml, contentType: "application/xml" });
  }
  await sendMail(company, {
    to,
    subject: opts.subject?.trim() || defaults.subject,
    html: emailLayout(company, emailBody(company, doc, opts.message?.trim() || defaults.message)),
    text: opts.message?.trim() || defaults.message,
    attachments,
  });
  await db.update(documents).set({ sentByEmailAt: new Date() }).where(eq(documents.id, doc.id));
  await logActivity(actor, {
    entity: "document",
    entityId: doc.id,
    action: "emailed",
    message: `${KIND_META[doc.kind].one} ${doc.fullNumber} — trimis pe email către ${to.join(", ")}`,
  });
}
