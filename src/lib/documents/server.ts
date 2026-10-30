import "server-only";
import { and, asc, desc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { db, type DbOrTx, type Tx } from "@/lib/db";
import {
  documentLines,
  documents,
  documentSeries,
  partners,
  payments,
  timeEntries,
  type DocKind,
  type DocumentSeriesType,
  type PaymentMethod,
  type VatCategory,
} from "@/lib/db/schema";
import { computeTotals } from "@/lib/documents/totals";
import { DOC_KIND_LABELS, vatRateProblem } from "@/lib/constants";
import { formatDate, todayIso } from "@/lib/format";
import { round2 } from "@/lib/utils";
import { logActivity, type Actor } from "@/lib/server/activity";
import { assertCashLimit } from "@/lib/server/cash-limits";
import { applySaleStock, revertSaleStock } from "@/lib/stock/server";

/* ------------------------------------------------------------------ */
/* Serii & numerotare                                                  */
/* ------------------------------------------------------------------ */

export async function getSeries(companyId: string, type: DocumentSeriesType, seriesId?: string | null, tx: DbOrTx = db) {
  if (seriesId) {
    const s = await tx.query.documentSeries.findFirst({
      where: and(eq(documentSeries.id, seriesId), eq(documentSeries.companyId, companyId)),
    });
    if (s) return s;
  }
  const all = await tx.query.documentSeries.findMany({
    where: and(eq(documentSeries.companyId, companyId), eq(documentSeries.type, type), eq(documentSeries.active, true)),
  });
  const s = all.find((x) => x.isDefault) ?? all[0];
  if (s) return s;
  // Creează automat o serie implicită dacă nu există.
  const prefix = { invoice: "FCT", proforma: "PRF", notice: "AVZ", receipt: "CHT" }[type];
  const [created] = await tx.insert(documentSeries).values({ companyId, type, prefix, isDefault: true }).returning();
  return created;
}

/**
 * Facturile și avizele se numerotează cronologic în fiecare serie: un document nu poate purta
 * o dată anterioară celui emis înaintea lui și nici o dată din viitor.
 */
async function assertChronological(tx: Tx, companyId: string, kind: DocKind, series: string, issueDate: string, number?: number) {
  if (kind === "proforma") return; // proforma nu este document fiscal
  const label = kind === "notice" ? "avizului" : "facturii";
  if (issueDate > todayIso()) throw new Error(`Data ${label} (${formatDate(issueDate)}) nu poate fi în viitor.`);
  const scope = and(eq(documents.companyId, companyId), eq(documents.kind, kind), eq(documents.series, series), ne(documents.status, "draft"));
  const columns = { fullNumber: true, issueDate: true } as const;
  // `number` lipsește la emitere (documentul primește ultimul număr), există la modificarea unui document emis.
  const prev = await tx.query.documents.findFirst({ where: number === undefined ? scope : and(scope, lt(documents.number, number)), orderBy: desc(documents.number), columns });
  if (prev && issueDate < prev.issueDate) {
    throw new Error(
      `Data ${label} (${formatDate(issueDate)}) este anterioară documentului ${prev.fullNumber} din ${formatDate(prev.issueDate)}. Numerotarea în serie trebuie să fie cronologică — alege o dată de la ${formatDate(prev.issueDate)} încoace.`,
    );
  }
  if (number === undefined) return;
  const next = await tx.query.documents.findFirst({ where: and(scope, gt(documents.number, number)), orderBy: asc(documents.number), columns });
  if (next && issueDate > next.issueDate) {
    throw new Error(`Data ${label} (${formatDate(issueDate)}) este ulterioară documentului următor ${next.fullNumber} din ${formatDate(next.issueDate)}. Numerotarea în serie trebuie să fie cronologică.`);
  }
}

/** Cota TVA trebuie să fie cea în vigoare la data livrării (sau a emiterii, dacă livrarea nu e completată). */
function assertVatRates(lines: Pick<LineDraft, "vatRate" | "vatCategory">[], issueDate: string, deliveryDate?: string | null) {
  const chargeDate = deliveryDate || issueDate;
  for (const [i, l] of lines.entries()) {
    const problem = (l.vatCategory ?? "S") === "S" ? vatRateProblem(l.vatRate, chargeDate) : null;
    if (problem) throw new Error(`Linia ${i + 1}: ${problem}`);
  }
}

/** Alocă următorul număr din serie (atomic, în tranzacție). */
export async function allocateNumber(tx: Tx, companyId: string, type: DocumentSeriesType, seriesId?: string | null) {
  const s = await getSeries(companyId, type, seriesId, tx);
  const [updated] = await tx
    .update(documentSeries)
    .set({ nextNumber: sql`${documentSeries.nextNumber} + 1` })
    .where(eq(documentSeries.id, s.id))
    .returning();
  const number = updated.nextNumber - 1;
  return {
    seriesId: s.id,
    series: s.prefix,
    number,
    fullNumber: `${s.prefix}${String(number).padStart(s.padding, "0")}`,
  };
}

const DRAFT_SERIES = "CIORNA";

async function nextDraftNumber(tx: DbOrTx, companyId: string, kind: DocKind) {
  const [row] = await tx
    .select({ max: sql<number>`coalesce(max(${documents.number}), 0)` })
    .from(documents)
    .where(and(eq(documents.companyId, companyId), eq(documents.kind, kind), eq(documents.series, DRAFT_SERIES)));
  const number = (row?.max ?? 0) + 1;
  return { series: DRAFT_SERIES, number, fullNumber: `CIORNĂ #${number}` };
}

/* ------------------------------------------------------------------ */
/* Creare / actualizare                                                */
/* ------------------------------------------------------------------ */

export type LineDraft = {
  productId?: string | null;
  name: string;
  description?: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  vatRate: number;
  vatCategory?: VatCategory;
};

export type DocumentInput = {
  kind: DocKind;
  partnerId: string;
  seriesId?: string | null;
  issueDate: string;
  dueDate?: string | null;
  deliveryDate?: string | null;
  currency?: string;
  exchangeRate?: number;
  notes?: string | null;
  internalNotes?: string | null;
  issuedBy?: string | null;
  issuerCnp?: string | null;
  delegateName?: string | null;
  delegateIdCard?: string | null;
  transportMeans?: string | null;
  warehouseId?: string | null;
  projectId?: string | null;
  recurringId?: string | null;
  relatedDocumentId?: string | null;
  isCreditNote?: boolean;
  /** true = emite direct (alocă număr din serie); false = ciornă */
  issue?: boolean;
  lines: LineDraft[];
};

async function partnerSnapshot(tx: DbOrTx, companyId: string, partnerId: string) {
  const p = await tx.query.partners.findFirst({ where: and(eq(partners.id, partnerId), eq(partners.companyId, companyId)) });
  if (!p) throw new Error("Clientul selectat nu există.");
  return {
    partnerId: p.id,
    clientName: p.name,
    clientCui: p.cui,
    clientRegCom: p.regCom,
    clientVatPayer: p.vatPayer,
    clientEntityType: p.entityType,
    clientAddress: p.address,
    clientCity: p.city,
    clientCounty: p.county,
    clientCountry: p.country,
    clientEmail: p.email,
  };
}

function lineRows(documentId: string, lines: LineDraft[]) {
  const totals = computeTotals(lines);
  return {
    totals,
    rows: lines.map((l, i) => ({
      documentId,
      position: i,
      productId: l.productId || null,
      name: l.name,
      description: l.description || null,
      unit: l.unit,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent ?? 0,
      vatRate: l.vatRate,
      vatCategory: l.vatCategory ?? "S",
      netAmount: totals.lines[i].netAmount,
      discountAmount: totals.lines[i].discountAmount,
      vatAmount: totals.lines[i].vatAmount,
      totalAmount: totals.lines[i].totalAmount,
    })),
  };
}

export async function createDocument(actor: Actor, input: DocumentInput): Promise<string> {
  if (!input.lines.length) throw new Error("Documentul trebuie să aibă cel puțin o linie.");
  // Storno-ul păstrează cota facturii originale (art. 330 Cod fiscal).
  if (!input.isCreditNote) assertVatRates(input.lines, input.issueDate, input.deliveryDate);
  const id = await db.transaction(async (tx) => {
    const company = await tx.query.companies.findFirst({ where: (c, { eq }) => eq(c.id, actor.companyId) });
    if (!company) throw new Error("Firmă inexistentă.");
    const snapshot = await partnerSnapshot(tx, actor.companyId, input.partnerId);
    const numbering = input.issue
      ? await allocateNumber(tx, actor.companyId, input.kind, input.seriesId)
      : { seriesId: input.seriesId ?? null, ...(await nextDraftNumber(tx, actor.companyId, input.kind)) };
    if (input.issue) await assertChronological(tx, actor.companyId, input.kind, numbering.series, input.issueDate);
    const docId = crypto.randomUUID();
    const { totals, rows } = lineRows(docId, input.lines);
    await tx.insert(documents).values({
      id: docId,
      companyId: actor.companyId,
      kind: input.kind,
      isCreditNote: input.isCreditNote ?? false,
      seriesId: numbering.seriesId,
      series: numbering.series,
      number: numbering.number,
      fullNumber: numbering.fullNumber,
      status: input.issue ? "issued" : "draft",
      ...snapshot,
      issueDate: input.issueDate,
      dueDate: input.dueDate ?? null,
      deliveryDate: input.deliveryDate ?? null,
      currency: input.currency ?? company.defaultCurrency,
      exchangeRate: input.exchangeRate ?? 1,
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      vatTotal: totals.vatTotal,
      total: totals.total,
      notes: input.notes ?? null,
      internalNotes: input.internalNotes ?? null,
      issuedBy: input.issuedBy ?? null,
      issuerCnp: input.issuerCnp ?? null,
      delegateName: input.delegateName ?? null,
      delegateIdCard: input.delegateIdCard ?? null,
      transportMeans: input.transportMeans ?? null,
      warehouseId: input.warehouseId ?? null,
      projectId: input.projectId ?? null,
      recurringId: input.recurringId ?? null,
      relatedDocumentId: input.relatedDocumentId ?? null,
      vatOnCollection: company.vatOnCollection,
      createdBy: actor.userId ?? null,
    });
    await tx.insert(documentLines).values(rows);
    if (input.issue) await afterIssue(tx, actor, docId);
    const label = DOC_KIND_LABELS[input.kind].one;
    await logActivity(
      actor,
      {
        entity: "document",
        entityId: docId,
        action: input.issue ? "issued" : "created",
        message: `${input.isCreditNote ? "Factură storno" : label} ${numbering.fullNumber} ${input.issue ? "emisă" : "salvată ca ciornă"} pentru ${snapshot.clientName}`,
      },
      tx,
    );
    return docId;
  });
  return id;
}

export async function updateDocument(actor: Actor, documentId: string, input: Omit<DocumentInput, "kind">) {
  await db.transaction(async (tx) => {
    const doc = await tx.query.documents.findFirst({
      where: and(eq(documents.id, documentId), eq(documents.companyId, actor.companyId)),
    });
    if (!doc) throw new Error("Document inexistent.");
    if (["cancelled", "storned", "converted"].includes(doc.status) || ["ok", "processing", "pending"].includes(doc.efacturaStatus)) {
      throw new Error("Documentul nu mai poate fi modificat (este închis sau a fost transmis în SPV).");
    }
    const snapshot = await partnerSnapshot(tx, actor.companyId, input.partnerId);
    const { totals, rows } = lineRows(documentId, input.lines);
    const wasIssued = doc.status !== "draft";
    if (!doc.isCreditNote) assertVatRates(input.lines, input.issueDate, input.deliveryDate);
    if (wasIssued && input.issueDate !== doc.issueDate) await assertChronological(tx, actor.companyId, doc.kind, doc.series, input.issueDate, doc.number);
    if (wasIssued) await revertSaleStock(tx, actor, doc.id);
    await tx.delete(documentLines).where(eq(documentLines.documentId, documentId));
    await tx.insert(documentLines).values(rows);
    await tx
      .update(documents)
      .set({
        ...snapshot,
        issueDate: input.issueDate,
        dueDate: input.dueDate ?? null,
        deliveryDate: input.deliveryDate ?? null,
        currency: input.currency ?? doc.currency,
        exchangeRate: input.exchangeRate ?? doc.exchangeRate,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        vatTotal: totals.vatTotal,
        total: totals.total,
        notes: input.notes ?? null,
        internalNotes: input.internalNotes ?? null,
        issuedBy: input.issuedBy ?? null,
        issuerCnp: input.issuerCnp ?? null,
        delegateName: input.delegateName ?? null,
        delegateIdCard: input.delegateIdCard ?? null,
        transportMeans: input.transportMeans ?? null,
        warehouseId: input.warehouseId ?? doc.warehouseId,
        projectId: input.projectId ?? doc.projectId,
        efacturaStatus: "none",
        efacturaMessage: null,
        efacturaXml: null,
      })
      .where(eq(documents.id, documentId));
    if (wasIssued) {
      await applySaleStock(tx, actor, documentId);
      await recalcDocumentPayments(tx, documentId);
    }
    if (input.issue && !wasIssued) await issueDocumentTx(tx, actor, documentId);
    await logActivity(actor, { entity: "document", entityId: documentId, action: "updated", message: `Documentul ${doc.fullNumber} a fost modificat` }, tx);
  });
}

async function afterIssue(tx: Tx, actor: Actor, documentId: string) {
  const doc = await tx.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!doc) return;
  // Stocul scade la factură (dacă nu provine dintr-un aviz deja descărcat din gestiune) și la aviz.
  if (doc.kind === "notice" || (doc.kind === "invoice" && !(await cameFromNotice(tx, doc.relatedDocumentId)))) {
    // Pentru storno (cantități negative) se generează automat retur în gestiune.
    await applySaleStock(tx, actor, doc.id);
  }
}

