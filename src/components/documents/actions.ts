"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getExchangeRate } from "@/lib/anaf/bnr";
import { refreshInvoiceStatus, retractSimulatedSend, sendInvoiceToSpv } from "@/lib/anaf/service";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { DOC_KINDS, documents, PAYMENT_METHODS, payments, projects, warehouses, type DocKind } from "@/lib/db/schema";
import {
  cancelDocument,
  convertToInvoice,
  createCreditNote,
  createDocument,
  deleteDraft,
  deletePayment,
  duplicateDocument,
  issueDocument,
  recordPayment,
  updateDocument,
} from "@/lib/documents/server";
import { remaining } from "@/lib/documents/status";
import { formatMoney, todayIso } from "@/lib/format";
import { actorFrom } from "@/lib/server/activity";
import { runAction, zDate, zOptText } from "@/lib/server/action";
import { lineSchema, zOptDate, zOptId } from "./schemas";
import { revalidateDocument, sendDocumentEmail } from "./server";

const documentSchema = z
  .object({
    id: zOptId,
    kind: z.enum(DOC_KINDS),
    partnerId: z.string({ error: "Alege clientul" }).min(1, "Alege clientul"),
    seriesId: zOptId,
    issueDate: zDate,
    dueDate: zOptDate,
    deliveryDate: zOptDate,
    currency: z.string().length(3, "Monedă invalidă"),
    exchangeRate: z.number({ error: "Curs invalid" }).positive("Cursul valutar trebuie să fie pozitiv"),
    notes: zOptText,
    internalNotes: zOptText,
    issuedBy: zOptText,
    delegateName: zOptText,
    delegateIdCard: zOptText,
    transportMeans: zOptText,
    warehouseId: zOptId,
    projectId: zOptId,
    issue: z.boolean().default(false),
    lines: z.array(lineSchema).min(1, "Adaugă cel puțin o linie"),
  })
  .refine((d) => !d.dueDate || d.dueDate >= d.issueDate, { path: ["dueDate"], message: "Scadența nu poate fi înaintea datei de emitere" });

export type DocumentFormInput = z.input<typeof documentSchema>;

async function kindOf(companyId: string, id: string): Promise<DocKind> {
  const d = await db.query.documents.findFirst({ where: and(eq(documents.id, id), eq(documents.companyId, companyId)), columns: { kind: true } });
  if (!d) throw new Error("Documentul nu există.");
  return d.kind;
}

/** Creează sau actualizează o factură / proformă / aviz. */
export async function saveDocumentAction(input: DocumentFormInput) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const d = documentSchema.parse(input);
    const actor = actorFrom(ctx);
    if (d.projectId) {
      const p = await db.query.projects.findFirst({ where: and(eq(projects.id, d.projectId), eq(projects.companyId, ctx.company.id)), columns: { id: true } });
      if (!p) throw new Error("Proiectul selectat nu există.");
    }
    if (d.warehouseId) {
      const w = await db.query.warehouses.findFirst({
        where: and(eq(warehouses.id, d.warehouseId), eq(warehouses.companyId, ctx.company.id)),
        columns: { id: true },
      });
      if (!w) throw new Error("Gestiunea selectată nu există.");
    }
    const payload = {
      partnerId: d.partnerId,
      seriesId: d.seriesId,
      issueDate: d.issueDate,
      dueDate: d.kind === "notice" ? null : d.dueDate,
      deliveryDate: d.deliveryDate,
      currency: d.currency,
      exchangeRate: d.currency === "RON" ? 1 : d.exchangeRate,
      notes: d.notes,
      internalNotes: d.internalNotes,
      issuedBy: d.issuedBy,
      delegateName: d.delegateName,
      delegateIdCard: d.delegateIdCard,
      transportMeans: d.transportMeans,
      warehouseId: d.warehouseId,
      projectId: d.projectId,
      issue: d.issue,
      lines: d.lines,
    };
    let id: string;
    if (d.id) {
      const existingKind = await kindOf(ctx.company.id, d.id);
      if (existingKind !== d.kind) throw new Error("Tipul documentului nu poate fi schimbat.");
      await updateDocument(actor, d.id, payload);
      id = d.id;
    } else {
      id = await createDocument(actor, { kind: d.kind, ...payload });
    }
    revalidateDocument(d.kind, id);
    const saved = await db.query.documents.findFirst({ where: eq(documents.id, id), columns: { fullNumber: true, status: true } });
    return { id, kind: d.kind, fullNumber: saved?.fullNumber ?? "", status: saved?.status ?? "draft" };
  });
}

