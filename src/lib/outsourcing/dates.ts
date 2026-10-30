/**
 * Utilitare de calendar pentru outsourcing (pontaj, planificare, concedii).
 * Sigure pentru client și server. Zilele sunt string-uri `YYYY-MM-DD`; săptămâna începe luni.
 */
import { addDays, differenceInCalendarDays, format, getISOWeek, isValid, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { ro } from "date-fns/locale";
import { RO_PUBLIC_HOLIDAYS } from "@/lib/constants";

export const WEEK_OPTS = { weekStartsOn: 1 } as const;
export const WEEKDAY_SHORT = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"] as const;

export const iso = (d: Date) => format(d, "yyyy-MM-dd");
export const parseDay = (s: string) => parseISO(s);

export function isIsoDay(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && isValid(parseISO(s));
}

/** Luni din săptămâna datei. */
export function weekStartOf(d: string | Date = new Date()): string {
  return iso(startOfWeek(typeof d === "string" ? parseISO(d) : d, WEEK_OPTS));
}

/** `?week=YYYY-MM-DD` → luni din acea săptămână (sau săptămâna curentă). */
export function parseWeekParam(param?: string | null): string {
  return isIsoDay(param) ? weekStartOf(param) : weekStartOf(new Date());
}

export function monthStartOf(d: string | Date = new Date()): string {
  return iso(startOfMonth(typeof d === "string" ? parseISO(d) : d));
}

export function addDaysIso(s: string, n: number): string {
  return iso(addDays(parseISO(s), n));
}

/** b − a în zile calendaristice. */
export function daysBetween(a: string, b: string): number {
  return differenceInCalendarDays(parseISO(b), parseISO(a));
}

/** Toate zilele dintre start și end (inclusiv). */
export function eachDayIso(start: string, end: string): string[] {
  const n = daysBetween(start, end);
  if (n < 0) return [];
  const out: string[] = [];
  const s = parseISO(start);
  for (let i = 0; i <= n; i++) out.push(iso(addDays(s, i)));
  return out;
}

export function weekDays(weekStart: string): string[] {
  return eachDayIso(weekStart, addDaysIso(weekStart, 6));
}

export function dayOfWeek(s: string): number {
  // 0 = luni … 6 = duminică
  return (parseISO(s).getDay() + 6) % 7;
}

export function isWeekendIso(s: string): boolean {
  return dayOfWeek(s) >= 5;
}

export function holidayName(s: string): string | undefined {
  return RO_PUBLIC_HOLIDAYS[s];
}

/** Zi lucrătoare = nu e weekend și nu e sărbătoare legală. */
export function isWorkingDay(s: string): boolean {
  return !isWeekendIso(s) && !RO_PUBLIC_HOLIDAYS[s];
}

/** Numărul zilelor lucrătoare din interval (opțional exclude zilele dintr-un set — ex. concediu). */
export function workingDaysCount(start: string, end: string, exclude?: Set<string>): number {
  return eachDayIso(start, end).filter((d) => isWorkingDay(d) && !exclude?.has(d)).length;
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function clampRange(start: string, end: string, min: string, max: string): [string, string] | null {
  const s = start < min ? min : start;
  const e = end > max ? max : end;
  return s <= e ? [s, e] : null;
}

export function isoWeekNumber(s: string): number {
  return getISOWeek(parseISO(s));
}

/** „27 oct. – 2 nov. 2026” */
export function weekRangeLabel(weekStart: string): string {
  const s = parseISO(weekStart);
  const e = addDays(s, 6);
  const sameMonth = s.getMonth() === e.getMonth();
  const sameYear = s.getFullYear() === e.getFullYear();
  const left = format(s, sameMonth ? "d" : sameYear ? "d MMM" : "d MMM yyyy", { locale: ro });
  return `${left} – ${format(e, "d MMM yyyy", { locale: ro })}`;
}

export function rangeLabel(start: string, end: string): string {
  if (start === end) return format(parseISO(start), "d MMM yyyy", { locale: ro });
  const s = parseISO(start);
  const e = parseISO(end);
  const sameYear = s.getFullYear() === e.getFullYear();
  return `${format(s, sameYear ? "d MMM" : "d MMM yyyy", { locale: ro })} – ${format(e, "d MMM yyyy", { locale: ro })}`;
}

export function formatDay(s: string, pattern = "EEE d MMM"): string {
  return format(parseISO(s), pattern, { locale: ro });
}

/**
 * Interpretează ore introduse de utilizator: „1.5”, „1,5”, „1:30”, „90m”, „1h30”, „1h 30m”.
 * Returnează `null` pentru valori invalide; șirul gol înseamnă 0.
 */
export function parseHoursInput(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return 0;
  let h: number;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{1,2}):(\d{1,2})$/))) {
    const min = Number(m[2]);
    if (min >= 60) return null;
    h = Number(m[1]) + min / 60;
  } else if ((m = s.match(/^(\d+(?:[.,]\d+)?)h(?:(\d{1,2})m?)?$/))) {
    h = Number(m[1].replace(",", ".")) + (m[2] ? Number(m[2]) / 60 : 0);
  } else if ((m = s.match(/^(\d+)m(in)?$/))) {
    h = Number(m[1]) / 60;
  } else if (/^\d+(?:[.,]\d*)?$/.test(s) || /^[.,]\d+$/.test(s)) {
    h = Number(s.replace(",", ".").replace(/\.$/, ""));
  } else {
    return null;
  }
  if (!Number.isFinite(h) || h < 0 || h > 24) return null;
  return Math.round(h * 100) / 100;
}

/** 7.5 → „7:30” (format compact pentru celulele de pontaj). */
export function formatClock(hours: number | null | undefined): string {
  const h = hours ?? 0;
  if (!h) return "";
  let whole = Math.floor(h);
  let min = Math.round((h - whole) * 60);
  if (min === 60) {
    whole += 1;
    min = 0;
  }
  return `${whole}:${String(min).padStart(2, "0")}`;
}

/** Secunde → „1:07:09”. */
export function formatStopwatch(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Extinde intervale (ex. concedii) într-un set de zile, opțional limitat la [min, max]. */
export function expandRanges(ranges: { startDate: string; endDate: string }[], min?: string, max?: string): Set<string> {
  const out = new Set<string>();
  for (const r of ranges) {
    const c = min && max ? clampRange(r.startDate, r.endDate, min, max) : [r.startDate, r.endDate];
    if (!c) continue;
    for (const d of eachDayIso(c[0], c[1])) out.add(d);
  }
  return out;
}