async function cameFromNotice(tx: DbOrTx, relatedId: string | null) {
  if (!relatedId) return false;
  const rel = await tx.query.documents.findFirst({ where: eq(documents.id, relatedId), columns: { kind: true } });
  return rel?.kind === "notice";
}

async function issueDocumentTx(tx: Tx, actor: Actor, documentId: string) {
  const doc = await tx.query.documents.findFirst({
    where: and(eq(documents.id, documentId), eq(documents.companyId, actor.companyId)),
  });
  if (!doc) throw new Error("Document inexistent.");
  if (doc.status !== "draft") throw new Error("Documentul este deja emis.");
  const numbering = await allocateNumber(tx, actor.companyId, doc.kind, doc.seriesId);
  await assertChronological(tx, actor.companyId, doc.kind, numbering.series, doc.issueDate);
  await tx
    .update(documents)
    .set({ ...numbering, status: "issued" })
    .where(eq(documents.id, documentId));
  await afterIssue(tx, actor, documentId);
  return numbering.fullNumber;
}

/** Transformă o ciornă în document emis (alocă număr definitiv). */
export async function issueDocument(actor: Actor, documentId: string) {
  return db.transaction(async (tx) => {
    const fullNumber = await issueDocumentTx(tx, actor, documentId);
    await logActivity(actor, { entity: "document", entityId: documentId, action: "issued", message: `Document ${fullNumber} emis` }, tx);
    return fullNumber;
  });
}

