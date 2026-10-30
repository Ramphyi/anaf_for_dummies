/**
 * Perioade de raportare — partajat între client (selector) și server (interogări).
 * Perioada vine din URL: `?from=YYYY-MM-DD&to=YYYY-MM-DD`.
 */
import {
  addDays,
  differenceInCalendarDays,
  eachMonthOfInterval,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from "date-fns";
import { ro } from "date-fns/locale";

export type PeriodPreset = "this_month" | "last_month" | "this_quarter" | "this_year" | "last_12" | "custom";

export const PERIOD_PRESETS: { value: Exclude<PeriodPreset, "custom">; label: string }[] = [
  { value: "this_month", label: "Luna curentă" },
  { value: "last_month", label: "Luna trecută" },
  { value: "this_quarter", label: "Trimestrul curent" },
  { value: "this_year", label: "Anul curent" },
  { value: "last_12", label: "Ultimele 12 luni" },
];

export type Period = { from: string; to: string; preset: PeriodPreset; label: string };

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function presetRange(preset: Exclude<PeriodPreset, "custom">, today = new Date()): { from: string; to: string } {
  switch (preset) {
    case "this_month":
      return { from: iso(startOfMonth(today)), to: iso(endOfMonth(today)) };
    case "last_month": {
      const m = subMonths(today, 1);
      return { from: iso(startOfMonth(m)), to: iso(endOfMonth(m)) };
    }
    case "this_quarter":
      return { from: iso(startOfQuarter(today)), to: iso(endOfQuarter(today)) };
    case "this_year":
      return { from: iso(startOfYear(today)), to: iso(endOfYear(today)) };
    case "last_12":
      return { from: iso(startOfMonth(subMonths(today, 11))), to: iso(endOfMonth(today)) };
  }
}

export function detectPreset(from: string, to: string): PeriodPreset {
  for (const p of PERIOD_PRESETS) {
    const r = presetRange(p.value);
    if (r.from === from && r.to === to) return p.value;
  }
  return "custom";
}

/** „1 oct. 2026 – 31 oct. 2026” */
export function periodLabel(from: string, to: string): string {
  const f = parseISO(from);
  const t = parseISO(to);
  if (from === to) return format(f, "d MMM yyyy", { locale: ro });
  if (format(f, "yyyy") === format(t, "yyyy")) return `${format(f, "d MMM", { locale: ro })} – ${format(t, "d MMM yyyy", { locale: ro })}`;
  return `${format(f, "d MMM yyyy", { locale: ro })} – ${format(t, "d MMM yyyy", { locale: ro })}`;
}

function pickParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Citește perioada din searchParams; dacă lipsește sau e invalidă, folosește presetarea implicită. */
export function resolvePeriod(
  sp: { from?: string | string[]; to?: string | string[] } | undefined,
  fallback: Exclude<PeriodPreset, "custom"> = "this_month",
): Period {
  let from = pickParam(sp?.from);
  let to = pickParam(sp?.to);
  const valid = (s?: string) => !!s && ISO_RE.test(s) && !Number.isNaN(parseISO(s).getTime());
  if (!valid(from) || !valid(to)) {
    const r = presetRange(fallback);
    from = r.from;
    to = r.to;
  }
  if (from! > to!) [from, to] = [to, from];
  // limită de siguranță: maxim 5 ani într-un raport
  if (differenceInCalendarDays(parseISO(to!), parseISO(from!)) > 366 * 5) from = iso(subYears(parseISO(to!), 5));
  const preset = detectPreset(from!, to!);
  const label = preset === "custom" ? periodLabel(from!, to!) : `${PERIOD_PRESETS.find((p) => p.value === preset)!.label} · ${periodLabel(from!, to!)}`;
  return { from: from!, to: to!, preset, label };
}

/** Perioada de aceeași lungime imediat anterioară (pentru variații %). */
export function previousPeriod(p: { from: string; to: string }): { from: string; to: string } {
  const f = parseISO(p.from);
  const t = parseISO(p.to);
  // luni întregi → lunile anterioare (ex. T4 → T3), altfel același număr de zile
  if (iso(startOfMonth(f)) === p.from && iso(endOfMonth(t)) === p.to) {
    const months = eachMonthOfInterval({ start: f, end: t }).length;
    return { from: iso(startOfMonth(subMonths(f, months))), to: iso(endOfMonth(subMonths(t, months))) };
  }
  const days = differenceInCalendarDays(t, f) + 1;
  return { from: iso(subDays(f, days)), to: iso(subDays(f, 1)) };
}

export function shiftYears(p: { from: string; to: string }, years: number): { from: string; to: string } {
  return { from: iso(subYears(parseISO(p.from), years)), to: iso(subYears(parseISO(p.to), years)) };
}

export type MonthBucket = { key: string; label: string; long: string };

/** Lunile acoperite de perioadă: `2026-10` → „oct. 26”. */
export function monthsInPeriod(from: string, to: string): MonthBucket[] {
  return eachMonthOfInterval({ start: parseISO(from), end: parseISO(to) }).map((d) => ({
    key: format(d, "yyyy-MM"),
    label: format(d, "LLL yy", { locale: ro }),
    long: format(d, "LLLL yyyy", { locale: ro }),
  }));
}

export const monthKey = (date: string) => date.slice(0, 7);

/** Cheia lunii cu un an în urmă: `2026-10` → `2025-10`. */
export function prevYearKey(key: string): string {
  const [y, m] = key.split("-");
  return `${Number(y) - 1}-${m}`;
}

export function dayBefore(date: string): string {
  return iso(subDays(parseISO(date), 1));
}

export function addDaysIso(date: string, days: number): string {
  return iso(addDays(parseISO(date), days));
}

export function daysBetween(a: string, b: string): number {
  return differenceInCalendarDays(parseISO(b), parseISO(a));
}
