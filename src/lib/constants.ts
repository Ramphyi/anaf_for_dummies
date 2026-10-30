/**
 * Constante de domeniu partajate între client și server.
 * Etichetele sunt în română; cheile rămân în engleză (ca în schema DB).
 */

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

export const APP_NAME = "AND";
/** Afișat mic sub nume (logo, subsoluri). */
export const APP_TAGLINE = "ANAF for Dummies";

/**
 * Plafoane zilnice pentru încasări și plăți în numerar cu același partener (Legea nr. 70/2015).
 * Operațiunile peste plafon nu se pot fragmenta — se decontează prin bancă.
 */
export const CASH_LIMITS = {
  /** Între firme (persoane juridice, PFA, II, IF): art. 3 alin. (1). */
  company: 5_000,
  /** Cu persoane fizice: art. 3 alin. (2) și art. 4. */
  individual: 10_000,
  /** Total plăți în numerar către firme, pe zi: art. 3 alin. (1). */
  companyDailyOut: 10_000,
} as const;

/** `digest` pentru erorile de permisiune — Next.js îl păstrează și în producție, ca error.tsx să le recunoască. */
export const FORBIDDEN_DIGEST = "AFD_FORBIDDEN";

/* ---------------------------- Cote TVA (2026) ---------------------------- */
// De la 1 august 2025 (Legea 141/2025): cota standard 21%, cota redusă 11%; 9% și 5% abrogate.
export const VAT_RATES = [
  { value: 21, label: "21% (standard)" },
  { value: 11, label: "11% (redusă)" },
  { value: 0, label: "0%" },
  { value: 19, label: "19% (până la 31.07.2025)" },
  { value: 9, label: "9% (până la 31.07.2025; locuințe până la 30.09.2026)" },
  { value: 5, label: "5% (până la 31.07.2025)" },
] as const;

/**
 * Intervalul în care se aplică fiecare cotă, după data faptului generator (livrare/prestare) — art. 291 Cod fiscal.
 * 9% a rămas tranzitoriu pentru locuințe până la 30.09.2026 (Legea 161/2026).
 */
const VAT_RATE_PERIODS: Record<number, { from?: string; until?: string }> = {
  21: { from: "2025-08-01" },
  11: { from: "2025-08-01" },
  19: { until: "2025-07-31" },
  9: { until: "2026-09-30" },
  5: { until: "2025-07-31" },
};

const roDate = (iso: string) => iso.split("-").reverse().join(".");

/** Mesaj de eroare dacă o cotă nu se aplică la data livrării (YYYY-MM-DD), altfel null. */
export function vatRateProblem(rate: number, chargeDate: string): string | null {
  const p = VAT_RATE_PERIODS[rate];
  if (!p) return null;
  if (p.from && chargeDate < p.from)
    return `Cota de ${rate}% se aplică livrărilor de la ${roDate(p.from)}. Pentru o livrare din ${roDate(chargeDate)} folosește cota în vigoare atunci (19%, 9% sau 5%).`;
  if (p.until && chargeDate > p.until)
    return `Cota de ${rate}% s-a aplicat până la ${roDate(p.until)}. Pentru o livrare din ${roDate(chargeDate)} folosește 21% sau 11% (completează „Data livrării” dacă livrarea a fost mai devreme).`;
  return null;
}

export const VAT_CATEGORY_LABELS: Record<string, string> = {
  S: "S — Cotă standard / redusă",
  Z: "Z — Cotă zero",
  E: "E — Scutit de TVA",
  AE: "AE — Taxare inversă",
  K: "K — Livrare intracomunitară",
  G: "G — Export în afara UE",
  O: "O — Neplătitor de TVA / în afara sferei",
};

/**
 * Motive de scutire (BT-121 cod VATEX + BT-120 text) pentru categoriile non-S — apar și ca mențiuni pe factură
 * (art. 319 alin. (20) lit. l) și m) Cod fiscal; „taxare inversă” este formularea cerută de lege).
 */
export const VAT_EXEMPTION_CODES: Record<string, { code: string; reason: string }> = {
  E: { code: "VATEX-EU-132", reason: "Scutit de TVA fără drept de deducere conform art. 292 din Codul fiscal" },
  AE: { code: "VATEX-EU-AE", reason: "Taxare inversă" },
  K: { code: "VATEX-EU-IC", reason: "Livrare intracomunitară scutită cu drept de deducere conform art. 294 alin. (2) lit. a) din Codul fiscal" },
  G: { code: "VATEX-EU-G", reason: "Export scutit cu drept de deducere conform art. 294 alin. (1) lit. a) din Codul fiscal" },
  O: { code: "VATEX-EU-O", reason: "Operațiune în afara sferei de aplicare a TVA" },
};