/** Orele facturate pe un document șters/anulat redevin disponibile pentru facturare. */
async function releaseTimeEntries(tx: DbOrTx, documentId: string) {
  await tx.update(timeEntries).set({ invoicedDocumentId: null }).where(eq(timeEntries.invoicedDocumentId, documentId));
}

export async function deleteDraft(actor: Actor, documentId: string) {
  await db.transaction(async (tx) => {
    const doc = await tx.query.documents.findFirst({
      where: and(eq(documents.id, documentId), eq(documents.companyId, actor.companyId)),
    });
    if (!doc) throw new Error("Document inexistent.");
    if (doc.status !== "draft") throw new Error("Doar ciornele pot fi șterse. Documentele emise se anulează sau se stornează.");
    await releaseTimeEntries(tx, documentId);
    await tx.delete(documentLines).where(eq(documentLines.documentId, documentId));
    await tx.delete(documents).where(eq(documents.id, documentId));
  });
}

export async function cancelDocument(actor: Actor, documentId: string) {
  await db.transaction(async (tx) => {
    const doc = await tx.query.documents.findFirst({
      where: and(eq(documents.id, documentId), eq(documents.companyId, actor.companyId)),
    });
    if (!doc) throw new Error("Document inexistent.");
    if (doc.paidAmount > 0) throw new Error("Documentul are încasări. Șterge încasările sau emite o factură storno.");
    // Ce a ajuns în SPV-ul ANAF nu se mai anulează — doar prin storno (art. 330 Cod fiscal). Simularea nu contează.
    if (doc.efacturaEnvironment !== "simulation") {
      if (doc.efacturaStatus === "ok") throw new Error("Factura a fost validată de ANAF — nu mai poate fi anulată, doar stornată.");
      if (["processing", "pending"].includes(doc.efacturaStatus))
        throw new Error("Factura este în prelucrare la ANAF. Așteaptă rezultatul: dacă e validată, se corectează doar prin storno.");
    }
    await revertSaleStock(tx, actor, doc.id);
    await releaseTimeEntries(tx, doc.id);
    await tx.update(documents).set({ status: "cancelled" }).where(eq(documents.id, documentId));
    await logActivity(actor, { entity: "document", entityId: documentId, action: "cancelled", message: `Documentul ${doc.fullNumber} a fost anulat` }, tx);
  });
}