export async function issueDocumentAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const kind = await kindOf(ctx.company.id, id);
    const fullNumber = await issueDocument(actorFrom(ctx), id);
    revalidateDocument(kind, id);
    return { fullNumber };
  });
}

export async function deleteDraftAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const kind = await kindOf(ctx.company.id, id);
    await deleteDraft(actorFrom(ctx), id);
    revalidateDocument(kind);
    return { kind };
  }, "Ciorna a fost ștearsă");
}

export async function cancelDocumentAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const kind = await kindOf(ctx.company.id, id);
    await cancelDocument(actorFrom(ctx), id);
    revalidateDocument(kind, id);
    return null;
  }, "Documentul a fost anulat");
}

export async function duplicateDocumentAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const kind = await kindOf(ctx.company.id, id);
    const newId = await duplicateDocument(actorFrom(ctx), id, todayIso());
    revalidateDocument(kind, newId);
    return { id: newId, kind };
  }, "Documentul a fost duplicat ca ciornă");
}

const creditSchema = z.object({
  issueDate: zDate,
  reason: zOptText,
  lines: z.array(z.object({ lineId: z.string(), quantity: z.number().positive("Cantitatea de stornat trebuie să fie pozitivă") })).optional(),
});

export async function createCreditNoteAction(id: string, input: z.input<typeof creditSchema>) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const d = creditSchema.parse(input);
    if (d.lines) {
      const original = await db.query.documents.findFirst({
        where: and(eq(documents.id, id), eq(documents.companyId, ctx.company.id)),
        with: { lines: true },
      });
      if (!original) throw new Error("Factura originală nu există.");
      for (const l of d.lines) {
        const orig = original.lines.find((x) => x.id === l.lineId);
        if (!orig) throw new Error("Linie inexistentă pe factura originală.");
        if (l.quantity > Math.abs(orig.quantity) + 1e-9)
          throw new Error(`Nu poți storna mai mult de ${Math.abs(orig.quantity)} ${orig.unit} pentru „${orig.name}”.`);
      }
    }
    const creditId = await createCreditNote(actorFrom(ctx), id, { issueDate: d.issueDate, reason: d.reason ?? undefined, lines: d.lines });
    revalidateDocument("invoice", id);
    revalidateDocument("invoice", creditId);
    return { id: creditId };
  }, "Factura storno a fost emisă");
}

export async function convertToInvoiceAction(id: string, input: { issueDate: string; issue: boolean }) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const d = z.object({ issueDate: zDate, issue: z.boolean() }).parse(input);
    const kind = await kindOf(ctx.company.id, id);
    const invoiceId = await convertToInvoice(actorFrom(ctx), id, d);
    revalidateDocument(kind, id);
    revalidateDocument("invoice", invoiceId);
    return { id: invoiceId };
  }, "Factura a fost generată");
}

/* ------------------------------------------------------------------ */
/* e-Factura                                                           */
/* ------------------------------------------------------------------ */

export async function sendToSpvAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("anaf");
    const r = await sendInvoiceToSpv(actorFrom(ctx), id);
    revalidateDocument("invoice", id);
    revalidatePath("/efactura");
    if (!r.ok) throw new Error(`Factura nu a putut fi transmisă: ${r.errors.slice(0, 3).join("; ")}`);
    return { uploadId: r.uploadId, simulated: r.simulated };
  });
}

