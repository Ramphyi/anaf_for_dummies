/**
 * Generator XML e-Factura: UBL 2.1 conform CIUS-RO 1.0.1 (EN 16931).
 * Ordinea elementelor respectă XSD-ul UBL — ANAF respinge fișierele cu ordine greșită.
 */
import { BUCHAREST_SECTORS, PAYMENT_MEANS_CODE, unitCode, VAT_EXEMPTION_CODES, vatExemptionReason } from "@/lib/constants";
import { computeTotals, type LineInput } from "@/lib/documents/totals";
import { normalizeCui, round2 } from "@/lib/utils";

export const CIUS_RO_CUSTOMIZATION = "urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1";

export type UblParty = {
  name: string;
  cui?: string | null; // CUI fără RO / CNP pentru persoane fizice
  regCom?: string | null;
  vatPayer: boolean;
  entityType?: "pj" | "pf";
  address?: string | null;
  city?: string | null;
  county?: string | null; // cod ISO (B, CJ...)
  country?: string | null;
  postalCode?: string | null;
  email?: string | null;
  phone?: string | null;
  /** BT-33: informații juridice suplimentare ale furnizorului (ex. capitalul social — Legea 31/1990 art. 74). */
  legalInfo?: string | null;
};

export type UblLine = LineInput & {
  name: string;
  description?: string | null;
  unit: string;
  code?: string | null;
};

