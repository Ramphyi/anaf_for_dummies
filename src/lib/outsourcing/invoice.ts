/**
 * Construirea liniilor de factură din orele aprobate ale unui proiect.
 * Pur (client + server): același calcul pentru previzualizare și pentru acțiunea de creare.
 */
import { formatDate } from "@/lib/format";
import { eachDayIso } from "@/lib/outsourcing/dates";
import { round2 } from "@/lib/utils";

export type InvoiceGrouping = "member" | "task" | "single";

export const INVOICE_GROUPING_LABELS: Record<InvoiceGrouping, string> = {
  member: "Per membru",
  task: "Per task",
  single: "O singură linie",
};

export type BillableEntry = {
  id: string;
  date: string;
  hours: number;
  memberId: string;
  memberName: string;
  memberPosition?: string | null;
  taskId: string | null;
  taskTitle: string | null;
  /** tarif în moneda proiectului */
  rate: number;
};

export type InvoiceLinePreview = {
  key: string;
  name: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

export function monthsInRange(from: string, to: string): number {
  return new Set(eachDayIso(from, to).map((d) => d.slice(0, 7))).size;
}

export function buildInvoiceLines(
  project: { name: string; billingType: string; monthlyRetainer: number | null },
  entries: BillableEntry[],
  grouping: InvoiceGrouping,
  period: { from: string; to: string },
): { lines: InvoiceLinePreview[]; hours: number; total: number } {
  const hours = round2(entries.reduce((a, e) => a + e.hours, 0));
  const periodText = `Perioada ${formatDate(period.from)} – ${formatDate(period.to)}`;

  if (project.billingType === "retainer") {
    const months = monthsInRange(period.from, period.to);
    const price = project.monthlyRetainer ?? 0;
    const line: InvoiceLinePreview = {
      key: "retainer",
      name: `Servicii retainer lunar — ${project.name}`,
      description: `${periodText} · ${hours.toLocaleString("ro-RO")} ore lucrate`,
      unit: "luna",
      quantity: months,
      unitPrice: price,
      amount: round2(months * price),
    };
    return { lines: price > 0 ? [line] : [], hours, total: line.amount };
  }

  const groups = new Map<string, { name: string; hours: number; amount: number; rates: Set<number> }>();
  for (const e of entries) {
    let key: string;
    let name: string;
    if (grouping === "member") {
      key = `${e.memberId}:${e.rate}`;
      name = `Servicii dezvoltare software — ${e.memberName}${e.memberPosition ? ` (${e.memberPosition})` : ""}`;
    } else if (grouping === "task") {
      key = e.taskId ?? "none";
      name = e.taskTitle ? `${project.name} — ${e.taskTitle}` : `${project.name} — alte activități`;
    } else {
      key = "all";
      name = `Servicii dezvoltare software — ${project.name}`;
    }
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { name, hours: 0, amount: 0, rates: new Set() }));
    g.hours += e.hours;
    g.amount += e.hours * e.rate;
    g.rates.add(e.rate);
  }

  const lines: InvoiceLinePreview[] = [...groups.entries()]
    .map(([key, g]) => {
      const quantity = round2(g.hours);
      const unitPrice = g.rates.size === 1 ? [...g.rates][0] : quantity ? round2(g.amount / quantity) : 0;
      return { key, name: g.name, description: periodText, unit: "ora", quantity, unitPrice, amount: round2(quantity * unitPrice) };
    })
    .filter((l) => l.quantity > 0)
    .sort((a, b) => b.amount - a.amount);

  return { lines, hours, total: round2(lines.reduce((a, l) => a + l.amount, 0)) };
}

const EU = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "EL", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "SK", "SI", "ES", "SE"]);

/** TVA implicit pentru servicii: RO → 21% S; client UE → taxare inversă (AE); extra-UE → scutit (E); firmă neplătitoare → O. */
export function defaultServiceVat(companyVatPayer: boolean, clientCountry: string | null | undefined): { vatRate: number; vatCategory: "S" | "AE" | "E" | "O" } {
  if (!companyVatPayer) return { vatRate: 0, vatCategory: "O" };
  const c = (clientCountry ?? "RO").toUpperCase();
  if (c === "RO") return { vatRate: 21, vatCategory: "S" };
  if (EU.has(c)) return { vatRate: 0, vatCategory: "AE" };
  return { vatRate: 0, vatCategory: "E" };
}