/** Furnizor neînregistrat în scopuri de TVA (regim special pentru întreprinderile mici, plafon 395.000 lei). */
export const SMALL_ENTERPRISE_MENTION = "Scutit de TVA conform art. 310 din Codul fiscal (regim special de scutire pentru întreprinderile mici)";

/** Mențiunea legală pentru o categorie TVA; pentru furnizorii neplătitori, categoria O înseamnă regimul art. 310. */
export function vatExemptionReason(category: string, supplierVatPayer: boolean): string | null {
  if (category === "O" && !supplierVatPayer) return SMALL_ENTERPRISE_MENTION;
  return VAT_EXEMPTION_CODES[category]?.reason ?? null;
}

export const CURRENCIES = ["RON", "EUR", "USD", "GBP", "CHF", "HUF", "PLN", "BGN", "MDL"] as const;

/* ------------------------- Unități de măsură UN/ECE ------------------------- */
export const UNITS: { value: string; label: string; code: string }[] = [
  { value: "buc", label: "buc", code: "H87" },
  { value: "ora", label: "oră", code: "HUR" },
  { value: "zi", label: "zi", code: "DAY" },
  { value: "luna", label: "lună", code: "MON" },
  { value: "an", label: "an", code: "ANN" },
  { value: "serviciu", label: "serviciu", code: "C62" },
  { value: "abonament", label: "abonament", code: "C62" },
  { value: "kg", label: "kg", code: "KGM" },
  { value: "g", label: "g", code: "GRM" },
  { value: "t", label: "tonă", code: "TNE" },
  { value: "l", label: "litru", code: "LTR" },
  { value: "m", label: "m", code: "MTR" },
  { value: "m2", label: "m²", code: "MTK" },
  { value: "m3", label: "m³", code: "MTQ" },
  { value: "km", label: "km", code: "KMT" },
  { value: "set", label: "set", code: "SET" },
  { value: "pachet", label: "pachet", code: "XPK" },
  { value: "cutie", label: "cutie", code: "XBX" },
  { value: "palet", label: "palet", code: "XPX" },
  { value: "kwh", label: "kWh", code: "KWH" },
];

export function unitCode(unit: string): string {
  return UNITS.find((u) => u.value === unit || u.label === unit)?.code ?? "H87";
}

/* ------------------------------- Județe ------------------------------- */
/** code = ISO 3166-2:RO (pt. e-Factura „RO-XX”), anaf = cod numeric județ (pt. e-Transport). */
export const COUNTIES: { code: string; name: string; anaf: number }[] = [
  { code: "AB", name: "Alba", anaf: 1 },
  { code: "AR", name: "Arad", anaf: 2 },
  { code: "AG", name: "Argeș", anaf: 3 },
  { code: "BC", name: "Bacău", anaf: 4 },
  { code: "BH", name: "Bihor", anaf: 5 },
  { code: "BN", name: "Bistrița-Năsăud", anaf: 6 },
  { code: "BT", name: "Botoșani", anaf: 7 },
  { code: "BV", name: "Brașov", anaf: 8 },
  { code: "BR", name: "Brăila", anaf: 9 },
  { code: "B", name: "București", anaf: 40 },
  { code: "BZ", name: "Buzău", anaf: 10 },
  { code: "CS", name: "Caraș-Severin", anaf: 11 },
  { code: "CL", name: "Călărași", anaf: 51 },
  { code: "CJ", name: "Cluj", anaf: 12 },
  { code: "CT", name: "Constanța", anaf: 13 },
  { code: "CV", name: "Covasna", anaf: 14 },
  { code: "DB", name: "Dâmbovița", anaf: 15 },
  { code: "DJ", name: "Dolj", anaf: 16 },
  { code: "GL", name: "Galați", anaf: 17 },
  { code: "GR", name: "Giurgiu", anaf: 52 },
  { code: "GJ", name: "Gorj", anaf: 18 },
  { code: "HR", name: "Harghita", anaf: 19 },
  { code: "HD", name: "Hunedoara", anaf: 20 },
  { code: "IL", name: "Ialomița", anaf: 21 },
  { code: "IS", name: "Iași", anaf: 22 },
  { code: "IF", name: "Ilfov", anaf: 23 },
  { code: "MM", name: "Maramureș", anaf: 24 },
  { code: "MH", name: "Mehedinți", anaf: 25 },
  { code: "MS", name: "Mureș", anaf: 26 },
  { code: "NT", name: "Neamț", anaf: 27 },
  { code: "OT", name: "Olt", anaf: 28 },
  { code: "PH", name: "Prahova", anaf: 29 },
  { code: "SM", name: "Satu Mare", anaf: 30 },
  { code: "SJ", name: "Sălaj", anaf: 31 },
  { code: "SB", name: "Sibiu", anaf: 32 },
  { code: "SV", name: "Suceava", anaf: 33 },
  { code: "TR", name: "Teleorman", anaf: 34 },
  { code: "TM", name: "Timiș", anaf: 35 },
  { code: "TL", name: "Tulcea", anaf: 36 },
  { code: "VS", name: "Vaslui", anaf: 37 },
  { code: "VL", name: "Vâlcea", anaf: 38 },
  { code: "VN", name: "Vrancea", anaf: 39 },
];

