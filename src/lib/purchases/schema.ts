import { z } from "zod";
import { CURRENCIES, PURCHASE_STATUS, type Tone } from "@/lib/constants";

// Copii locale ale enum-urilor din schema DB (fișierul e importat și din client — evităm drizzle în bundle).
const EXPENSE_CATEGORIES = ["marfa", "servicii", "utilitati", "chirie", "software", "hardware", "transport", "marketing", "salarii", "taxe", "altele"] as const;
const PAYMENT_METHODS = ["bank", "cash", "card", "op", "compensation", "other"] as const;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dată invalidă");
const optText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const purchaseLineSchema = z.object({
  productId: z.string().optional().nullable(),
  name: z.string().trim().min(1, "Denumirea liniei este obligatorie"),
  unit: z.string().trim().min(1).default("buc"),
  quantity: z.coerce.number({ error: "Cantitate invalidă" }).finite().refine((v) => v !== 0, "Cantitatea nu poate fi 0"),
  unitPrice: z.coerce.number({ error: "Preț invalid" }).finite(),
  vatRate: z.coerce.number().min(0).max(100),
});

export const purchaseSchema = z
  .object({
    supplierId: z.string({ error: "Alege furnizorul" }).min(1, "Alege furnizorul"),
    number: z.string().trim().min(1, "Numărul facturii este obligatoriu"),
    issueDate: date,
    dueDate: date.optional().nullable().or(z.literal("").transform(() => null)),
    currency: z.enum(CURRENCIES).default("RON"),
    exchangeRate: z.coerce.number().positive("Cursul trebuie să fie pozitiv").default(1),
    category: z.enum(EXPENSE_CATEGORIES).default("altele"),
    projectId: z.string().optional().nullable(),
    notes: optText,
    lines: z.array(purchaseLineSchema).min(1, "Adaugă cel puțin o linie"),
  })
  .refine((d) => !d.dueDate || d.dueDate >= d.issueDate, { path: ["dueDate"], message: "Scadența nu poate fi înainte de data facturii" });

export type PurchaseInput = z.input<typeof purchaseSchema>;
export type PurchaseLineInput = z.input<typeof purchaseLineSchema>;

export const purchasePaymentSchema = z.object({
  purchaseInvoiceId: z.string().min(1),
  date,
  amount: z.coerce.number({ error: "Sumă invalidă" }).finite().positive("Suma trebuie să fie pozitivă"),
  method: z.enum(PAYMENT_METHODS).default("bank"),
  reference: optText,
  notes: optText,
});

export type PurchasePaymentInput = z.input<typeof purchasePaymentSchema>;

export const receiveStockSchema = z.object({
  purchaseInvoiceId: z.string().min(1),
  warehouseId: z.string().min(1, "Alege gestiunea"),
  date,
  lines: z
    .array(
      z.object({
        lineId: z.string(),
        productId: z.string().min(1),
        quantity: z.coerce.number().positive("Cantitatea trebuie să fie pozitivă"),
        unitCost: z.coerce.number().min(0),
      }),
    )
    .min(1, "Asociază cel puțin o linie cu un produs gestionat în stoc"),
});

export type ReceiveStockInput = z.input<typeof receiveStockSchema>;

/** Statusul afișat al unei facturi primite (scadență depășită → „overdue”). */
export function purchaseDisplayStatus(p: { status: string; dueDate: string | null; total: number; paidAmount: number }, today: string) {
  if ((p.status === "unpaid" || p.status === "partially_paid") && p.dueDate && p.dueDate < today && p.paidAmount < p.total) return "overdue";
  return p.status;
}

export const PURCHASE_DISPLAY_STATUS: Record<string, { label: string; tone: Tone }> = {
  ...PURCHASE_STATUS,
  overdue: { label: "Scadență depășită", tone: "danger" },
};
