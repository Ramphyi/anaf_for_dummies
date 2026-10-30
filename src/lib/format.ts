import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ro } from "date-fns/locale";

const moneyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number | null | undefined, currency = "RON", opts?: { compact?: boolean }): string {
  const value = amount ?? 0;
  const key = `${currency}-${opts?.compact ? "c" : "f"}`;
  let fmt = moneyFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency,
      notation: opts?.compact ? "compact" : "standard",
      minimumFractionDigits: opts?.compact ? 0 : 2,
      maximumFractionDigits: opts?.compact ? 1 : 2,
    });
    moneyFormatters.set(key, fmt);
  }
  return fmt.format(value);
}

const numberFmt = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 2 });
const number2Fmt = new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatNumber(value: number | null | undefined, fixed2 = false): string {
  return (fixed2 ? number2Fmt : numberFmt).format(value ?? 0);
}

const unitPriceFmt = new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** Preț unitar: minim 2, maxim 4 zecimale — ca valoarea liniei să rezulte din ce scrie pe factură. */
export function formatUnitPrice(value: number | null | undefined): string {
  return unitPriceFmt.format(value ?? 0);
}

const rateFmt = new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

/** Curs de schimb BNR: 4 zecimale, exact cum îl publică BNR (sumele în lei se calculează cu el). */
export function formatRate(value: number | null | undefined): string {
  return rateFmt.format(value ?? 0);
}

export function formatPercent(value: number, decimals = 0): string {
  return `${value.toFixed(decimals).replace(".", ",")}%`;
}

export function formatHours(hours: number | null | undefined): string {
  const h = hours ?? 0;
  const whole = Math.floor(h);
  const minutes = Math.round((h - whole) * 60);
  if (minutes === 60) return `${whole + 1}h`;
  return minutes ? `${whole}h ${String(minutes).padStart(2, "0")}m` : `${whole}h`;
}

function toDate(d: string | Date | number): Date {
  if (d instanceof Date) return d;
  if (typeof d === "number") return new Date(d);
  return parseISO(d);
}

/** 27.10.2026 */
export function formatDate(d: string | Date | number | null | undefined): string {
  if (!d) return "—";
  return format(toDate(d), "dd.MM.yyyy");
}

/** 27 oct. 2026 */
export function formatDateLong(d: string | Date | number | null | undefined): string {
  if (!d) return "—";
  return format(toDate(d), "d MMM yyyy", { locale: ro });
}

export function formatDateTime(d: string | Date | number | null | undefined): string {
  if (!d) return "—";
  return format(toDate(d), "dd.MM.yyyy HH:mm");
}

export function formatRelative(d: string | Date | number | null | undefined): string {
  if (!d) return "—";
  return formatDistanceToNow(toDate(d), { addSuffix: true, locale: ro });
}

export function formatMonth(d: string | Date): string {
  return format(toDate(d), "LLLL yyyy", { locale: ro });
}

/** Data de azi în format ISO (YYYY-MM-DD), în fusul orar local. */
export function todayIso(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function toIsoDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}