/** Emite o factură storno (totală sau parțială) pentru o factură existentă. */
export async function createCreditNote(
  actor: Actor,
  originalId: string,
  opts: { issueDate: string; lines?: { lineId: string; quantity: number }[]; reason?: string },
) {
  const original = await db.query.documents.findFirst({
    where: and(eq(documents.id, originalId), eq(documents.companyId, actor.companyId), eq(documents.kind, "invoice")),
    with: { lines: true },
  });
  if (!original) throw new Error("Factura originală nu există.");
  if (original.isCreditNote) throw new Error("Nu se poate storna o factură storno.");
  if (!original.partnerId) throw new Error("Factura nu are client asociat.");
  const pick = opts.lines ? new Map(opts.lines.map((l) => [l.lineId, l.quantity])) : null;
  const lines: LineDraft[] = original.lines
    .filter((l) => !pick || (pick.get(l.id) ?? 0) > 0)
    .map((l) => ({
      productId: l.productId,
      name: l.name,
      description: l.description,
      unit: l.unit,
      quantity: -Math.abs(pick ? pick.get(l.id)! : l.quantity),
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent,
      vatRate: l.vatRate,
      vatCategory: l.vatCategory,
    }));
  if (!lines.length) throw new Error("Selectează cel puțin o linie de stornat.");
  const creditId = await createDocument(actor, {
    kind: "invoice",
    isCreditNote: true,
    partnerId: original.partnerId,
    seriesId: original.seriesId,
    issueDate: opts.issueDate,
    dueDate: opts.issueDate,
    currency: original.currency,
    exchangeRate: original.exchangeRate,
    relatedDocumentId: original.id,
    notes: `Stornare factura ${original.fullNumber} din ${original.issueDate}${opts.reason ? ` — ${opts.reason}` : ""}`,
    issue: true,
    lines,
  });
  const full = !pick || lines.length === original.lines.length && lines.every((l, i) => Math.abs(l.quantity) === Math.abs(original.lines[i].quantity));
  if (full) await db.update(documents).set({ status: "storned" }).where(eq(documents.id, original.id));
  return creditId;
}

