/**
 * Calcule pure pentru outsourcing (tarife, capacitate, utilizare, buget, benzi de planificare).
 * Sigure pentru client și server.
 */
import type { Tone } from "@/lib/constants";
import { eachDayIso, isWorkingDay } from "@/lib/outsourcing/dates";

/* ------------------------------- Tarife ------------------------------- */

/**
 * Tariful facturabil pentru o oră: override pe proiect → tariful membrului → tariful proiectului.
 * (Valorile 0/null sunt ignorate.)
 */
export function resolveRate(override?: number | null, memberRate?: number | null, projectRate?: number | null): number {
  if (override && override > 0) return override;
  if (memberRate && memberRate > 0) return memberRate;
  if (projectRate && projectRate > 0) return projectRate;
  return 0;
}

/** Cursuri de schimb: valută → RON (RON = 1). */
export type FxRates = Record<string, number>;

export function convertAmount(amount: number, from: string, to: string, fx: FxRates): number {
  if (from === to || !amount) return amount;
  const inRon = amount * (fx[from] ?? 1);
  return inRon / (fx[to] ?? 1);
}

/* ------------------------------ Capacitate ------------------------------ */

export function dailyCapacity(weeklyCapacity: number): number {
  return (weeklyCapacity || 0) / 5;
}

/** Ore disponibile într-un interval: zile lucrătoare × capacitate zilnică, excluzând concediile. */
export function capacityHours(weeklyCapacity: number, start: string, end: string, offDays?: Set<string>): number {
  const days = eachDayIso(start, end).filter((d) => isWorkingDay(d) && !offDays?.has(d)).length;
  return days * dailyCapacity(weeklyCapacity);
}

/** Ore alocate într-un interval (doar zilele lucrătoare, fără concedii). */
export function allocatedHours(
  allocs: { startDate: string; endDate: string; hoursPerDay: number }[],
  start: string,
  end: string,
  offDays?: Set<string>,
): number {
  let total = 0;
  for (const a of allocs) {
    const s = a.startDate > start ? a.startDate : start;
    const e = a.endDate < end ? a.endDate : end;
    if (s > e) continue;
    for (const d of eachDayIso(s, e)) if (isWorkingDay(d) && !offDays?.has(d)) total += a.hoursPerDay;
  }
  return total;
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

export type UtilizationLevel = "none" | "under" | "ok" | "over";

export function utilizationLevel(percent: number): UtilizationLevel {
  if (percent <= 0) return "none";
  if (percent < 80) return "under";
  if (percent <= 100) return "ok";
  return "over";
}

export const UTILIZATION_META: Record<UtilizationLevel, { label: string; tone: Tone; className: string }> = {
  none: { label: "Nealocat", tone: "neutral", className: "bg-muted/60 text-muted-foreground" },
  under: { label: "Sub-alocat", tone: "info", className: "bg-info-soft text-info-soft-foreground" },
  ok: { label: "Optim", tone: "success", className: "bg-success-soft text-success-soft-foreground" },
  over: { label: "Supra-alocat", tone: "danger", className: "bg-danger-soft text-danger-soft-foreground" },
};

/* -------------------------------- Buget -------------------------------- */

export type BudgetInfo = {
  /** procent consumat (0–∞) sau null dacă proiectul nu are buget */
  percent: number | null;
  used: number;
  total: number | null;
  unit: "hours" | "money" | null;
};

export function budgetInfo(
  p: { budgetHours: number | null; budgetAmount: number | null; billingType: string },
  hours: number,
  revenue: number,
): BudgetInfo {
  if (p.budgetHours && p.budgetHours > 0) return { percent: pct(hours, p.budgetHours), used: hours, total: p.budgetHours, unit: "hours" };
  if (p.budgetAmount && p.budgetAmount > 0) return { percent: pct(revenue, p.budgetAmount), used: revenue, total: p.budgetAmount, unit: "money" };
  return { percent: null, used: 0, total: null, unit: null };
}

export function budgetTone(percent: number | null): "brand" | "success" | "warning" | "danger" {
  if (percent === null) return "brand";
  if (percent > 100) return "danger";
  if (percent > 85) return "warning";
  return "success";
}

/* ------------------------- Benzi (lanes) pentru timeline ------------------------- */

/**
 * Așază intervalele suprapuse pe benzi (greedy, sortate după start).
 * Returnează banda fiecărui element și numărul total de benzi.
 */
export function packLanes<T extends { id: string; startDate: string; endDate: string }>(items: T[]): { lanes: Map<string, number>; count: number } {
  const sorted = [...items].sort((a, b) => a.startDate.localeCompare(b.startDate) || b.endDate.localeCompare(a.endDate));
  const laneEnds: string[] = [];
  const lanes = new Map<string, number>();
  for (const it of sorted) {
    let lane = laneEnds.findIndex((end) => end < it.startDate);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.endDate);
    } else {
      laneEnds[lane] = it.endDate;
    }
    lanes.set(it.id, lane);
  }
  return { lanes, count: laneEnds.length };
}