export const BUCHAREST_SECTORS = ["SECTOR1", "SECTOR2", "SECTOR3", "SECTOR4", "SECTOR5", "SECTOR6"];

export function countyName(code: string | null | undefined): string {
  if (!code) return "";
  return COUNTIES.find((c) => c.code === code)?.name ?? code;
}

/** Încearcă să deducă codul județului dintr-un nume (ex. din răspunsul ANAF „MUNICIPIUL BUCUREŞTI”). */
export function countyFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase();
  const n = norm(name);
  if (n.includes("BUCURESTI")) return "B";
  return COUNTIES.find((c) => n.includes(norm(c.name)))?.code ?? null;
}

/* ---------------------------- Statusuri & etichete ---------------------------- */

export const DOC_KIND_LABELS = {
  invoice: { one: "Factură", many: "Facturi", path: "/facturi" },
  proforma: { one: "Proformă", many: "Proforme", path: "/proforme" },
  notice: { one: "Aviz de însoțire", many: "Avize", path: "/avize" },
} as const;

export const DOC_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Ciornă", tone: "neutral" },
  issued: { label: "Emisă", tone: "info" },
  partially_paid: { label: "Încasată parțial", tone: "warning" },
  paid: { label: "Încasată", tone: "success" },
  overdue: { label: "Scadentă depășită", tone: "danger" },
  cancelled: { label: "Anulată", tone: "neutral" },
  storned: { label: "Stornată", tone: "danger" },
  converted: { label: "Facturată", tone: "success" },
};

export const EFACTURA_STATUS: Record<string, { label: string; tone: Tone }> = {
  none: { label: "Netrimisă", tone: "neutral" },
  pending: { label: "În coadă", tone: "info" },
  processing: { label: "În prelucrare", tone: "warning" },
  ok: { label: "Validată ANAF", tone: "success" },
  nok: { label: "Respinsă", tone: "danger" },
  error: { label: "Eroare", tone: "danger" },
};

/** Aceleași statusuri pentru transmiterile din modul simulare — nimic nu a ajuns la ANAF. */
export const EFACTURA_STATUS_SIMULATED: Record<string, { label: string; tone: Tone }> = {
  ...EFACTURA_STATUS,
  pending: { label: "În coadă (simulare)", tone: "warning" },
  processing: { label: "În prelucrare (simulare)", tone: "warning" },
  ok: { label: "Validată (simulare)", tone: "warning" },
  nok: { label: "Respinsă (simulare)", tone: "danger" },
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank: "Transfer bancar",
  cash: "Numerar",
  card: "Card",
  op: "Ordin de plată",
  compensation: "Compensare",
  other: "Altă metodă",
};

/** Cod UNTDID 4461 pentru PaymentMeans în UBL. */
export const PAYMENT_MEANS_CODE: Record<string, string> = {
  bank: "30",
  op: "42",
  cash: "10",
  card: "48",
  compensation: "97",
  other: "1",
};

export const PURCHASE_STATUS: Record<string, { label: string; tone: Tone }> = {
  unpaid: { label: "Neplătită", tone: "warning" },
  partially_paid: { label: "Plătită parțial", tone: "info" },
  paid: { label: "Plătită", tone: "success" },
  cancelled: { label: "Anulată", tone: "neutral" },
};

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  marfa: "Marfă",
  servicii: "Servicii",
  utilitati: "Utilități",
  chirie: "Chirie",
  software: "Software & licențe",
  hardware: "Hardware",
  transport: "Transport",
  marketing: "Marketing",
  salarii: "Salarii & colaboratori",
  taxe: "Taxe & impozite",
  altele: "Altele",
};

