import { XMLParser } from "fast-xml-parser";
import { countyFromName, UNITS } from "@/lib/constants";
import { normalizeCui, round2 } from "@/lib/utils";

/** Rezultatul parsării unei facturi UBL (Invoice sau CreditNote) primite prin SPV. */
export type ParsedUbl = {
  kind: "invoice" | "credit_note";
  number: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  notes: string[];
  supplier: ParsedParty;
  customer: ParsedParty;
  subtotal: number;
  vatTotal: number;
  total: number;
  payable: number;
  iban: string | null;
  lines: {
    name: string;
    description: string | null;
    quantity: number;
    unit: string;
    unitPrice: number;
    netAmount: number;
    vatRate: number;
    vatCategory: string;
  }[];
};

export type ParsedParty = {
  name: string;
  cui: string | null;
  vatId: string | null;
  regCom: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  country: string;
  email: string | null;
  phone: string | null;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  textNodeName: "#text",
  isArray: (name) => ["InvoiceLine", "CreditNoteLine", "Note", "TaxSubtotal", "TaxTotal", "PaymentMeans", "PartyTaxScheme"].includes(name),
});

type Node = Record<string, unknown> | string | undefined;

function text(n: Node): string {
  if (n === undefined || n === null) return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  const t = (n as Record<string, unknown>)["#text"];
  return t === undefined ? "" : String(t);
}

function num(n: Node): number {
  const v = Number.parseFloat(text(n));
  return Number.isFinite(v) ? v : 0;
}

function get(obj: unknown, ...path: string[]): Node {
  let cur: unknown = obj;
  for (const p of path) {
    if (cur === undefined || cur === null) return undefined;
    cur = Array.isArray(cur) ? (cur[0] as Record<string, unknown>)?.[p] : (cur as Record<string, unknown>)[p];
  }
  return (Array.isArray(cur) ? cur[0] : cur) as Node;
}

function parseParty(party: unknown): ParsedParty {
  const taxSchemes = (get(party, "Party") as Record<string, unknown> | undefined)?.["PartyTaxScheme"] as unknown[] | undefined;
  const vatId = taxSchemes?.map((t) => text(get(t, "CompanyID"))).find(Boolean) ?? null;
  const legalId = text(get(party, "Party", "PartyLegalEntity", "CompanyID")) || null;
  const idFromIdentification = text(get(party, "Party", "PartyIdentification", "ID")) || null;
  const name =
    text(get(party, "Party", "PartyLegalEntity", "RegistrationName")) || text(get(party, "Party", "PartyName", "Name")) || "Necunoscut";
  const country = text(get(party, "Party", "PostalAddress", "Country", "IdentificationCode")) || "RO";
  const subentity = text(get(party, "Party", "PostalAddress", "CountrySubentity"));
  const cuiSource = vatId ?? (legalId && /^\d{2,10}$/.test(normalizeCui(legalId)) ? legalId : idFromIdentification);
  return {
    name,
    vatId,
    cui: cuiSource ? normalizeCui(cuiSource) || null : null,
    regCom: legalId && /^[JFC]\d/i.test(legalId) ? legalId : null,
    address: text(get(party, "Party", "PostalAddress", "StreetName")) || null,
    city: text(get(party, "Party", "PostalAddress", "CityName")) || null,
    county: subentity.startsWith("RO-") ? subentity.slice(3) : countyFromName(subentity),
    country,
    email: text(get(party, "Party", "Contact", "ElectronicMail")) || null,
    phone: text(get(party, "Party", "Contact", "Telephone")) || null,
  };
}

function unitFromCode(code: string) {
  return UNITS.find((u) => u.code === code)?.value ?? "buc";
}

export function parseUbl(xml: string): ParsedUbl {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const root = (doc.Invoice ?? doc.CreditNote) as Record<string, unknown> | undefined;
  if (!root) throw new Error("XML-ul nu este o factură UBL validă (lipsește elementul Invoice/CreditNote).");
  const isCredit = !!doc.CreditNote;
  const currency = text(get(root, "DocumentCurrencyCode")) || "RON";
  const lineNodes = ((isCredit ? root.CreditNoteLine : root.InvoiceLine) as unknown[] | undefined) ?? [];
  const taxTotals = (root.TaxTotal as unknown[] | undefined) ?? [];
  const docTax =
    taxTotals.find((t) => (get(t, "TaxAmount") as Record<string, string> | undefined)?.["@_currencyID"] === currency) ?? taxTotals[0];

  const lines = lineNodes.map((l) => {
    const q = num(get(l, isCredit ? "CreditedQuantity" : "InvoicedQuantity"));
    const unitCodeAttr = (get(l, isCredit ? "CreditedQuantity" : "InvoicedQuantity") as Record<string, string> | undefined)?.["@_unitCode"] ?? "H87";
    const net = num(get(l, "LineExtensionAmount"));
    const category = text(get(l, "Item", "ClassifiedTaxCategory", "ID")) || "S";
    return {
      name: text(get(l, "Item", "Name")) || "Articol",
      description: text(get(l, "Item", "Description")) || null,
      quantity: isCredit ? -Math.abs(q) : q,
      unit: unitFromCode(unitCodeAttr),
      unitPrice: num(get(l, "Price", "PriceAmount")),
      netAmount: isCredit ? -Math.abs(net) : net,
      vatRate: num(get(l, "Item", "ClassifiedTaxCategory", "Percent")),
      vatCategory: category,
    };
  });

  const sign = isCredit ? -1 : 1;
  const notes = ((root.Note as unknown[] | undefined) ?? []).map((n) => text(n as Node)).filter(Boolean);
  const paymentMeans = (root.PaymentMeans as unknown[] | undefined) ?? [];
  return {
    kind: isCredit ? "credit_note" : "invoice",
    number: text(get(root, "ID")),
    issueDate: text(get(root, "IssueDate")),
    dueDate: text(get(root, "DueDate")) || text(get(root, "PaymentMeans", "PaymentDueDate")) || null,
    currency,
    notes,
    supplier: parseParty(get(root, "AccountingSupplierParty")),
    customer: parseParty(get(root, "AccountingCustomerParty")),
    subtotal: round2(sign * num(get(root, "LegalMonetaryTotal", "TaxExclusiveAmount"))),
    vatTotal: round2(sign * num(get(docTax, "TaxAmount"))),
    total: round2(sign * num(get(root, "LegalMonetaryTotal", "TaxInclusiveAmount"))),
    payable: round2(sign * num(get(root, "LegalMonetaryTotal", "PayableAmount"))),
    iban: paymentMeans.map((p) => text(get(p, "PayeeFinancialAccount", "ID"))).find(Boolean) ?? null,
    lines,
  };
}
