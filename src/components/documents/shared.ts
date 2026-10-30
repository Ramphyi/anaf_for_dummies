import { addDays as addDaysFn, addMonths, addWeeks, addYears, format, parseISO } from "date-fns";
import type { DocKind, VatCategory } from "@/lib/db/schema";

/* Tipuri serializabile trimise de server către componentele client. */

export type PartnerOption = {
  id: string;
  name: string;
  cui: string | null;
  entityType: "pj" | "pf";
  vatPayer: boolean;
  country: string;
  city: string | null;
  email: string | null;
  paymentTermDays: number | null;
  defaultCurrency: string | null;
};

export type ProductOption = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  unit: string;
  price: number;
  currency: string;
  vatRate: number;
  vatCategory: VatCategory;
  priceIncludesVat: boolean;
  type: "product" | "service";
};

export type SeriesOption = { id: string; prefix: string; nextNumber: number; padding: number; isDefault: boolean };

export type CompanyDefaults = {
  vatPayer: boolean;
  defaultDueDays: number;
  defaultVatRate: number;
  defaultCurrency: string;
  country: string;
};

export type LineValue = {
  productId: string | null;
  name: string;
  description: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatRate: number;
  vatCategory: VatCategory;
};

export const KIND_META: Record<DocKind, { one: string; many: string; path: string; newLabel: string; article: string; printTitle: string }> = {
  invoice: { one: "Factură", many: "Facturi", path: "/facturi", newLabel: "Factură nouă", article: "factura", printTitle: "Factură" },
  proforma: { one: "Proformă", many: "Proforme", path: "/proforme", newLabel: "Proformă nouă", article: "proforma", printTitle: "Factură proformă" },
  notice: { one: "Aviz", many: "Avize de însoțire", path: "/avize", newLabel: "Aviz nou", article: "avizul", printTitle: "Aviz de însoțire a mărfii" },
};

export function docHref(kind: DocKind, id: string) {
  return `${KIND_META[kind].path}/${id}`;
}

export const EU_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "SE",
  "SI",
  "SK",
]);

/** Regimul TVA implicit pentru liniile noi, în funcție de firmă și client. */
export function defaultVatFor(
  company: Pick<CompanyDefaults, "vatPayer" | "defaultVatRate">,
  partner?: Pick<PartnerOption, "country" | "vatPayer"> | null,
): { rate: number; category: VatCategory; reason: string | null } {
  if (!company.vatPayer) return { rate: 0, category: "O", reason: "Firma nu este plătitoare de TVA — categoria O se aplică automat." };
  if (partner && partner.country !== "RO" && partner.vatPayer) {
    return {
      rate: 0,
      category: "AE",
      reason: EU_COUNTRIES.has(partner.country)
        ? "Client UE înregistrat în scopuri de TVA — taxare inversă (AE) aplicată automat."
        : "Client din afara țării, plătitor de TVA — taxare inversă (AE) aplicată automat.",
    };
  }
  return { rate: company.defaultVatRate, category: "S", reason: null };
}

/** Acceptă atât „12,5” cât și „12.5”. */
export function parseNum(v: string | number | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (!v) return 0;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function addDaysIso(iso: string, days: number): string {
  if (!iso) return "";
  return format(addDaysFn(parseISO(iso), days), "yyyy-MM-dd");
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}

/* --------------------------- Recurență --------------------------- */

export type Frequency = "weekly" | "monthly" | "quarterly" | "yearly";

export const FREQUENCY_LABELS: Record<Frequency, { one: string; every: string; unit: [string, string] }> = {
  weekly: { one: "Săptămânal", every: "săptămâni", unit: ["săptămână", "săptămâni"] },
  monthly: { one: "Lunar", every: "luni", unit: ["lună", "luni"] },
  quarterly: { one: "Trimestrial", every: "trimestre", unit: ["trimestru", "trimestre"] },
  yearly: { one: "Anual", every: "ani", unit: ["an", "ani"] },
};

export function frequencyLabel(freq: Frequency, interval = 1): string {
  if (interval <= 1) return FREQUENCY_LABELS[freq].one;
  return `La fiecare ${interval} ${FREQUENCY_LABELS[freq].every}`;
}

export function advanceDate(iso: string, freq: Frequency, interval = 1): string {
  const d = parseISO(iso);
  const n = Math.max(1, interval);
  const next = freq === "weekly" ? addWeeks(d, n) : freq === "monthly" ? addMonths(d, n) : freq === "quarterly" ? addMonths(d, 3 * n) : addYears(d, n);
  return format(next, "yyyy-MM-dd");
}

/** Factor de normalizare la o lună (pentru MRR). */
export function monthlyFactor(freq: Frequency, interval = 1): number {
  const n = Math.max(1, interval);
  return freq === "weekly" ? 52 / 12 / n : freq === "monthly" ? 1 / n : freq === "quarterly" ? 1 / (3 * n) : 1 / (12 * n);
}

export const RECURRING_PLACEHOLDERS = [
  { token: "{luna}", label: "luna curentă (ex. octombrie)" },
  { token: "{an}", label: "anul curent" },
  { token: "{luna_anterioara}", label: "luna anterioară" },
];