export const STOCK_DOC_LABELS: Record<string, { label: string; short: string; sign: 1 | -1 | 0 }> = {
  nir: { label: "Notă de intrare-recepție", short: "NIR", sign: 1 },
  consumption: { label: "Bon de consum", short: "BC", sign: -1 },
  transfer: { label: "Transfer între gestiuni", short: "TR", sign: 0 },
  inventory: { label: "Inventar / ajustare", short: "INV", sign: 0 },
  sale: { label: "Ieșire prin vânzare", short: "VZ", sign: -1 },
  sale_return: { label: "Retur vânzare", short: "RET", sign: 1 },
  opening: { label: "Sold inițial", short: "SI", sign: 1 },
};

export const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietar",
  admin: "Administrator",
  accountant: "Contabil",
  manager: "Manager proiecte",
  employee: "Angajat",
};

/* ------------------------------- Outsourcing ------------------------------- */

export const PROJECT_STATUS: Record<string, { label: string; tone: Tone }> = {
  planning: { label: "Planificare", tone: "info" },
  active: { label: "Activ", tone: "success" },
  on_hold: { label: "În pauză", tone: "warning" },
  completed: { label: "Finalizat", tone: "brand" },
  cancelled: { label: "Anulat", tone: "neutral" },
};

export const BILLING_TYPE_LABELS: Record<string, string> = {
  time_materials: "Time & Materials",
  fixed: "Preț fix",
  retainer: "Retainer lunar",
  non_billable: "Nefacturabil (intern)",
};

export const TASK_STATUS: Record<string, { label: string; tone: Tone }> = {
  backlog: { label: "Backlog", tone: "neutral" },
  todo: { label: "De făcut", tone: "info" },
  in_progress: { label: "În lucru", tone: "warning" },
  review: { label: "Review", tone: "brand" },
  done: { label: "Gata", tone: "success" },
};

export const TASK_PRIORITY: Record<string, { label: string; tone: Tone }> = {
  low: { label: "Scăzută", tone: "neutral" },
  medium: { label: "Medie", tone: "info" },
  high: { label: "Ridicată", tone: "warning" },
  urgent: { label: "Urgentă", tone: "danger" },
};

export const TIME_ENTRY_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Ciornă", tone: "neutral" },
  submitted: { label: "Trimis spre aprobare", tone: "info" },
  approved: { label: "Aprobat", tone: "success" },
  rejected: { label: "Respins", tone: "danger" },
};

export const SENIORITY_LABELS: Record<string, string> = {
  intern: "Intern",
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
  lead: "Lead",
  principal: "Principal",
};

export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  cim: "Contract de muncă (CIM)",
  pfa: "PFA",
  srl: "SRL colaborator",
  freelancer: "Freelancer",
};

export const TIME_OFF_TYPE: Record<string, { label: string; tone: Tone; color: string }> = {
  vacation: { label: "Concediu odihnă", tone: "info", color: "#38bdf8" },
  sick: { label: "Concediu medical", tone: "danger", color: "#f43f5e" },
  unpaid: { label: "Concediu fără plată", tone: "neutral", color: "#94a3b8" },
  holiday: { label: "Sărbătoare legală", tone: "brand", color: "#a78bfa" },
  other: { label: "Altul", tone: "warning", color: "#f59e0b" },
};

export const DEPARTMENTS = ["Engineering", "Design", "QA", "DevOps", "Product", "Data", "Management", "Sales"];

export const PALETTE = [
  "#6d5dfc",
  "#22c55e",
  "#06b6d4",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#3b82f6",
  "#f97316",
  "#84cc16",
  "#e11d48",
];

/** Sărbători legale România (zile libere) — folosite în pontaj și planificare. */
export const RO_PUBLIC_HOLIDAYS: Record<string, string> = {
  "2026-01-01": "Anul Nou",
  "2026-01-02": "Anul Nou",
  "2026-01-06": "Boboteaza",
  "2026-01-07": "Sf. Ioan Botezătorul",
  "2026-01-24": "Unirea Principatelor",
  "2026-04-10": "Vinerea Mare",
  "2026-04-12": "Paștele ortodox",
  "2026-04-13": "A doua zi de Paște",
  "2026-05-01": "Ziua Muncii",
  "2026-05-31": "Rusalii",
  "2026-06-01": "Ziua Copilului / Rusalii",
  "2026-08-15": "Adormirea Maicii Domnului",
  "2026-11-30": "Sf. Andrei",
  "2026-12-01": "Ziua Națională",
  "2026-12-25": "Crăciunul",
  "2026-12-26": "Crăciunul",
  "2027-01-01": "Anul Nou",
  "2027-01-02": "Anul Nou",
  "2027-01-06": "Boboteaza",
  "2027-01-07": "Sf. Ioan Botezătorul",
  "2027-01-24": "Unirea Principatelor",
};
