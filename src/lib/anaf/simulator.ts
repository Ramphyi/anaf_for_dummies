/**
 * Simulator ANAF — răspunsuri realiste fără certificat digital, pentru demo și dezvoltare.
 * Fără stare: ID-urile codifică momentul încărcării, deci statusul evoluează în timp
 * („în prelucrare” → „ok”) exact ca în SPV.
 */
import { strToU8, zipSync } from "fflate";
import { buildUblInvoice, type UblParty } from "@/lib/anaf/ubl";
import { toIsoDate } from "@/lib/format";

const PROCESSING_MS = 6_000;

function cuiWithCheckDigit(base: string) {
  const key = "753217532";
  const digits = base.padStart(9, "0");
  let total = 0;
  for (let i = 0; i < 9; i++) total += Number(digits[i]) * Number(key[i]);
  let control = (total * 10) % 11;
  if (control === 10) control = 0;
  return `${base}${control}`;
}

export const SIM_SUPPLIERS: (UblParty & { iban: string; items: { name: string; unit: string; price: number; qty: [number, number] }[] })[] = [
  {
    name: "Nimbus Datacenter SRL",
    cui: cuiWithCheckDigit("4120731"),
    regCom: "J40/1234/2015",
    vatPayer: true,
    address: "Bd. Iuliu Maniu nr. 7",
    city: "Sector 6",
    county: "B",
    iban: "RO49AAAA1B31007593840000",
    items: [
      { name: "Server dedicat — abonament lunar", unit: "luna", price: 890, qty: [1, 2] },
      { name: "Backup offsite 1TB", unit: "luna", price: 120, qty: [1, 1] },
    ],
  },
  {
    name: "Papetăria Nordică SRL",
    cui: cuiWithCheckDigit("3317762"),
    regCom: "J12/556/2012",
    vatPayer: true,
    address: "Str. Fabricii nr. 21",
    city: "Cluj-Napoca",
    county: "CJ",
    iban: "RO66BBBB0000123456789012",
    items: [
      { name: "Hârtie copiator A4 80g (top 500 coli)", unit: "buc", price: 24.5, qty: [5, 20] },
      { name: "Toner imprimantă laser", unit: "buc", price: 310, qty: [1, 2] },
    ],
  },
  {
    name: "Flux Utilități Urbane SA",
    cui: cuiWithCheckDigit("1588201"),
    regCom: "J40/9981/2003",
    vatPayer: true,
    address: "Calea Victoriei nr. 155",
    city: "Sector 1",
    county: "B",
    iban: "RO02CCCC0000000000123456",
    items: [
      { name: "Energie electrică — consum lunar", unit: "kwh", price: 1.12, qty: [380, 720] },
      { name: "Abonament internet fibră 1Gbps", unit: "luna", price: 210, qty: [1, 1] },
    ],
  },
  {
    name: "Velocity Curierat Express SRL",
    cui: cuiWithCheckDigit("3901457"),
    regCom: "J22/3301/2018",
    vatPayer: true,
    address: "Șos. Păcurari nr. 88",
    city: "Iași",
    county: "IS",
    iban: "RO81DDDD0000987654321000",
    items: [{ name: "Servicii curierat național", unit: "buc", price: 18.9, qty: [4, 30] }],
  },
  {
    name: "Kafea Office Coffee SRL",
    cui: cuiWithCheckDigit("4455120"),
    regCom: "J35/772/2020",
    vatPayer: true,
    address: "Str. Mărășești nr. 4",
    city: "Timișoara",
    county: "TM",
    iban: "RO13EEEE0000555566667777",
    items: [
      { name: "Cafea boabe espresso 1kg", unit: "kg", price: 96, qty: [3, 8] },
      { name: "Închiriere espressor profesional", unit: "luna", price: 150, qty: [1, 1] },
    ],
  },
  {
    name: "Pixel Hardware Distribution SRL",
    cui: cuiWithCheckDigit("2766019"),
    regCom: "J40/4410/2010",
    vatPayer: true,
    address: "Str. Fabrica de Glucoză nr. 11",
    city: "Sector 2",
    county: "B",
    iban: "RO57FFFF0000111122223333",
    items: [
      { name: 'Monitor 27" 4K IPS', unit: "buc", price: 1499, qty: [1, 3] },
      { name: "Laptop ultrabook 16GB/1TB", unit: "buc", price: 6290, qty: [1, 2] },
      { name: "Docking station USB-C", unit: "buc", price: 689, qty: [1, 3] },
    ],
  },
];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function upload(xml: string) {
  const uploadId = String(Math.floor(Date.now() / 1000) * 10 + Math.floor(Math.random() * 10));
  const dateResponse = new Date().toISOString().replace(/\D/g, "").slice(0, 12);
  if (!xml.includes("<Invoice") || !xml.includes("CIUS-RO")) {
    const raw = `<header xmlns="mfp:anaf:dgti:spv:respUploadFisier:v1" dateResponse="${dateResponse}" ExecutionStatus="1"><Errors errorMessage="Fisierul transmis nu este valid. org.xml.sax.SAXParseException"/></header>`;
    return { uploadId: null, ok: false, errors: ["Fișierul transmis nu este un XML UBL valid."], raw };
  }
  const raw = `<header xmlns="mfp:anaf:dgti:spv:respUploadFisier:v1" dateResponse="${dateResponse}" ExecutionStatus="0" index_incarcare="${uploadId}"/>`;
  return { uploadId, ok: true, errors: [] as string[], raw };
}

