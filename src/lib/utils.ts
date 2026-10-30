import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Rotunjire contabilă la 2 zecimale (evită erorile de tip 1.005 → 1.00). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function round(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export function sum<T>(items: readonly T[], pick: (item: T) => number): number {
  return items.reduce((acc, item) => acc + (pick(item) || 0), 0);
}

export function groupBy<T, K extends string | number>(items: readonly T[], key: (item: T) => K): Record<K, T[]> {
  return items.reduce(
    (acc, item) => {
      const k = key(item);
      (acc[k] ||= []).push(item);
      return acc;
    },
    {} as Record<K, T[]>,
  );
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** Normalizează un CUI: elimină prefixul RO, spațiile și caracterele non-numerice. */
export function normalizeCui(cui: string | null | undefined): string {
  return (cui ?? "").toUpperCase().replace(/^RO/, "").replace(/\D/g, "");
}

/** Validare CUI românesc (algoritm cifră de control). */
export function isValidCui(raw: string): boolean {
  const cui = normalizeCui(raw);
  if (cui.length < 2 || cui.length > 10) return false;
  const key = "753217532";
  const digits = cui.slice(0, -1).padStart(9, "0");
  let total = 0;
  for (let i = 0; i < 9; i++) total += Number(digits[i]) * Number(key[i]);
  let control = (total * 10) % 11;
  if (control === 10) control = 0;
  return control === Number(cui.at(-1));
}

/** Validare CNP (13 cifre + cifră de control). */
export function isValidCnp(cnp: string): boolean {
  if (!/^\d{13}$/.test(cnp)) return false;
  const key = "279146358279";
  let total = 0;
  for (let i = 0; i < 12; i++) total += Number(cnp[i]) * Number(key[i]);
  let control = total % 11;
  if (control === 10) control = 1;
  return control === Number(cnp[12]);
}

export function isValidIban(iban: string): boolean {
  const s = iban.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const ch of numeric) remainder = (remainder * 10 + Number(ch)) % 97;
  return remainder === 1;
}

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Convertește rânduri în CSV (separator `;` — compatibil Excel RO). */
export function toCsv(rows: Record<string, unknown>[], columns?: { key: string; label: string }[]): string {
  if (!rows.length && !columns) return "";
  const cols = columns ?? Object.keys(rows[0]).map((k) => ({ key: k, label: k }));
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "number" ? String(v).replace(".", ",") : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map((c) => esc(c.label)).join(";"), ...rows.map((r) => cols.map((c) => esc(r[c.key])).join(";"))].join(
    "\n",
  );
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