/** Retrage o transmitere simulată (factura nu a ajuns la ANAF). */
export async function retractSimulatedSendAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("anaf");
    await retractSimulatedSend(actorFrom(ctx), id);
    revalidateDocument("invoice", id);
    revalidatePath("/efactura");
    return null;
  }, "Transmiterea simulată a fost retrasă");
}

export async function refreshSpvStatusAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("anaf");
    const r = await refreshInvoiceStatus(actorFrom(ctx), id);
    revalidateDocument("invoice", id);
    revalidatePath("/efactura");
    return { state: r.state, message: r.message };
  });
}

/* ------------------------------------------------------------------ */
/* Email                                                               */
/* ------------------------------------------------------------------ */

const emailSchema = z.object({
  to: z
    .string()
    .trim()
    .min(3, "Completează adresa destinatarului")
    .transform((s) => s.split(/[,;\s]+/).filter(Boolean))
    .pipe(z.array(z.email("Adresă de email invalidă")).min(1)),
  subject: zOptText,
  message: zOptText,
});

export async function sendDocumentEmailAction(id: string, input: z.input<typeof emailSchema>) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const d = emailSchema.parse(input);
    const kind = await kindOf(ctx.company.id, id);
    await sendDocumentEmail(actorFrom(ctx), id, { to: d.to, subject: d.subject ?? undefined, message: d.message ?? undefined });
    revalidateDocument(kind, id);
    return null;
  }, "Email trimis");
}

/* ------------------------------------------------------------------ */
/* Încasări                                                            */
/* ------------------------------------------------------------------ */

const paymentSchema = z.object({
  documentId: z.string({ error: "Alege factura" }).min(1, "Alege factura"),
  date: zDate,
  amount: z.number({ error: "Sumă invalidă" }).finite().positive("Suma trebuie să fie pozitivă"),
  method: z.enum(PAYMENT_METHODS),
  reference: zOptText,
  notes: zOptText,
  issueReceipt: z.boolean().default(false),
});

export type PaymentFormInput = z.input<typeof paymentSchema>;

export async function recordPaymentAction(input: PaymentFormInput) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const d = paymentSchema.parse(input);
    const doc = await db.query.documents.findFirst({ where: and(eq(documents.id, d.documentId), eq(documents.companyId, ctx.company.id)) });
    if (!doc) throw new Error("Factura nu există.");
    const rest = remaining(doc);
    if (d.amount > rest + 0.009) throw new Error(`Suma depășește restul de plată (${formatMoney(rest, doc.currency)}).`);
    const p = await recordPayment(actorFrom(ctx), { ...d, issueReceipt: d.method === "cash" && d.issueReceipt });
    revalidateDocument("invoice", d.documentId);
    return { id: p.id, receiptNumber: p.receiptNumber, receiptSeries: p.receiptSeries };
  }, "Încasare înregistrată");
}

export async function deletePaymentAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const p = await db.query.payments.findFirst({ where: and(eq(payments.id, id), eq(payments.companyId, ctx.company.id)), columns: { documentId: true } });
    await deletePayment(actorFrom(ctx), id);
    revalidateDocument("invoice", p?.documentId);
    return null;
  }, "Încasare ștearsă");
}

/* ------------------------------------------------------------------ */
/* Curs BNR                                                            */
/* ------------------------------------------------------------------ */

export async function getExchangeRateAction(currency: string, date: string) {
  return runAction(async () => {
    await requirePermission("billing");
    const c = z.string().length(3).parse(currency);
    const day = zDate.parse(date);
    const r = await getExchangeRate(c, day);
    if (!r) throw new Error(`Cursul BNR pentru ${c} nu este disponibil. Introdu-l manual.`);
    return r;
  });
}