export function status(uploadId: string) {
  const startedAt = Math.floor(Number(uploadId) / 10) * 1000;
  if (Number.isFinite(startedAt) && Date.now() - startedAt < PROCESSING_MS) {
    const raw = `<header xmlns="mfp:anaf:dgti:efactura:stareMesajFactura:v1" stare="in prelucrare"/>`;
    return { state: "processing" as const, downloadId: null, message: "în prelucrare", raw };
  }
  const downloadId = `3${uploadId.slice(1)}`;
  const raw = `<header xmlns="mfp:anaf:dgti:efactura:stareMesajFactura:v1" stare="ok" id_descarcare="${downloadId}"/>`;
  return { state: "ok" as const, downloadId, message: "ok", raw };
}

/** Mesaje „FACTURA PRIMITA” deterministe: ~o factură la 3 zile, de la furnizori fictivi. */
export function listMessages(cif: string, days: number) {
  const out: { id: string; requestId: string; type: string; cif: string; details: string; createdAt: string }[] = [];
  const now = new Date();
  for (let d = 0; d < Math.min(days, 60); d++) {
    const day = new Date(now.getTime() - d * 86_400_000);
    const iso = toIsoDate(day);
    const h = hash(`${cif}-${iso}`);
    if (h % 3 !== 0) continue;
    const s = h % SIM_SUPPLIERS.length;
    const supplier = SIM_SUPPLIERS[s];
    const id = `8${iso.replace(/-/g, "")}${s}`;
    out.push({
      id,
      requestId: `5${iso.replace(/-/g, "").slice(2)}${s}${h % 97}`,
      type: "FACTURA PRIMITA",
      cif,
      details: `Factura cu id_incarcare=5${iso.replace(/-/g, "").slice(2)}${s} emisa de cif_emitent=${supplier.cui} pentru cif_beneficiar=${cif}`,
      createdAt: `${iso.replace(/-/g, "")}${String(8 + (h % 9)).padStart(2, "0")}${String(h % 60).padStart(2, "0")}`,
    });
  }
  return out;
}

/** Generează XML-ul unei facturi primite simulate (din ID-ul mesajului). */
export function incomingInvoiceXml(downloadId: string, customer: UblParty) {
  const iso = `${downloadId.slice(1, 5)}-${downloadId.slice(5, 7)}-${downloadId.slice(7, 9)}`;
  const s = Number(downloadId.slice(9)) % SIM_SUPPLIERS.length;
  const supplier = SIM_SUPPLIERS[s];
  const h = hash(downloadId);
  const due = new Date(Date.parse(iso) + 30 * 86_400_000);
  const items = supplier.items.filter((_, i) => i === 0 || (h >> i) % 2 === 0);
  return buildUblInvoice({
    number: `${supplier.name.slice(0, 3).toUpperCase()}${String(h % 100000).padStart(5, "0")}`,
    issueDate: iso,
    dueDate: toIsoDate(due),
    currency: "RON",
    supplier: { ...supplier },
    customer,
    lines: items.map((it, i) => {
      const [min, max] = it.qty;
      const q = min + ((h >> (i + 3)) % (max - min + 1));
      return { name: it.name, unit: it.unit, quantity: q, unitPrice: it.price, vatRate: 21, vatCategory: "S" };
    }),
  });
}

export async function download(downloadId: string, fallbackXml?: () => Promise<string | null>, customer?: UblParty) {
  let xml: string | null = null;
  if (downloadId.startsWith("8") && customer) xml = incomingInvoiceXml(downloadId, customer);
  else if (fallbackXml) xml = await fallbackXml();
  if (!xml) throw new Error("Mesajul nu a fost găsit în SPV (simulare).");
  const signature = `<?xml version="1.0" encoding="UTF-8"?><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><Reference URI=""><DigestValue>${Buffer.from(String(hash(xml))).toString("base64")}</DigestValue></Reference></SignedInfo><SignatureValue>SIMULARE-AFD</SignatureValue></Signature>`;
  return zipSync({ [`${downloadId}.xml`]: strToU8(xml), [`semnatura_${downloadId}.xml`]: strToU8(signature) });
}

export function etransportUpload() {
  const uploadId = String(Math.floor(Date.now() / 1000) * 10 + 1);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const uit = Array.from({ length: 16 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  const raw = `<header xmlns="mfp:anaf:dgti:spv:respUploadFisier:v1" ExecutionStatus="0" index_incarcare="${uploadId}" UIT="${uit}"/>`;
  return { ok: true, uploadId, uit, errors: [] as string[], raw };
}
