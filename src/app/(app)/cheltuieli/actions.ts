"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getExchangeRate } from "@/lib/anaf/bnr";
import { requirePermission } from "@/lib/auth/session";
import type { PurchaseInput, PurchasePaymentInput, ReceiveStockInput } from "@/lib/purchases/schema";
import {
  deletePurchase,
  deletePurchasePayment,
  receivePurchaseStock,
  recordPurchasePayment,
  savePurchase,
  setPurchaseCancelled,
} from "@/lib/purchases/server";
import { actorFrom } from "@/lib/server/activity";
import { runAction } from "@/lib/server/action";

function revalidatePurchases(id?: string | null) {
  revalidatePath("/cheltuieli");
  if (id) revalidatePath(`/cheltuieli/${id}`);
  revalidatePath("/furnizori");
  revalidatePath("/dashboard");
}

export async function savePurchaseAction(input: PurchaseInput, id?: string | null) {
  return runAction(
    async () => {
      const ctx = await requirePermission("billing");
      const purchaseId = await savePurchase(actorFrom(ctx), input, id);
      revalidatePurchases(purchaseId);
      return { id: purchaseId };
    },
    id ? "Cheltuiala a fost actualizată" : "Cheltuială înregistrată",
  );
}

export async function recordPurchasePaymentAction(input: PurchasePaymentInput) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const p = await recordPurchasePayment(actorFrom(ctx), input);
    revalidatePurchases(p.purchaseInvoiceId);
    revalidatePath("/incasari");
    return { id: p.id };
  }, "Plată înregistrată");
}

export async function deletePurchasePaymentAction(paymentId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const p = await deletePurchasePayment(actorFrom(ctx), z.string().min(1).parse(paymentId));
    revalidatePurchases(p.purchaseInvoiceId);
    revalidatePath("/incasari");
    return null;
  }, "Plata a fost ștearsă");
}

export async function setPurchaseCancelledAction(id: string, cancelled: boolean) {
  return runAction(
    async () => {
      const ctx = await requirePermission("billing");
      await setPurchaseCancelled(actorFrom(ctx), z.string().min(1).parse(id), cancelled);
      revalidatePurchases(id);
      return null;
    },
    cancelled ? "Cheltuiala a fost anulată" : "Cheltuiala a fost reactivată",
  );
}

export async function deletePurchaseAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    await deletePurchase(actorFrom(ctx), z.string().min(1).parse(id));
    revalidatePurchases();
    revalidatePath("/efactura");
    return null;
  }, "Cheltuiala a fost ștearsă");
}

export async function receivePurchaseStockAction(input: ReceiveStockInput) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const doc = await receivePurchaseStock(actorFrom(ctx), input);
    revalidatePurchases(input.purchaseInvoiceId);
    revalidatePath("/stocuri");
    revalidatePath("/produse");
    return { id: doc.id, number: doc.number };
  }, "Marfa a fost recepționată în stoc");
}

/** Cursul BNR pentru o monedă la o dată (pentru formularul de cheltuieli). */
export async function exchangeRateAction(currency: string, date: string) {
  return runAction(async () => {
    await requirePermission("billing");
    const r = await getExchangeRate(z.string().length(3).parse(currency), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(date));
    if (!r) throw new Error(`Nu am găsit cursul BNR pentru ${currency}.`);
    return r;
  });
}