/** Transformă o proformă sau un aviz într-o factură. */
export async function convertToInvoice(actor: Actor, sourceId: string, opts: { issueDate: string; issue: boolean }) {
  const src = await db.query.documents.findFirst({
    where: and(eq(documents.id, sourceId), eq(documents.companyId, actor.companyId)),
    with: { lines: true },
  });
  if (!src || src.kind === "invoice") throw new Error("Documentul sursă nu poate fi facturat.");
  if (src.status === "converted") throw new Error("Documentul a fost deja facturat.");
  if (!src.partnerId) throw new Error("Documentul nu are client asociat.");
  const company = await db.query.companies.findFirst({ where: (c, { eq }) => eq(c.id, actor.companyId) });
  const due = new Date(opts.issueDate);
  due.setDate(due.getDate() + (company?.defaultDueDays ?? 15));
  const invoiceId = await createDocument(actor, {
    kind: "invoice",
    partnerId: src.partnerId,
    issueDate: opts.issueDate,
    dueDate: due.toISOString().slice(0, 10),
    currency: src.currency,
    exchangeRate: src.exchangeRate,
    notes: src.notes,
    relatedDocumentId: src.id,
    projectId: src.projectId,
    warehouseId: src.warehouseId,
    issue: opts.issue,
    lines: src.lines.map((l) => ({
      productId: l.productId,
      name: l.name,
      description: l.description,
      unit: l.unit,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent,
      vatRate: l.vatRate,
      vatCategory: l.vatCategory,
    })),
  });
  await db.update(documents).set({ status: "converted", relatedDocumentId: invoiceId }).where(eq(documents.id, src.id));
  return invoiceId;
}

