import { addMonths, differenceInCalendarDays, format, parseISO, startOfMonth, subMonths } from "date-fns";
import { ro } from "date-fns/locale";

/** Ultimele `n` luni (inclusiv luna curentă), în ordine cronologică: [{ key: "2026-10", label: "oct." }]. */
export function lastMonths(n = 12, today = new Date()) {
  const start = startOfMonth(subMonths(today, n - 1));
  return Array.from({ length: n }, (_, i) => {
    const d = addMonths(start, i);
    return { key: format(d, "yyyy-MM"), label: format(d, "LLL", { locale: ro }).replace(".", ""), long: format(d, "LLLL yyyy", { locale: ro }) };
  });
}

/** Prima zi a intervalului de `n` luni (YYYY-MM-DD). */
export function monthsAgoStart(n = 12, today = new Date()) {
  return format(startOfMonth(subMonths(today, n - 1)), "yyyy-MM-dd");
}

export function monthKey(isoDate: string) {
  return isoDate.slice(0, 7);
}

export function daysBetween(fromIso: string, toIso: string) {
  return differenceInCalendarDays(parseISO(toIso), parseISO(fromIso));
}

/** Variația procentuală (null dacă baza e 0). */
export function pctDelta(current: number, previous: number) {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
