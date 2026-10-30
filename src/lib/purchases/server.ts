import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/lib/db";
import { partners, payments, projects, purchaseInvoices, purchaseLines, spvMessages, stockDocuments, warehouses } from "@/lib/db/schema";
import { computeTotals } from "@/lib/documents/totals";
import { nextStockDocNumber, trackedProducts } from "@/lib/products/stock-server";
import { logActivity, type Actor } from "@/lib/server/activity";
import { assertCashLimit } from "@/lib/server/cash-limits";
import { createStockDocument } from "@/lib/stock/server";
import { round2 } from "@/lib/utils";
import {
  purchasePaymentSchema,
  purchaseSchema,
  receiveStockSchema,
  type PurchaseInput,
  type PurchasePaymentInput,
  type ReceiveStockInput,
} from "./schema";

/** Recalculează suma plătită și statusul unei facturi primite (din plățile „out”). */
export async function recalcPurchase(tx: DbOrTx, purchaseInvoiceId: string) {
  const pi = await tx.query.purchaseInvoices.findFirst({ where: eq(purchaseInvoices.id, purchaseInvoiceId) });
  if (!pi) return;
  const [row] = await tx
    .select({ paid: sql<number>`coalesce(sum(${payments.amount}), 0)` })
    .from(payments)
    .where(and(eq(payments.purchaseInvoiceId, purchaseInvoiceId), eq(payments.direction, "out")));
  const paid = round2(row?.paid ?? 0);
  let status = pi.status;
  if (status !== "cancelled") {
    status = paid <= 0 ? "unpaid" : paid + 0.009 >= pi.total ? "paid" : "partially_paid";
  }
  await tx.update(purchaseInvoices).set({ paidAmount: paid, status }).where(eq(purchaseInvoices.id, purchaseInvoiceId));
}

/** Creează (fără `id`) sau actualizează o factură primită. Returnează id-ul. */
export async function savePurchase(actor: Actor, input: PurchaseInput, id?: string | null): Promise<string> {
  const d = purchaseSchema.parse(input);
  const totals = computeTotals(d.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, vatRate: l.vatRate })));

  return db.transaction(async (tx) => {
    const supplier = await tx.query.partners.findFirst({ where: and(eq(partners.id, d.supplierId), eq(partners.companyId, actor.companyId)) });
    if (!supplier) throw new Error("Furnizorul nu există.");
    if (supplier.kind === "client") await tx.update(partners).set({ kind: "both" }).where(eq(partners.id, supplier.id));
    if (d.projectId) {
      const project = await tx.query.projects.findFirst({ where: and(eq(projects.id, d.projectId), eq(projects.companyId, actor.companyId)), columns: { id: true } });
      if (!project) throw new Error("Proiectul nu există.");
    }

    const values = {
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierCui: supplier.cui,
      number: d.number,
      issueDate: d.issueDate,
      dueDate: d.dueDate ?? null,
      currency: d.currency,
      exchangeRate: d.currency === "RON" ? 1 : d.exchangeRate,
      subtotal: totals.subtotal,
      vatTotal: totals.vatTotal,
      total: totals.total,
      category: d.category,
      projectId: d.projectId || null,
      notes: d.notes,
    };

    let purchaseId: string;
    if (id) {
      const existing = await tx.query.purchaseInvoices.findFirst({ where: and(eq(purchaseInvoices.id, id), eq(purchaseInvoices.companyId, actor.companyId)) });
      if (!existing) throw new Error("Factura nu există.");
      await tx.update(purchaseInvoices).set(values).where(eq(purchaseInvoices.id, id));
      await tx.delete(purchaseLines).where(eq(purchaseLines.purchaseInvoiceId, id));
      purchaseId = id;
    } else {
      const dup = await tx.query.purchaseInvoices.findFirst({
        where: and(eq(purchaseInvoices.companyId, actor.companyId), eq(purchaseInvoices.supplierId, supplier.id), eq(purchaseInvoices.number, d.number)),
        columns: { id: true },
      });
      if (dup) throw new Error(`Factura ${d.number} de la ${supplier.name} este deja înregistrată.`);
      const [created] = await tx
        .insert(purchaseInvoices)
        .values({ companyId: actor.companyId, ...values, source: "manual" })
        .returning({ id: purchaseInvoices.id });
      purchaseId = created.id;
    }

    await tx.insert(purchaseLines).values(
      d.lines.map((l, i) => ({
        purchaseInvoiceId: purchaseId,
        position: i,
        productId: l.productId || null,
        name: l.name,
        unit: l.unit,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        vatRate: l.vatRate,
        netAmount: totals.lines[i].netAmount,
        vatAmount: totals.lines[i].vatAmount,
        totalAmount: totals.lines[i].totalAmount,
      })),
    );
    await recalcPurchase(tx, purchaseId);
    await logActivity(
      actor,
      {
        entity: "purchase",
        entityId: purchaseId,
        action: id ? "updated" : "created",
        message: id ? `Cheltuiala ${d.number} (${supplier.name}) a fost modificată` : `Cheltuială nouă: ${d.number} de la ${supplier.name} — ${totals.total} ${d.currency}`,
      },
      tx,
    );
    return purchaseId;
  });
}

