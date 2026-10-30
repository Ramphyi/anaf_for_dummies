import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";
import { db } from "@/lib/db";
import {
  anafConnections,
  companies,
  documents,
  partners,
  purchaseInvoices,
  purchaseLines,
  spvMessages,
  type Company,
  type Document,
  type DocumentLine,
} from "@/lib/db/schema";
import {
  efacturaDownload,
  efacturaListMessages,
  efacturaStatus,
  efacturaUpload,
  ENV_LABELS,
  getConnection,
} from "@/lib/anaf/client";
import { buildUblInvoice, prevalidateUbl, type UblInput, type UblParty } from "@/lib/anaf/ubl";
import { parseUbl } from "@/lib/anaf/ubl-parse";
import { logActivity, type Actor } from "@/lib/server/activity";
import { normalizeCui, round2 } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Construire XML din documentele aplicației                           */
/* ------------------------------------------------------------------ */

export function companyAsParty(c: Company): UblParty & { iban?: string | null; bank?: string | null } {
  return {
    name: c.name,
    cui: c.cui,
    regCom: c.regCom,
    vatPayer: c.vatPayer,
    entityType: "pj",
    address: c.address,
    city: c.city,
    county: c.county,
    country: c.country,
    postalCode: c.postalCode,
    email: c.email,
    phone: c.phone,
    iban: c.iban,
    bank: c.bank,
    legalInfo: c.shareCapital ? `Capital social: ${c.shareCapital}` : null,
  };
}

export function documentToUbl(company: Company, doc: Document & { lines: DocumentLine[] }, related?: Pick<Document, "fullNumber" | "issueDate"> | null): UblInput {
  return {
    number: doc.fullNumber,
    issueDate: doc.issueDate,
    dueDate: doc.dueDate,
    deliveryDate: doc.deliveryDate && doc.deliveryDate !== doc.issueDate ? doc.deliveryDate : null,
    typeCode: "380",
    currency: doc.currency,
    exchangeRate: doc.exchangeRate,
    notes: [doc.notes, company.invoiceFooter],
    billingReference: doc.isCreditNote && related ? { number: related.fullNumber, issueDate: related.issueDate } : null,
    supplier: companyAsParty(company),
    customer: {
      name: doc.clientName,
      cui: doc.clientCui,
      regCom: doc.clientRegCom,
      vatPayer: doc.clientVatPayer,
      entityType: doc.clientEntityType,
      address: doc.clientAddress,
      city: doc.clientCity,
      county: doc.clientCounty,
      country: doc.clientCountry,
      email: doc.clientEmail,
    },
    vatOnCollection: doc.vatOnCollection,
    lines: doc.lines
      .sort((a, b) => a.position - b.position)
      .map((l) => ({
        name: l.name,
        description: l.description,
        unit: l.unit,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPercent: l.discountPercent,
        vatRate: l.vatRate,
        vatCategory: l.vatCategory,
      })),
  };
}

async function loadDocForUbl(companyId: string, documentId: string) {
  const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, documentId), eq(documents.companyId, companyId)),
    with: { lines: true },
  });
  if (!company || !doc) throw new Error("Documentul nu există.");
  const related = doc.relatedDocumentId
    ? await db.query.documents.findFirst({ where: eq(documents.id, doc.relatedDocumentId), columns: { fullNumber: true, issueDate: true } })
    : null;
  return { company, doc, related };
}

/** XML-ul UBL al unei facturi (fără a o trimite). */
export async function generateInvoiceXml(companyId: string, documentId: string) {
  const { company, doc, related } = await loadDocForUbl(companyId, documentId);
  const input = documentToUbl(company, doc, related);
  return { xml: buildUblInvoice(input), errors: prevalidateUbl(input), doc };
}

/* ------------------------------------------------------------------ */
/* Trimitere în SPV & status                                           */
/* ------------------------------------------------------------------ */

