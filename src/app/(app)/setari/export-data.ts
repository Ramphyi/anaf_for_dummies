import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";
import { db } from "@/lib/db";
import {
  documentLines,
  documents,
  partners,
  payments,
  products,
  projects,
  purchaseInvoices,
  stockDocuments,
  stockMovements,
  teamMembers,
  timeEntries,
  warehouses,
} from "@/lib/db/schema";
import { DOC_STATUS, EFACTURA_STATUS, PAYMENT_METHOD_LABELS, PURCHASE_STATUS, STOCK_DOC_LABELS } from "@/lib/constants";
import { displayStatus } from "@/lib/documents/status";
import { formatDate } from "@/lib/format";
import { round2, toCsv } from "@/lib/utils";

type Col = { key: string; label: string };
const BOM = "﻿";
const cols = (spec: [string, string][]): Col[] => spec.map(([key, label]) => ({ key, label }));

/** CSV cu toate facturile emise (inclusiv storno, ciorne și anulate — cu status). */
export async function invoicesCsv(companyId: string) {
  const rows = await db.query.documents.findMany({
    where: eq(documents.companyId, companyId),
    orderBy: [asc(documents.kind), asc(documents.issueDate), asc(documents.number)],
  });
  const kindLabel = { invoice: "Factură", proforma: "Proformă", notice: "Aviz" } as Record<string, string>;
  const data = rows
    .filter((d) => d.kind === "invoice")
    .map((d) => ({
      number: d.fullNumber,
      type: d.isCreditNote ? "Storno" : kindLabel[d.kind],
      date: formatDate(d.issueDate),
      due: formatDate(d.dueDate),
      client: d.clientName,
      cui: d.clientCui,
      regCom: d.clientRegCom,
      address: [d.clientAddress, d.clientCity, d.clientCounty].filter(Boolean).join(", "),
      country: d.clientCountry,
      currency: d.currency,
      rate: d.exchangeRate,
      subtotal: d.subtotal,
      vat: d.vatTotal,
      total: d.total,
      paid: d.paidAmount,
      remaining: round2(Math.max(0, d.total - d.paidAmount)),
      totalRon: round2(d.currency === "RON" ? d.total : d.total * d.exchangeRate),
      status: DOC_STATUS[displayStatus(d)]?.label ?? d.status,
      efactura: EFACTURA_STATUS[d.efacturaStatus]?.label ?? d.efacturaStatus,
      efacturaId: d.efacturaUploadId,
      notes: d.notes,
    }));
  return toCsv(
    data,
    cols([
      ["number", "Număr"],
      ["type", "Tip"],
      ["date", "Data emiterii"],
      ["due", "Scadența"],
      ["client", "Client"],
      ["cui", "CUI/CNP"],
      ["regCom", "Reg. Com."],
      ["address", "Adresă"],
      ["country", "Țara"],
      ["currency", "Valută"],
      ["rate", "Curs"],
      ["subtotal", "Valoare fără TVA"],
      ["vat", "TVA"],
      ["total", "Total"],
      ["paid", "Încasat"],
      ["remaining", "Rest de încasat"],
      ["totalRon", "Total RON"],
      ["status", "Status"],
      ["efactura", "e-Factura"],
      ["efacturaId", "Index încărcare SPV"],
      ["notes", "Mențiuni"],
    ]),
  );
}