/** Duplică un document ca ciornă nouă (data de azi). */
export async function duplicateDocument(actor: Actor, sourceId: string, issueDate: string) {
  const src = await db.query.documents.findFirst({
    where: and(eq(documents.id, sourceId), eq(documents.companyId, actor.companyId)),
    with: { lines: true },
  });
  if (!src?.partnerId) throw new Error("Document inexistent.");
  return createDocument(actor, {
    kind: src.kind,
    partnerId: src.partnerId,
    seriesId: src.seriesId,
    issueDate,
    dueDate: null,
    currency: src.currency,
    exchangeRate: src.exchangeRate,
    notes: src.notes,
    projectId: src.projectId,
    issue: false,
    lines: src.lines.map((l) => ({ ...l, quantity: Math.abs(l.quantity) })),
  });
}

/* ------------------------------------------------------------------ */
/* Încasări                                                            */
/* ------------------------------------------------------------------ */

export async function recalcDocumentPayments(tx: DbOrTx, documentId: string) {
  const doc = await tx.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!doc) return;
  const [row] = await tx
    .select({ paid: sql<number>`coalesce(sum(${payments.amount}), 0)` })
    .from(payments)
    .where(and(eq(payments.documentId, documentId), eq(payments.direction, "in")));
  const paid = round2(row?.paid ?? 0);
  let status = doc.status;
  if (["issued", "partially_paid", "paid"].includes(doc.status)) {
    status = paid <= 0 ? "issued" : paid + 0.009 >= doc.total ? "paid" : "partially_paid";
  }
  await tx.update(documents).set({ paidAmount: paid, status }).where(eq(documents.id, documentId));
}

export type PaymentInput = {
  documentId?: string | null;
  partnerId?: string | null;
  date: string;
  amount: number;
  currency?: string;
  method: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
  /** Emite chitanță (doar pentru încasări în numerar). */
  issueReceipt?: boolean;
};