/** Înregistrează o plată către furnizor (payments.direction = "out"). */
export async function recordPurchasePayment(actor: Actor, input: PurchasePaymentInput) {
  const d = purchasePaymentSchema.parse(input);
  return db.transaction(async (tx) => {
    const pi = await tx.query.purchaseInvoices.findFirst({
      where: and(eq(purchaseInvoices.id, d.purchaseInvoiceId), eq(purchaseInvoices.companyId, actor.companyId)),
    });
    if (!pi) throw new Error("Factura nu există.");
    if (pi.status === "cancelled") throw new Error("Factura este anulată.");
    const rest = round2(pi.total - pi.paidAmount);
    if (d.amount > rest + 0.009) throw new Error(`Suma depășește restul de plată (${rest} ${pi.currency}).`);
    if (d.method === "cash") {
      const supplier = pi.supplierId ? await tx.query.partners.findFirst({ where: eq(partners.id, pi.supplierId), columns: { entityType: true } }) : null;
      await assertCashLimit(tx, {
        companyId: actor.companyId,
        partnerId: pi.supplierId,
        partnerName: pi.supplierName,
        isIndividual: supplier?.entityType === "pf",
        direction: "out",
        date: d.date,
        amountRon: round2(d.amount * (pi.currency === "RON" ? 1 : pi.exchangeRate)),
      });
    }
    const [p] = await tx
      .insert(payments)
      .values({
        companyId: actor.companyId,
        direction: "out",
        purchaseInvoiceId: pi.id,
        partnerId: pi.supplierId,
        partnerName: pi.supplierName,
        date: d.date,
        amount: round2(d.amount),
        currency: pi.currency,
        method: d.method,
        reference: d.reference,
        notes: d.notes,
        createdBy: actor.userId ?? null,
      })
      .returning();
    await recalcPurchase(tx, pi.id);
    await logActivity(
      actor,
      { entity: "payment", entityId: p.id, action: "created", message: `Plată ${round2(d.amount)} ${pi.currency} către ${pi.supplierName} pentru ${pi.number}` },
      tx,
    );
    return p;
  });
}

export async function deletePurchasePayment(actor: Actor, paymentId: string) {
  return db.transaction(async (tx) => {
    const p = await tx.query.payments.findFirst({ where: and(eq(payments.id, paymentId), eq(payments.companyId, actor.companyId), eq(payments.direction, "out")) });
    if (!p) throw new Error("Plata nu există.");
    await tx.delete(payments).where(eq(payments.id, paymentId));
    if (p.purchaseInvoiceId) await recalcPurchase(tx, p.purchaseInvoiceId);
    await logActivity(actor, { entity: "payment", entityId: paymentId, action: "deleted", message: `Plată de ${p.amount} ${p.currency} către ${p.partnerName ?? "furnizor"} ștearsă` }, tx);
    return p;
  });
}

/** Anulează / reactivează o factură primită. */
export async function setPurchaseCancelled(actor: Actor, id: string, cancelled: boolean) {
  return db.transaction(async (tx) => {
    const pi = await tx.query.purchaseInvoices.findFirst({ where: and(eq(purchaseInvoices.id, id), eq(purchaseInvoices.companyId, actor.companyId)) });
    if (!pi) throw new Error("Factura nu există.");
    if (cancelled && pi.paidAmount > 0) throw new Error("Factura are plăți înregistrate. Șterge întâi plățile.");
    await tx.update(purchaseInvoices).set({ status: cancelled ? "cancelled" : "unpaid" }).where(eq(purchaseInvoices.id, id));
    if (!cancelled) await recalcPurchase(tx, id);
    await logActivity(actor, { entity: "purchase", entityId: id, action: cancelled ? "cancelled" : "restored", message: `Cheltuiala ${pi.number} (${pi.supplierName}) ${cancelled ? "anulată" : "reactivată"}` }, tx);
  });
}

/** Șterge definitiv o factură primită (cu liniile și plățile ei). Recepția în stoc trebuie ștearsă înainte. */
export async function deletePurchase(actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const pi = await tx.query.purchaseInvoices.findFirst({ where: and(eq(purchaseInvoices.id, id), eq(purchaseInvoices.companyId, actor.companyId)) });
    if (!pi) throw new Error("Factura nu există.");
    const nir = await tx.query.stockDocuments.findFirst({ where: and(eq(stockDocuments.companyId, actor.companyId), eq(stockDocuments.purchaseInvoiceId, id)) });
    if (nir) throw new Error(`Factura are recepția ${nir.number} în stoc. Șterge întâi documentul din Stocuri.`);
    await tx.delete(payments).where(and(eq(payments.purchaseInvoiceId, id), eq(payments.companyId, actor.companyId)));
    await tx.delete(purchaseLines).where(eq(purchaseLines.purchaseInvoiceId, id));
    await tx.delete(purchaseInvoices).where(eq(purchaseInvoices.id, id));
    // mesajul SPV rămâne disponibil pentru un nou import
    await tx.update(spvMessages).set({ purchaseInvoiceId: null }).where(and(eq(spvMessages.companyId, actor.companyId), eq(spvMessages.purchaseInvoiceId, id)));
    await logActivity(actor, { entity: "purchase", entityId: id, action: "deleted", message: `Cheltuiala ${pi.number} (${pi.supplierName}) ștearsă` }, tx);
    return pi;
  });
}