export type UblInput = {
  number: string;
  issueDate: string;
  dueDate?: string | null;
  deliveryDate?: string | null;
  typeCode?: "380" | "381" | "384" | "389" | "751";
  currency: string;
  exchangeRate?: number;
  notes?: (string | null | undefined)[];
  billingReference?: { number: string; issueDate?: string | null } | null;
  supplier: UblParty & { iban?: string | null; bank?: string | null };
  customer: UblParty;
  paymentMethod?: string | null;
  vatOnCollection?: boolean;
  lines: UblLine[];
};

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const clip = (s: string | null | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const amt = (n: number) => round2(n).toFixed(2);
const qty = (n: number) => String(Math.round(n * 1000) / 1000);
const price = (n: number) => {
  const r = Math.round(n * 10000) / 10000;
  return r.toFixed(Math.max(2, (String(r).split(".")[1] ?? "").length));
};

/** Pentru București, CIUS-RO cere CityName = SECTOR1..SECTOR6 (BR-RO-100). */
export function ublCityName(party: Pick<UblParty, "city" | "county" | "address">): string {
  if (party.county === "B") {
    const m = `${party.city ?? ""} ${party.address ?? ""}`.match(/sector(?:ul)?\s*([1-6])/i);
    return m ? `SECTOR${m[1]}` : BUCHAREST_SECTORS[0];
  }
  return clip(party.city, 50) || "-";
}

function addressXml(p: UblParty, tag: "PostalAddress" | "Address" = "PostalAddress") {
  const country = (p.country || "RO").toUpperCase();
  const isRo = country === "RO";
  return [
    `<cac:${tag}>`,
    `<cbc:StreetName>${esc(clip(p.address, 150) || clip(p.city, 150) || "-")}</cbc:StreetName>`,
    `<cbc:CityName>${esc(isRo ? ublCityName(p) : clip(p.city, 50) || "-")}</cbc:CityName>`,
    p.postalCode ? `<cbc:PostalZone>${esc(clip(p.postalCode, 20))}</cbc:PostalZone>` : "",
    isRo && p.county ? `<cbc:CountrySubentity>RO-${esc(p.county)}</cbc:CountrySubentity>` : "",
    // BR-RO-210: adresa de livrare cere subdiviziunea țării și în străinătate — folosim localitatea.
    !isRo && tag === "Address" ? `<cbc:CountrySubentity>${esc(clip(p.city, 50) || country)}</cbc:CountrySubentity>` : "",
    `<cac:Country><cbc:IdentificationCode>${esc(country)}</cbc:IdentificationCode></cac:Country>`,
    `</cac:${tag}>`,
  ].join("");
}

function partyXml(p: UblParty, role: "supplier" | "customer", allowVatId: boolean) {
  const country = (p.country || "RO").toUpperCase();
  const cui = normalizeCui(p.cui);
  const isPf = p.entityType === "pf";
  const vatId = p.vatPayer && cui && allowVatId ? (country === "RO" ? `RO${cui}` : (p.cui ?? "").toUpperCase().replace(/\s/g, "")) : null;
  // BT-30 / BT-47: identificator legal. PF fără CNP → 13 zerouri (conform ANAF pentru B2C).
  let legalId: string | null;
  if (isPf) legalId = /^\d{13}$/.test(p.cui ?? "") ? p.cui! : "0000000000000";
  else if (country !== "RO") legalId = (p.cui ?? "").toUpperCase().replace(/\s/g, "") || null; // străini: codul complet, cu prefixul țării
  else if (role === "supplier") legalId = vatId ? p.regCom || cui : cui || p.regCom || null;
  else legalId = cui || p.regCom || null;

  return [
    "<cac:Party>",
    addressXml(p),
    vatId
      ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(vatId)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`
      : "",
    "<cac:PartyLegalEntity>",
    `<cbc:RegistrationName>${esc(clip(p.name, 200))}</cbc:RegistrationName>`,
    legalId ? `<cbc:CompanyID>${esc(legalId)}</cbc:CompanyID>` : "",
    role === "supplier" && p.legalInfo ? `<cbc:CompanyLegalForm>${esc(clip(p.legalInfo, 200))}</cbc:CompanyLegalForm>` : "",
    "</cac:PartyLegalEntity>",
    p.email || p.phone
      ? `<cac:Contact>${p.phone ? `<cbc:Telephone>${esc(clip(p.phone, 100))}</cbc:Telephone>` : ""}${p.email ? `<cbc:ElectronicMail>${esc(clip(p.email, 100))}</cbc:ElectronicMail>` : ""}</cac:Contact>`
      : "",
    "</cac:Party>",
  ].join("");
}

function taxCategoryXml(tag: "TaxCategory" | "ClassifiedTaxCategory", category: string, rate: number, withExemption: boolean, supplierVatPayer = true) {
  const code = VAT_EXEMPTION_CODES[category]?.code;
  return [
    `<cac:${tag}>`,
    `<cbc:ID>${category}</cbc:ID>`,
    category === "O" ? "" : `<cbc:Percent>${rate}</cbc:Percent>`,
    withExemption && code
      ? `<cbc:TaxExemptionReasonCode>${code}</cbc:TaxExemptionReasonCode><cbc:TaxExemptionReason>${esc(vatExemptionReason(category, supplierVatPayer))}</cbc:TaxExemptionReason>`
      : "",
    "<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>",
    `</cac:${tag}>`,
  ].join("");
}

export function buildUblInvoice(input: UblInput): string {
  const cur = input.currency || "RON";
  // Furnizor neplătitor de TVA → toate liniile în categoria O.
  const lines = input.lines.map((l) =>
    input.supplier.vatPayer ? { ...l, vatCategory: l.vatCategory ?? "S" } : { ...l, vatCategory: "O", vatRate: 0 },
  );
  const totals = computeTotals(lines);
  const hasO = lines.some((l) => l.vatCategory === "O");
  const allowVatIds = !hasO;
  // BT-72 data livrării (art. 319 alin. (20) lit. c); la livrări intracomunitare și țara livrării (BR-IC-11/12).
  const hasK = lines.some((l) => l.vatCategory === "K");
  const deliveryDate = input.deliveryDate || (hasK ? input.issueDate : null);
  const delivery =
    deliveryDate || hasK
      ? `<cac:Delivery>${deliveryDate ? `<cbc:ActualDeliveryDate>${deliveryDate}</cbc:ActualDeliveryDate>` : ""}${hasK ? `<cac:DeliveryLocation>${addressXml(input.customer, "Address")}</cac:DeliveryLocation>` : ""}</cac:Delivery>`
      : "";

  const notes = [...(input.notes ?? []), input.vatOnCollection ? "TVA la încasare" : null]
    .filter((n): n is string => !!n && !!n.trim())
    .slice(0, 20)
    .map((n) => `<cbc:Note>${esc(clip(n, 300))}</cbc:Note>`)
    .join("");

  const taxSubtotals = totals.breakdown
    .map(
      (b) =>
        `<cac:TaxSubtotal><cbc:TaxableAmount currencyID="${cur}">${amt(b.taxable)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="${cur}">${amt(b.vat)}</cbc:TaxAmount>${taxCategoryXml("TaxCategory", b.category, b.rate, true, input.supplier.vatPayer)}</cac:TaxSubtotal>`,
    )
    .join("");

  const lineXml = lines
    .map((l, i) => {
      const t = totals.lines[i];
      const negative = l.quantity < 0;
      const useAllowance = t.discountAmount > 0 && !negative;
      const unitPrice = t.discountAmount > 0 && negative ? Math.abs(t.netAmount / l.quantity) : l.unitPrice;
      return [
        "<cac:InvoiceLine>",
        `<cbc:ID>${i + 1}</cbc:ID>`,
        `<cbc:InvoicedQuantity unitCode="${unitCode(l.unit)}">${qty(l.quantity)}</cbc:InvoicedQuantity>`,
        `<cbc:LineExtensionAmount currencyID="${cur}">${amt(t.netAmount)}</cbc:LineExtensionAmount>`,
        useAllowance
          ? `<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:AllowanceChargeReasonCode>95</cbc:AllowanceChargeReasonCode><cbc:AllowanceChargeReason>Discount</cbc:AllowanceChargeReason><cbc:Amount currencyID="${cur}">${amt(t.discountAmount)}</cbc:Amount></cac:AllowanceCharge>`
          : "",
        "<cac:Item>",
        l.description ? `<cbc:Description>${esc(clip(l.description, 200))}</cbc:Description>` : "",
        `<cbc:Name>${esc(clip(l.name, 100))}</cbc:Name>`,
        l.code ? `<cac:SellersItemIdentification><cbc:ID>${esc(clip(l.code, 100))}</cbc:ID></cac:SellersItemIdentification>` : "",
        taxCategoryXml("ClassifiedTaxCategory", l.vatCategory ?? "S", l.vatCategory === "S" ? l.vatRate : 0, false),
        "</cac:Item>",
        `<cac:Price><cbc:PriceAmount currencyID="${cur}">${price(unitPrice)}</cbc:PriceAmount></cac:Price>`,
        "</cac:InvoiceLine>",
      ].join("");
    })
    .join("");

  const paymentCode = PAYMENT_MEANS_CODE[input.paymentMethod ?? "bank"] ?? "30";
  const paymentMeans =
    input.supplier.iban || paymentCode !== "30"
      ? `<cac:PaymentMeans><cbc:PaymentMeansCode>${paymentCode}</cbc:PaymentMeansCode>${
          input.supplier.iban
            ? `<cac:PayeeFinancialAccount><cbc:ID>${esc(input.supplier.iban.replace(/\s/g, ""))}</cbc:ID>${input.supplier.bank ? `<cbc:Name>${esc(clip(input.supplier.bank, 100))}</cbc:Name>` : ""}</cac:PayeeFinancialAccount>`
            : ""
        }</cac:PaymentMeans>`
      : "";

  const sumNet = totals.subtotal;
  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`,
    `<cbc:CustomizationID>${CIUS_RO_CUSTOMIZATION}</cbc:CustomizationID>`,
    `<cbc:ID>${esc(clip(input.number, 200))}</cbc:ID>`,
    `<cbc:IssueDate>${input.issueDate}</cbc:IssueDate>`,
    input.dueDate ? `<cbc:DueDate>${input.dueDate}</cbc:DueDate>` : "",
    `<cbc:InvoiceTypeCode>${input.typeCode ?? "380"}</cbc:InvoiceTypeCode>`,
    notes,
    `<cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>`,
    cur !== "RON" ? `<cbc:TaxCurrencyCode>RON</cbc:TaxCurrencyCode>` : "",
    input.billingReference
      ? `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${esc(input.billingReference.number)}</cbc:ID>${input.billingReference.issueDate ? `<cbc:IssueDate>${input.billingReference.issueDate}</cbc:IssueDate>` : ""}</cac:InvoiceDocumentReference></cac:BillingReference>`
      : "",
    `<cac:AccountingSupplierParty>${partyXml(input.supplier, "supplier", allowVatIds)}</cac:AccountingSupplierParty>`,
    `<cac:AccountingCustomerParty>${partyXml(input.customer, "customer", allowVatIds)}</cac:AccountingCustomerParty>`,
    delivery,
    paymentMeans,
    input.dueDate ? `<cac:PaymentTerms><cbc:Note>Termen de plată: ${input.dueDate}</cbc:Note></cac:PaymentTerms>` : "",
    `<cac:TaxTotal><cbc:TaxAmount currencyID="${cur}">${amt(totals.vatTotal)}</cbc:TaxAmount>${taxSubtotals}</cac:TaxTotal>`,
    cur !== "RON"
      ? `<cac:TaxTotal><cbc:TaxAmount currencyID="RON">${amt(totals.vatTotal * (input.exchangeRate || 1))}</cbc:TaxAmount></cac:TaxTotal>`
      : "",
    "<cac:LegalMonetaryTotal>",
    `<cbc:LineExtensionAmount currencyID="${cur}">${amt(sumNet)}</cbc:LineExtensionAmount>`,
    `<cbc:TaxExclusiveAmount currencyID="${cur}">${amt(sumNet)}</cbc:TaxExclusiveAmount>`,
    `<cbc:TaxInclusiveAmount currencyID="${cur}">${amt(totals.total)}</cbc:TaxInclusiveAmount>`,
    `<cbc:PayableAmount currencyID="${cur}">${amt(totals.total)}</cbc:PayableAmount>`,
    "</cac:LegalMonetaryTotal>",
    lineXml,
    "</Invoice>",
  ].join("");
  return xml;
}

/** Validări locale rapide (înainte de trimiterea la ANAF) — mesaje în română. */
export function prevalidateUbl(input: UblInput): string[] {
  const errors: string[] = [];
  const s = input.supplier;
  const c = input.customer;
  if (!normalizeCui(s.cui)) errors.push("Firma emitentă nu are CUI completat (Setări → Date firmă).");
  if (!s.address) errors.push("Firma emitentă nu are adresa completată (Setări → Date firmă).");
  if ((s.country ?? "RO") === "RO" && !s.county) errors.push("Firma emitentă nu are județul completat (Setări → Date firmă).");
  if (!c.name) errors.push("Clientul nu are denumire.");
  if (!c.address && !c.city) errors.push(`Clientul „${c.name}” nu are adresă — obligatorie în e-Factura.`);
  if ((c.country ?? "RO") === "RO" && !c.county) errors.push(`Clientul „${c.name}” nu are județul completat.`);
  if ((c.country ?? "RO") === "RO" && c.entityType !== "pf" && !normalizeCui(c.cui))
    errors.push(`Clientul „${c.name}” nu are CUI — obligatoriu pentru persoane juridice.`);
  if (!input.lines.length) errors.push("Factura nu are linii.");
  const cats = new Set(input.lines.map((l) => l.vatCategory ?? "S"));
  if (s.vatPayer && (cats.has("K") || cats.has("AE")) && !(c.cui ?? "").trim())
    errors.push(`Clientul „${c.name}” nu are cod de TVA — obligatoriu la taxare inversă și livrări intracomunitare.`);
  if (s.vatPayer && cats.has("K") && (c.country ?? "RO") === "RO")
    errors.push("Livrarea intracomunitară (categoria K) se face doar către un client din alt stat UE.");
  input.lines.forEach((l, i) => {
    if (!l.name?.trim()) errors.push(`Linia ${i + 1} nu are denumire.`);
    if (l.unitPrice < 0) errors.push(`Linia ${i + 1}: prețul unitar nu poate fi negativ (folosește cantitate negativă pentru storno).`);
  });
  if (input.currency !== "RON" && !(input.exchangeRate && input.exchangeRate > 0))
    errors.push("Pentru facturile în valută este necesar cursul de schimb.");
  return errors;
}