export async function recordPayment(actor: Actor, input: PaymentInput) {
  if (!(input.amount > 0)) throw new Error("Suma trebuie să fie pozitivă.");
  return db.transaction(async (tx) => {
    let partnerId = input.partnerId ?? null;
    let partnerName: string | null = null;
    let currency = input.currency ?? "RON";
    let rate = 1;
    let isIndividual = false;
    let docNumber = "";
    if (input.documentId) {
      const doc = await tx.query.documents.findFirst({
        where: and(eq(documents.id, input.documentId), eq(documents.companyId, actor.companyId)),
      });
      if (!doc) throw new Error("Factura nu există.");
      if (doc.kind !== "invoice" || !["issued", "partially_paid", "paid"].includes(doc.status)) {
        throw new Error("Se pot încasa doar facturi emise.");
      }
      partnerId = doc.partnerId;
      partnerName = doc.clientName;
      currency = doc.currency;
      rate = doc.currency === "RON" ? 1 : doc.exchangeRate;
      isIndividual = doc.clientEntityType === "pf";
      docNumber = doc.fullNumber;
    } else if (partnerId) {
      const p = await tx.query.partners.findFirst({ where: and(eq(partners.id, partnerId), eq(partners.companyId, actor.companyId)) });
      partnerName = p?.name ?? null;
      isIndividual = p?.entityType === "pf";
    }
    if (input.method === "cash") {
      await assertCashLimit(tx, { companyId: actor.companyId, partnerId, partnerName, isIndividual, direction: "in", date: input.date, amountRon: round2(input.amount * rate) });
    }
    let receipt: { receiptSeries: string; receiptNumber: number } | null = null;
    if (input.issueReceipt && input.method === "cash") {
      const n = await allocateNumber(tx, actor.companyId, "receipt");
      receipt = { receiptSeries: n.series, receiptNumber: n.number };
    }
    const [p] = await tx
      .insert(payments)
      .values({
        companyId: actor.companyId,
        direction: "in",
        documentId: input.documentId ?? null,
        partnerId,
        partnerName,
        date: input.date,
        amount: round2(input.amount),
        currency,
        method: input.method,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        createdBy: actor.userId ?? null,
        ...(receipt ?? {}),
      })
      .returning();
    if (input.documentId) await recalcDocumentPayments(tx, input.documentId);
    await logActivity(
      actor,
      {
        entity: "payment",
        entityId: p.id,
        action: "created",
        message: `Încasare ${round2(input.amount)} ${currency}${docNumber ? ` pentru ${docNumber}` : ""}${partnerName ? ` de la ${partnerName}` : ""}`,
      },
      tx,
    );
    return p;
  });
}

export async function deletePayment(actor: Actor, paymentId: string) {
  await db.transaction(async (tx) => {
    const p = await tx.query.payments.findFirst({
      where: and(eq(payments.id, paymentId), eq(payments.companyId, actor.companyId)),
    });
    if (!p) throw new Error("Plata nu există.");
    await tx.delete(payments).where(eq(payments.id, paymentId));
    if (p.documentId) await recalcDocumentPayments(tx, p.documentId);
    await logActivity(actor, { entity: "payment", entityId: paymentId, action: "deleted", message: `Încasare de ${p.amount} ${p.currency} ștearsă` }, tx);
  });
}

/* ------------------------------------------------------------------ */
/* Interogări uzuale                                                   */
/* ------------------------------------------------------------------ */

export async function getDocument(companyId: string, documentId: string) {
  return db.query.documents.findFirst({
    where: and(eq(documents.id, documentId), eq(documents.companyId, companyId)),
    with: {
      lines: { orderBy: (l, { asc }) => [asc(l.position)] },
      payments: { orderBy: (p, { desc }) => [desc(p.date)] },
      partner: true,
      project: true,
    },
  });
}

export async function getDocumentsByIds(companyId: string, ids: string[]) {
  if (!ids.length) return [];
  return db.query.documents.findMany({ where: and(eq(documents.companyId, companyId), inArray(documents.id, ids)) });
}
