import type { DocStatus } from "@/lib/db/schema";
import { todayIso } from "@/lib/format";

/** Statusul afișat: o factură emisă, neîncasată integral și cu scadența depășită devine „overdue”. */
export function displayStatus(doc: { kind?: string; status: DocStatus | string; dueDate: string | null; total: number; paidAmount: number }): DocStatus {
  const s = doc.status as DocStatus;
  if (
    (doc.kind ?? "invoice") === "invoice" &&
    (s === "issued" || s === "partially_paid") &&
    doc.dueDate &&
    doc.dueDate < todayIso() &&
    doc.paidAmount < doc.total
  ) {
    return "overdue";
  }
  return s;
}

export function remaining(doc: { total: number; paidAmount: number }) {
  return Math.max(0, Math.round((doc.total - doc.paidAmount) * 100) / 100);
}

/** Factura poate fi modificată cât timp nu a fost acceptată de ANAF și nu e închisă. */
export function isEditable(doc: { status: string; efacturaStatus: string }) {
  return !["cancelled", "storned", "converted"].includes(doc.status) && !["ok", "processing", "pending"].includes(doc.efacturaStatus);
}
