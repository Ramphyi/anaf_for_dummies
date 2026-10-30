/**
 * Verifică generatorul UBL contra validatorului public ANAF (FACT1).
 * Rulare: npx tsx scripts/validate-ubl.ts
 *
 * Notă: validatorul public nu poate identifica cumpărători nerezidenți („nu a fost identificat cui
 * cumparator”) — la încărcarea reală se trimite `extern=DA`, lucru făcut automat de efacturaUpload().
 */
import { buildUblInvoice, type UblInput } from "../src/lib/anaf/ubl";

const supplier = {
  name: "Pixelcraft Digital SRL",
  cui: "43182658",
  regCom: "J12/4521/2019",
  vatPayer: true,
  address: "Str. Calea Dorobanților nr. 14",
  city: "Cluj-Napoca",
  county: "CJ",
  country: "RO",
  iban: "RO49AAAA1B31007593840000",
  bank: "Banca Demo",
  email: "facturare@pixelcraft.ro",
  legalInfo: "Capital social: 200 lei",
};

const cases: Record<string, UblInput> = {
  "RON, 2 cote, discount, București": {
    number: "PXD0001",
    issueDate: "2026-10-20",
    dueDate: "2026-11-04",
    currency: "RON",
    notes: ["Vă mulțumim!"],
    supplier,
    customer: { name: "Nimbus Retail SRL", cui: "35610125", regCom: "J40/2210/2015", vatPayer: true, address: "Șos. Pipera nr. 42", city: "Sector 2", county: "B", country: "RO" },
    lines: [
      { name: "Dezvoltare software — Senior", unit: "ora", quantity: 40, unitPrice: 245, discountPercent: 5, vatRate: 21, vatCategory: "S" },
      { name: "Carte tehnică", unit: "buc", quantity: 3, unitPrice: 89.9, vatRate: 11, vatCategory: "S" },
    ],
  },
  "EUR, taxare inversă (AE), client UE [eroare de identificare așteptată în validatorul public]": {
    number: "PXD0002",
    issueDate: "2026-10-20",
    dueDate: "2026-11-19",
    currency: "EUR",
    exchangeRate: 5.0812,
    supplier,
    customer: { name: "Müller Software GmbH", cui: "DE298765432", vatPayer: true, address: "Leopoldstraße 21", city: "München", country: "DE" },
    lines: [{ name: "Software development services", unit: "ora", quantity: 120, unitPrice: 48, vatRate: 0, vatCategory: "AE" }],
  },
  "Storno (cantități negative)": {
    number: "PXD0003",
    issueDate: "2026-10-21",
    dueDate: "2026-10-21",
    currency: "RON",
    billingReference: { number: "PXD0001", issueDate: "2026-10-20" },
    supplier,
    customer: { name: "Atlas Logistic SA", cui: "18443779", vatPayer: true, address: "Str. Aeroportului nr. 3", city: "Otopeni", county: "IF", country: "RO" },
    lines: [{ name: "Mentenanță aplicație", unit: "luna", quantity: -1, unitPrice: 3500, vatRate: 21, vatCategory: "S" }],
  },
  "RON, dată livrare diferită de emitere (BT-72)": {
    number: "PXD0004",
    issueDate: "2026-10-05",
    dueDate: "2026-10-20",
    deliveryDate: "2026-09-30",
    currency: "RON",
    supplier,
    customer: { name: "Nimbus Retail SRL", cui: "35610125", regCom: "J40/2210/2015", vatPayer: true, address: "Șos. Pipera nr. 42", city: "Sector 2", county: "B", country: "RO" },
    lines: [{ name: "Mentenanță septembrie", unit: "luna", quantity: 1, unitPrice: 3500, vatRate: 21, vatCategory: "S" }],
  },
  "EUR, livrare intracomunitară (K) [eroare de identificare așteptată în validatorul public]": {
    number: "PXD0005",
    issueDate: "2026-10-22",
    dueDate: "2026-11-21",
    currency: "EUR",
    exchangeRate: 5.0812,
    supplier,
    customer: { name: "Müller Software GmbH", cui: "DE298765432", vatPayer: true, address: "Leopoldstraße 21", city: "München", country: "DE" },
    lines: [{ name: "Server rack", unit: "buc", quantity: 2, unitPrice: 1200, vatRate: 0, vatCategory: "K" }],
  },
  "Furnizor neplătitor TVA (O), client PF": {
    number: "LAB0001",
    issueDate: "2026-10-22",
    dueDate: "2026-11-05",
    currency: "RON",
    supplier: { ...supplier, name: "Pixelcraft Labs SRL", cui: "47901128", vatPayer: false, county: "B", city: "Sector 3", address: "Bd. Unirii nr. 27" },
    customer: { name: "Ionescu Maria", entityType: "pf", vatPayer: false, address: "Str. Florilor nr. 5", city: "Sibiu", county: "SB", country: "RO" },
    lines: [{ name: "Consultanță", unit: "ora", quantity: 2, unitPrice: 150, vatRate: 0, vatCategory: "S" }],
  },
};

async function main() {
  for (const [label, input] of Object.entries(cases)) {
    const xml = buildUblInvoice(input);
    const res = await fetch("https://webservicesp.anaf.ro/prod/FCTEL/rest/validare/FACT1", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: xml,
    });
    const text = await res.text();
    let verdict = text;
    try {
      const j = JSON.parse(text) as { stare?: string; Messages?: { message: string }[] };
      verdict = j.stare === "ok" ? "✓ OK" : `✗ ${j.stare}\n   ${(j.Messages ?? []).map((m) => m.message).join("\n   ")}`;
    } catch {
      verdict = `HTTP ${res.status}: ${text.slice(0, 300)}`;
    }
    console.log(`${label}: ${verdict}`);
  }
}

main();