export async function sendInvoiceToSpv(actor: Actor, documentId: string) {
  const { company, doc, related } = await loadDocForUbl(actor.companyId, documentId);
  if (doc.kind !== "invoice") throw new Error("Doar facturile se transmit în e-Factura.");
  if (doc.status === "draft") throw new Error("Emite factura înainte de a o trimite în SPV.");
  if (doc.status === "cancelled") throw new Error("Factura este anulată.");
  // O transmitere simulată nu a ajuns la ANAF — factura se poate trimite din nou (ex. după conectarea la producție).
  const simulated = doc.efacturaEnvironment === "simulation";
  if (doc.efacturaStatus === "ok" && !simulated) throw new Error("Factura a fost deja validată de ANAF.");
  if (doc.efacturaStatus === "processing" && !simulated) throw new Error("Factura este deja în prelucrare la ANAF.");

  const input = documentToUbl(company, doc, related);
  const errors = prevalidateUbl(input);
  if (errors.length) {
    await db.update(documents).set({ efacturaStatus: "error", efacturaMessage: errors.join("\n") }).where(eq(documents.id, doc.id));
    return { ok: false as const, errors };
  }
  const xml = buildUblInvoice(input);
  const conn = await getConnection(actor.companyId);
  if (conn.environment !== "simulation" && !doc.isCreditNote && doc.total === 0) {
    return {
      ok: false as const,
      errors: ["Factura are valoarea 0 — nu o transmitem în SPV. Pentru teste folosește modul Simulare sau mediul ANAF Test; pentru o operațiune reală completează prețurile."],
    };
  }
  const isB2C = doc.clientEntityType === "pf";
  const foreign = (doc.clientCountry ?? "RO") !== "RO";
  try {
    const r = await efacturaUpload(conn, normalizeCui(company.cui), xml, { b2c: isB2C, foreignBuyer: foreign });
    await db
      .update(documents)
      .set({
        efacturaStatus: r.ok ? "processing" : "error",
        efacturaEnvironment: conn.environment,
        efacturaUploadId: r.uploadId,
        efacturaDownloadId: null,
        efacturaMessage: r.ok ? null : r.errors.join("\n"),
        efacturaSentAt: new Date(),
        efacturaXml: xml,
      })
      .where(eq(documents.id, doc.id));
    await logActivity(actor, {
      entity: "document",
      entityId: doc.id,
      action: "efactura_sent",
      message: r.ok ? `Factura ${doc.fullNumber} a fost transmisă în SPV (index ${r.uploadId})` : `Transmiterea facturii ${doc.fullNumber} în SPV a eșuat`,
    });
    return r.ok ? { ok: true as const, uploadId: r.uploadId, simulated: conn.environment === "simulation" } : { ok: false as const, errors: r.errors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(documents).set({ efacturaStatus: "error", efacturaMessage: message }).where(eq(documents.id, doc.id));
    return { ok: false as const, errors: [message] };
  }
}

export async function refreshInvoiceStatus(actor: Actor, documentId: string) {
  const doc = await db.query.documents.findFirst({ where: and(eq(documents.id, documentId), eq(documents.companyId, actor.companyId)) });
  if (!doc?.efacturaUploadId) throw new Error("Factura nu a fost transmisă în SPV.");
  const conn = await getConnection(actor.companyId);
  if (doc.efacturaEnvironment && doc.efacturaEnvironment !== conn.environment) {
    throw new Error(
      `Factura a fost transmisă în mediul „${ENV_LABELS[doc.efacturaEnvironment]}”, iar conexiunea este acum „${ENV_LABELS[conn.environment]}”. Retrimite factura.`,
    );
  }
  const r = await efacturaStatus(conn, doc.efacturaUploadId);
  if (r.state === "processing") return r;
  let message = r.message;
  if (r.state === "nok" && r.downloadId && conn.environment !== "simulation") {
    // Arhiva unui mesaj „nok” conține XML-ul cu erorile de validare.
    try {
      const { invoiceXml } = await efacturaDownload(conn, r.downloadId);
      const errs = [...(invoiceXml ?? "").matchAll(/errorMessage="([^"]*)"/g)].map((m) => m[1]);
      if (errs.length) message = errs.join("\n");
    } catch {
      /* păstrăm mesajul din status */
    }
  }
  await db
    .update(documents)
    .set({ efacturaStatus: r.state, efacturaDownloadId: r.downloadId, efacturaMessage: r.state === "ok" ? null : message })
    .where(eq(documents.id, doc.id));
  if (r.state === "ok" && r.downloadId) {
    await db
      .insert(spvMessages)
      .values({
        companyId: actor.companyId,
        anafId: r.downloadId,
        requestId: doc.efacturaUploadId,
        type: "FACTURA TRIMISA",
        details: `Factura ${doc.fullNumber} către ${doc.clientName} (${doc.clientCui ?? "—"})`,
        anafCreatedAt: new Date().toISOString().replace(/\D/g, "").slice(0, 12),
        receiverCui: doc.clientCui,
        documentId: doc.id,
        xml: doc.efacturaXml,
        downloaded: !!doc.efacturaXml,
        read: true,
      })
      .onConflictDoNothing();
    await logActivity(actor, { entity: "document", entityId: doc.id, action: "efactura_ok", message: `Factura ${doc.fullNumber} a fost validată de ANAF` });
  } else if (r.state === "nok" || r.state === "error") {
    await logActivity(actor, { entity: "document", entityId: doc.id, action: "efactura_nok", message: `Factura ${doc.fullNumber} a fost respinsă de ANAF` });
  }
  return { ...r, message };
}

/**
 * Retrage o transmitere SIMULATĂ (nu a ajuns niciodată la ANAF), ca factura să poată fi modificată, anulată sau trimisă real.
 * O factură transmisă în SPV-ul ANAF nu se poate retrage sau șterge — se corectează doar prin storno (art. 330 Cod fiscal).
 */
export async function retractSimulatedSend(actor: Actor, documentId: string) {
  const doc = await db.query.documents.findFirst({ where: and(eq(documents.id, documentId), eq(documents.companyId, actor.companyId)) });
  if (!doc?.efacturaUploadId) throw new Error("Factura nu a fost transmisă.");
  if (doc.efacturaEnvironment !== "simulation") {
    throw new Error(
      "Factura a fost transmisă în SPV-ul ANAF și nu mai poate fi retrasă. Pentru corectare emite o factură storno (art. 330 Cod fiscal), care se transmite și ea în SPV.",
    );
  }
  await db.transaction(async (tx) => {
    await tx
      .update(documents)
      .set({ efacturaStatus: "none", efacturaEnvironment: null, efacturaUploadId: null, efacturaDownloadId: null, efacturaMessage: null, efacturaSentAt: null, efacturaXml: null })
      .where(eq(documents.id, doc.id));
    await tx.delete(spvMessages).where(and(eq(spvMessages.companyId, actor.companyId), eq(spvMessages.requestId, doc.efacturaUploadId!)));
    await logActivity(actor, { entity: "document", entityId: doc.id, action: "efactura_retracted", message: `Transmiterea simulată a facturii ${doc.fullNumber} a fost retrasă` }, tx);
  });
}

/** Actualizează statusul tuturor facturilor aflate „în prelucrare”. */
export async function refreshPendingInvoices(actor: Actor) {
  const pending = await db.query.documents.findMany({
    where: and(eq(documents.companyId, actor.companyId), inArray(documents.efacturaStatus, ["processing", "pending"])),
    columns: { id: true },
  });
  let updated = 0;
  for (const d of pending) {
    try {
      const r = await refreshInvoiceStatus(actor, d.id);
      if (r.state !== "processing") updated++;
    } catch {
      /* continuăm cu restul */
    }
  }
  return { checked: pending.length, updated };
}

/* ------------------------------------------------------------------ */
/* Mesaje SPV                                                          */
/* ------------------------------------------------------------------ */

export async function syncSpvMessages(actor: Actor, days = 60) {
  const company = await db.query.companies.findFirst({ where: eq(companies.id, actor.companyId) });
  if (!company) throw new Error("Firmă inexistentă.");
  const conn = await getConnection(actor.companyId);
  const list = await efacturaListMessages(conn, normalizeCui(company.cui), days);
  const existing = new Set(
    (
      await db.query.spvMessages.findMany({
        where: and(eq(spvMessages.companyId, actor.companyId), inArray(spvMessages.anafId, list.length ? list.map((m) => m.id) : ["-"])),
        columns: { anafId: true },
      })
    ).map((m) => m.anafId),
  );
  const fresh = list.filter((m) => !existing.has(m.id));
  if (fresh.length) {
    await db
      .insert(spvMessages)
      .values(
        fresh.map((m) => {
          const issuer = m.details.match(/cif_emitent=(\d+)/)?.[1] ?? null;
          const receiver = m.details.match(/cif_beneficiar=(\d+)/)?.[1] ?? null;
          return {
            companyId: actor.companyId,
            anafId: m.id,
            requestId: m.requestId,
            type: m.type,
            cif: m.cif,
            details: m.details,
            anafCreatedAt: m.createdAt,
            issuerCui: issuer,
            receiverCui: receiver,
          };
        }),
      )
      .onConflictDoNothing();
  }
  await db.update(anafConnections).set({ lastSyncAt: new Date() }).where(eq(anafConnections.companyId, actor.companyId));
  if (fresh.length) {
    await logActivity(actor, { entity: "spv", action: "synced", message: `${fresh.length} mesaje noi descărcate din SPV` });
  }
  return { total: list.length, new: fresh.length };
}

export async function downloadSpvMessage(actor: Actor, messageId: string) {
  const msg = await db.query.spvMessages.findFirst({ where: and(eq(spvMessages.id, messageId), eq(spvMessages.companyId, actor.companyId)) });
  if (!msg) throw new Error("Mesaj inexistent.");
  if (msg.downloaded && msg.xml) return msg;
  const company = await db.query.companies.findFirst({ where: eq(companies.id, actor.companyId) });
  const conn = await getConnection(actor.companyId);
  const { invoiceXml, signatureXml } = await efacturaDownload(conn, msg.anafId, {
    customer: company ? companyAsParty(company) : undefined,
    fallbackXml: async () => {
      if (!msg.documentId) return null;
      const d = await db.query.documents.findFirst({ where: eq(documents.id, msg.documentId), columns: { efacturaXml: true } });
      return d?.efacturaXml ?? null;
    },
  });
  const [updated] = await db
    .update(spvMessages)
    .set({ xml: invoiceXml, signatureXml, downloaded: true })
    .where(eq(spvMessages.id, msg.id))
    .returning();
  return updated;
}

/** Arhiva ZIP (factură + semnătură) pentru descărcare de către utilizator. */
export async function spvMessageZip(actor: Actor, messageId: string) {
  const msg = await downloadSpvMessage(actor, messageId);
  const files: Record<string, Uint8Array> = {};
  if (msg.xml) files[`${msg.anafId}.xml`] = strToU8(msg.xml);
  if (msg.signatureXml) files[`semnatura_${msg.anafId}.xml`] = strToU8(msg.signatureXml);
  return { name: `${msg.anafId}.zip`, data: zipSync(files) };
}

/** Importă o factură primită din SPV ca factură de achiziție (cheltuială). */
export async function importSpvMessage(actor: Actor, messageId: string, category = "altele") {
  const msg = await downloadSpvMessage(actor, messageId);
  if (msg.purchaseInvoiceId) return msg.purchaseInvoiceId;
  if (!msg.xml) throw new Error("Mesajul nu conține o factură.");
  if (msg.type !== "FACTURA PRIMITA") throw new Error("Doar facturile primite pot fi importate ca cheltuieli.");
  const parsed = parseUbl(msg.xml);
  const cui = parsed.supplier.cui;

  return db.transaction(async (tx) => {
    let supplier = cui
      ? await tx.query.partners.findFirst({ where: and(eq(partners.companyId, actor.companyId), eq(partners.cui, cui)) })
      : undefined;
    if (!supplier) {
      [supplier] = await tx
        .insert(partners)
        .values({
          companyId: actor.companyId,
          kind: "supplier",
          name: parsed.supplier.name,
          cui,
          regCom: parsed.supplier.regCom,
          vatPayer: !!parsed.supplier.vatId,
          address: parsed.supplier.address,
          city: parsed.supplier.city,
          county: parsed.supplier.county,
          country: parsed.supplier.country,
          email: parsed.supplier.email,
          phone: parsed.supplier.phone,
          iban: parsed.iban,
          eInvoiceRegistered: true,
        })
        .returning();
    } else if (supplier.kind === "client") {
      await tx.update(partners).set({ kind: "both" }).where(eq(partners.id, supplier.id));
    }
    const [pi] = await tx
      .insert(purchaseInvoices)
      .values({
        companyId: actor.companyId,
        supplierId: supplier.id,
        supplierName: parsed.supplier.name,
        supplierCui: cui,
        number: parsed.number,
        issueDate: parsed.issueDate,
        dueDate: parsed.dueDate,
        currency: parsed.currency,
        subtotal: parsed.subtotal,
        vatTotal: parsed.vatTotal,
        total: parsed.payable || parsed.total,
        category,
        source: "spv",
        spvMessageId: msg.id,
        xml: msg.xml,
        notes: parsed.notes.join("\n") || null,
      })
      .returning();
    if (parsed.lines.length) {
      await tx.insert(purchaseLines).values(
        parsed.lines.map((l, i) => {
          const vat = round2((l.netAmount * (l.vatCategory === "S" ? l.vatRate : 0)) / 100);
          return {
            purchaseInvoiceId: pi.id,
            position: i,
            name: l.name,
            unit: l.unit,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            vatRate: l.vatRate,
            netAmount: l.netAmount,
            vatAmount: vat,
            totalAmount: round2(l.netAmount + vat),
          };
        }),
      );
    }
    await tx.update(spvMessages).set({ purchaseInvoiceId: pi.id, read: true }).where(eq(spvMessages.id, msg.id));
    await logActivity(
      actor,
      { entity: "purchase", entityId: pi.id, action: "imported", message: `Factura ${parsed.number} de la ${parsed.supplier.name} importată din SPV` },
      tx,
    );
    return pi.id;
  });
}