/** Recepție în stoc (NIR) pentru liniile unei facturi primite, asociate cu produse gestionate. */
export async function receivePurchaseStock(actor: Actor, input: ReceiveStockInput) {
  const d = receiveStockSchema.parse(input);
  return db.transaction(async (tx) => {
    const pi = await tx.query.purchaseInvoices.findFirst({
      where: and(eq(purchaseInvoices.id, d.purchaseInvoiceId), eq(purchaseInvoices.companyId, actor.companyId)),
      with: { lines: true },
    });
    if (!pi) throw new Error("Factura nu există.");
    if (pi.status === "cancelled") throw new Error("Factura este anulată.");
    if (pi.stockReceived) throw new Error("Factura a fost deja recepționată în stoc.");
    const lineIds = new Set(pi.lines.map((l) => l.id));
    if (d.lines.some((l) => !lineIds.has(l.lineId))) throw new Error("Liniile nu aparțin facturii.");
    await trackedProducts(tx, actor.companyId, [...new Set(d.lines.map((l) => l.productId))]);
    const wh = await tx.query.warehouses.findFirst({ where: and(eq(warehouses.id, d.warehouseId), eq(warehouses.companyId, actor.companyId)), columns: { id: true } });
    if (!wh) throw new Error("Gestiunea nu există.");

    const number = await nextStockDocNumber(tx, actor.companyId, "nir");
    const doc = await createStockDocument(tx, actor, {
      type: "nir",
      date: d.date,
      warehouseId: wh.id,
      partnerId: pi.supplierId,
      purchaseInvoiceId: pi.id,
      number,
      notes: `Recepție factură ${pi.number} — ${pi.supplierName}`,
      lines: d.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitCost: round2(l.unitCost) })),
    });
    // memorăm asocierea linie → produs pentru viitor
    for (const l of d.lines) {
      await tx.update(purchaseLines).set({ productId: l.productId }).where(eq(purchaseLines.id, l.lineId));
    }
    await tx.update(purchaseInvoices).set({ stockReceived: true }).where(eq(purchaseInvoices.id, pi.id));
    await logActivity(actor, { entity: "stock", entityId: doc.id, action: "created", message: `${number}: recepție în stoc pentru factura ${pi.number} (${pi.supplierName})` }, tx);
    return doc;
  });
}

/* ------------------------------ Interogări ------------------------------ */

export async function getPurchase(companyId: string, id: string) {
  const pi = await db.query.purchaseInvoices.findFirst({
    where: and(eq(purchaseInvoices.id, id), eq(purchaseInvoices.companyId, companyId)),
    with: {
      lines: { orderBy: (l, { asc }) => [asc(l.position)], with: { product: { columns: { id: true, name: true, code: true, trackStock: true, unit: true } } } },
      payments: { orderBy: (p, { desc }) => [desc(p.date)] },
      supplier: true,
    },
  });
  if (!pi) return null;
  const [project, nirs] = await Promise.all([
    pi.projectId ? db.query.projects.findFirst({ where: eq(projects.id, pi.projectId), columns: { id: true, name: true, code: true, color: true } }) : null,
    db.query.stockDocuments.findMany({ where: and(eq(stockDocuments.companyId, companyId), eq(stockDocuments.purchaseInvoiceId, id)), columns: { id: true, number: true, date: true } }),
  ]);
  return { ...pi, project: project ?? null, nirs };
}

/** Sold de plată (RON) pe furnizori, pentru o listă de id-uri. */
export async function supplierBalances(companyId: string, supplierIds: string[]) {
  if (!supplierIds.length) return new Map<string, number>();
  const rows = await db
    .select({
      supplierId: purchaseInvoices.supplierId,
      rest: sql<number>`coalesce(sum((${purchaseInvoices.total} - ${purchaseInvoices.paidAmount}) * ${purchaseInvoices.exchangeRate}), 0)`,
    })
    .from(purchaseInvoices)
    .where(
      and(
        eq(purchaseInvoices.companyId, companyId),
        inArray(purchaseInvoices.supplierId, supplierIds),
        inArray(purchaseInvoices.status, ["unpaid", "partially_paid"]),
      ),
    )
    .groupBy(purchaseInvoices.supplierId);
  return new Map(rows.map((r) => [r.supplierId ?? "", round2(r.rest)]));
}
