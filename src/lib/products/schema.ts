import { z } from "zod";
import { CURRENCIES } from "@/lib/constants";

// Copie locală a enum-ului din schema DB (fișierul e importat și din client).
const VAT_CATEGORIES = ["S", "Z", "E", "AE", "K", "G", "O"] as const;

/** Sub acest prag (în UM-ul produsului) stocul e considerat „scăzut”. */
export const LOW_STOCK_THRESHOLD = 3;

export type StockState = "ok" | "low" | "out" | "negative";

export function stockState(qty: number): StockState {
  if (qty < 0) return "negative";
  if (qty === 0) return "out";
  if (qty <= LOW_STOCK_THRESHOLD) return "low";
  return "ok";
}

export const STOCK_STATE_LABELS: Record<StockState, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  ok: { label: "În stoc", tone: "success" },
  low: { label: "Stoc scăzut", tone: "warning" },
  out: { label: "Epuizat", tone: "neutral" },
  negative: { label: "Stoc negativ", tone: "danger" },
};

const optText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const productSchema = z.object({
  id: z.string().optional().nullable(),
  code: optText,
  name: z.string().trim().min(2, "Denumirea este obligatorie"),
  description: optText,
  type: z.enum(["product", "service"]),
  unit: z.string().trim().min(1, "Unitatea de măsură este obligatorie"),
  price: z.coerce.number({ error: "Preț invalid" }).finite().min(0, "Prețul nu poate fi negativ"),
  priceIncludesVat: z.boolean().default(false),
  currency: z.enum(CURRENCIES).default("RON"),
  vatRate: z.coerce.number().min(0).max(100),
  vatCategory: z.enum(VAT_CATEGORIES).default("S"),
  trackStock: z.boolean().default(false),
  purchasePrice: z.coerce.number().finite().min(0).optional().nullable(),
  ncCode: optText.refine((v) => !v || /^\d{4,10}$/.test(v), "Codul NC are 4–10 cifre (ex. 84713000)"),
  barcode: optText,
  category: optText,
  active: z.boolean().default(true),
});

export type ProductInput = z.input<typeof productSchema>;
