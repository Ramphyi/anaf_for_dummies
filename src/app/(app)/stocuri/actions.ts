"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import {
  createInventory,
  createManualStockDocument,
  deleteStockDocument,
  deleteWarehouse,
  getStockDocumentDetail,
  saveWarehouse,
} from "@/lib/products/stock-server";
import { actorFrom } from "@/lib/server/activity";
import { runAction } from "@/lib/server/action";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dată invalidă");

function revalidateStock() {
  revalidatePath("/stocuri");
  revalidatePath("/produse");
}

const stockDocSchema = z.object({
  type: z.enum(["nir", "consumption", "transfer"]),
  date,
  warehouseId: z.string().min(1, "Alege gestiunea"),
  targetWarehouseId: z.string().optional().nullable(),
  partnerId: z.string().optional().nullable(),
  notes: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => v || null),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1, "Alege produsul"),
        quantity: z.coerce.number().positive("Cantitatea trebuie să fie pozitivă"),
        unitCost: z.coerce.number().min(0).optional().nullable(),
      }),
    )
    .min(1, "Adaugă cel puțin un produs"),
});

export type StockDocActionInput = z.input<typeof stockDocSchema>;

export async function createStockDocAction(input: StockDocActionInput) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const d = stockDocSchema.parse(input);
    const doc = await createManualStockDocument(actorFrom(ctx), { ...d, partnerId: d.partnerId || null, targetWarehouseId: d.targetWarehouseId || null });
    revalidateStock();
    if (d.partnerId) revalidatePath(`/furnizori/${d.partnerId}`);
    return { id: doc.id, number: doc.number };
  }, "Document de stoc creat");
}

const inventorySchema = z.object({
  date,
  warehouseId: z.string().min(1, "Alege gestiunea"),
  notes: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => v || null),
  counts: z.array(z.object({ productId: z.string().min(1), counted: z.coerce.number().min(0, "Cantitatea faptică nu poate fi negativă") })).min(1),
});

export async function createInventoryAction(input: z.input<typeof inventorySchema>) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const d = inventorySchema.parse(input);
    const r = await createInventory(actorFrom(ctx), d);
    revalidateStock();
    return { id: r.doc.id, number: r.doc.number, differences: r.differences };
  }, "Inventarul a fost înregistrat");
}

export async function deleteStockDocAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const doc = await deleteStockDocument(actorFrom(ctx), z.string().min(1).parse(id));
    revalidateStock();
    if (doc.purchaseInvoiceId) {
      revalidatePath("/cheltuieli");
      revalidatePath(`/cheltuieli/${doc.purchaseInvoiceId}`);
    }
    return null;
  }, "Documentul de stoc a fost șters");
}

/** Detaliile unui document de stoc (pentru panoul lateral). */
export async function getStockDocAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    return getStockDocumentDetail(ctx.company.id, z.string().min(1).parse(id));
  });
}

const warehouseSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().trim().min(2, "Denumirea este obligatorie"),
  code: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => v || null),
  address: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => v || null),
  isDefault: z.boolean().default(false),
});

export async function saveWarehouseAction(input: z.input<typeof warehouseSchema>) {
  return runAction(
    async () => {
      const ctx = await requirePermission("billing");
      const d = warehouseSchema.parse(input);
      const w = await saveWarehouse(actorFrom(ctx), d);
      revalidateStock();
      return w;
    },
    input.id ? "Gestiunea a fost actualizată" : "Gestiune adăugată",
  );
}

export async function deleteWarehouseAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    await deleteWarehouse(actorFrom(ctx), z.string().min(1).parse(id));
    revalidateStock();
    return null;
  }, "Gestiunea a fost ștearsă");
}