/** Arhivă ZIP cu toate datele firmei în CSV (fără secrete: parole SMTP, token-uri ANAF). */
export async function allDataZip(companyId: string) {
  const [docs, parts, prods, pays, purch, projs, team, entries, whs, stockDocs, moves] = await Promise.all([
    db.query.documents.findMany({ where: eq(documents.companyId, companyId), orderBy: [asc(documents.issueDate)] }),
    db.query.partners.findMany({ where: eq(partners.companyId, companyId) }),
    db.query.products.findMany({ where: eq(products.companyId, companyId) }),
    db.query.payments.findMany({ where: eq(payments.companyId, companyId), orderBy: [asc(payments.date)] }),
    db.query.purchaseInvoices.findMany({ where: eq(purchaseInvoices.companyId, companyId), orderBy: [asc(purchaseInvoices.issueDate)] }),
    db.query.projects.findMany({ where: eq(projects.companyId, companyId) }),
    db.query.teamMembers.findMany({ where: eq(teamMembers.companyId, companyId) }),
    db.query.timeEntries.findMany({ where: eq(timeEntries.companyId, companyId), orderBy: [asc(timeEntries.date)] }),
    db.query.warehouses.findMany({ where: eq(warehouses.companyId, companyId) }),
    db.query.stockDocuments.findMany({ where: eq(stockDocuments.companyId, companyId), orderBy: [asc(stockDocuments.date)] }),
    db.query.stockMovements.findMany({ where: eq(stockMovements.companyId, companyId) }),
  ]);
  const docIds = docs.map((d) => d.id);
  const lines = docIds.length ? await db.select().from(documentLines).where(inArray(documentLines.documentId, docIds)) : [];
  const docNumber = new Map(docs.map((d) => [d.id, d.fullNumber]));
  const purchaseNumber = new Map(purch.map((p) => [p.id, p.number]));
  const productName = new Map(prods.map((p) => [p.id, p.name]));
  const memberName = new Map(team.map((m) => [m.id, m.name]));
  const projectName = new Map(projs.map((p) => [p.id, p.name]));
  const whName = new Map(whs.map((w) => [w.id, w.name]));
  const stockDocById = new Map(stockDocs.map((s) => [s.id, s]));

  const files: Record<string, string> = {
    "facturi.csv": await invoicesCsv(companyId),
    "proforme-avize.csv": toCsv(
      docs
        .filter((d) => d.kind !== "invoice")
        .map((d) => ({ kind: d.kind === "proforma" ? "Proformă" : "Aviz", number: d.fullNumber, date: formatDate(d.issueDate), client: d.clientName, currency: d.currency, total: d.total, status: DOC_STATUS[d.status]?.label ?? d.status })),
      cols([
        ["kind", "Tip"],
        ["number", "Număr"],
        ["date", "Data"],
        ["client", "Client"],
        ["currency", "Valută"],
        ["total", "Total"],
        ["status", "Status"],
      ]),
    ),
    "linii-documente.csv": toCsv(
      lines.map((l) => ({ ...l, document: docNumber.get(l.documentId) })),
      cols([
        ["document", "Document"],
        ["position", "Poziție"],
        ["name", "Denumire"],
        ["unit", "UM"],
        ["quantity", "Cantitate"],
        ["unitPrice", "Preț unitar fără TVA"],
        ["discountPercent", "Discount %"],
        ["vatCategory", "Categorie TVA"],
        ["vatRate", "Cota TVA"],
        ["netAmount", "Valoare netă"],
        ["vatAmount", "TVA"],
        ["totalAmount", "Total"],
      ]),
    ),
    "incasari-plati.csv": toCsv(
      pays.map((p) => ({
        ...p,
        date: formatDate(p.date),
        direction: p.direction === "in" ? "Încasare" : "Plată",
        method: PAYMENT_METHOD_LABELS[p.method] ?? p.method,
        document: p.documentId ? docNumber.get(p.documentId) : p.purchaseInvoiceId ? purchaseNumber.get(p.purchaseInvoiceId) : null,
        receipt: p.receiptNumber ? `${p.receiptSeries ?? ""}${p.receiptNumber}` : null,
      })),
      cols([
        ["date", "Data"],
        ["direction", "Tip"],
        ["partnerName", "Partener"],
        ["document", "Document"],
        ["method", "Metodă"],
        ["reference", "Referință"],
        ["receipt", "Chitanță"],
        ["currency", "Valută"],
        ["amount", "Sumă"],
        ["notes", "Observații"],
      ]),
    ),
    "cheltuieli.csv": toCsv(
      purch.map((p) => ({ ...p, issueDate: formatDate(p.issueDate), dueDate: formatDate(p.dueDate), status: PURCHASE_STATUS[p.status]?.label ?? p.status, project: p.projectId ? projectName.get(p.projectId) : null })),
      cols([
        ["number", "Număr"],
        ["issueDate", "Data"],
        ["dueDate", "Scadența"],
        ["supplierName", "Furnizor"],
        ["supplierCui", "CUI"],
        ["category", "Categorie"],
        ["currency", "Valută"],
        ["exchangeRate", "Curs"],
        ["subtotal", "Valoare fără TVA"],
        ["vatTotal", "TVA"],
        ["total", "Total"],
        ["paidAmount", "Plătit"],
        ["status", "Status"],
        ["project", "Proiect"],
        ["source", "Sursă"],
      ]),
    ),
    "parteneri.csv": toCsv(
      parts.map((p) => ({ ...p, kind: p.kind === "client" ? "Client" : p.kind === "supplier" ? "Furnizor" : "Client și furnizor", vatPayer: p.vatPayer ? "Da" : "Nu" })),
      cols([
        ["kind", "Tip"],
        ["name", "Denumire"],
        ["cui", "CUI/CNP"],
        ["regCom", "Reg. Com."],
        ["vatPayer", "Plătitor TVA"],
        ["address", "Adresă"],
        ["city", "Localitate"],
        ["county", "Județ"],
        ["country", "Țara"],
        ["email", "Email"],
        ["phone", "Telefon"],
        ["iban", "IBAN"],
        ["bank", "Banca"],
        ["contactPerson", "Persoană contact"],
        ["paymentTermDays", "Termen plată (zile)"],
      ]),
    ),
    "produse.csv": toCsv(
      prods.map((p) => ({ ...p, type: p.type === "product" ? "Produs" : "Serviciu", trackStock: p.trackStock ? "Da" : "Nu" })),
      cols([
        ["code", "Cod"],
        ["name", "Denumire"],
        ["type", "Tip"],
        ["unit", "UM"],
        ["price", "Preț"],
        ["currency", "Valută"],
        ["vatRate", "Cota TVA"],
        ["vatCategory", "Categorie TVA"],
        ["trackStock", "Gestiune stoc"],
        ["purchasePrice", "Preț achiziție"],
        ["ncCode", "Cod NC"],
      ]),
    ),
    "proiecte.csv": toCsv(
      projs,
      cols([
        ["code", "Cod"],
        ["name", "Denumire"],
        ["status", "Status"],
        ["billingType", "Tip facturare"],
        ["hourlyRate", "Tarif orar"],
        ["currency", "Valută"],
        ["budgetHours", "Buget ore"],
        ["budgetAmount", "Buget valoric"],
        ["monthlyRetainer", "Retainer lunar"],
        ["startDate", "Început"],
        ["endDate", "Sfârșit"],
      ]),
    ),
    "echipa.csv": toCsv(
      team.map((m) => ({ ...m, active: m.active ? "Da" : "Nu" })),
      cols([
        ["name", "Nume"],
        ["email", "Email"],
        ["position", "Poziție"],
        ["department", "Departament"],
        ["seniority", "Senioritate"],
        ["employmentType", "Tip contract"],
        ["hourlyCost", "Cost orar RON"],
        ["hourlyRate", "Tarif orar"],
        ["rateCurrency", "Valută tarif"],
        ["weeklyCapacity", "Capacitate săptămânală"],
        ["active", "Activ"],
      ]),
    ),
    "pontaj.csv": toCsv(
      entries.map((e) => ({ ...e, date: formatDate(e.date), member: memberName.get(e.memberId), project: projectName.get(e.projectId), billable: e.billable ? "Da" : "Nu" })),
      cols([
        ["date", "Data"],
        ["member", "Membru"],
        ["project", "Proiect"],
        ["hours", "Ore"],
        ["billable", "Facturabil"],
        ["status", "Status"],
        ["description", "Descriere"],
      ]),
    ),
    "stocuri-miscari.csv": toCsv(
      moves.map((m) => {
        const d = stockDocById.get(m.stockDocumentId);
        return {
          date: formatDate(m.date),
          document: d?.number,
          type: d ? (STOCK_DOC_LABELS[d.type]?.label ?? d.type) : "",
          product: productName.get(m.productId),
          warehouse: whName.get(m.warehouseId),
          quantity: m.quantity,
          unitCost: m.unitCost,
        };
      }),
      cols([
        ["date", "Data"],
        ["document", "Document"],
        ["type", "Tip"],
        ["product", "Produs"],
        ["warehouse", "Gestiune"],
        ["quantity", "Cantitate (+ intrare / − ieșire)"],
        ["unitCost", "Cost unitar"],
      ]),
    ),
  };

  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([name, csv]) => [name, strToU8(BOM + csv)])), { level: 6 });
  return Buffer.from(zip).toString("base64");
}
