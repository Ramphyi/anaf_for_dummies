import "server-only";
import { format, parseISO, subMonths } from "date-fns";
import { ro } from "date-fns/locale";
import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { sendDocumentEmail } from "@/components/documents/server";
import { addDaysIso, advanceDate } from "@/components/documents/shared";
import { getExchangeRate } from "@/lib/anaf/bnr";
import { sendInvoiceToSpv } from "@/lib/anaf/service";
import { db } from "@/lib/db";
import { documents, partners, recurringInvoices } from "@/lib/db/schema";
import { createDocument } from "@/lib/documents/server";
import { todayIso } from "@/lib/format";
import { logActivity, type Actor } from "@/lib/server/activity";

export function systemActor(companyId: string): Actor {
  return { companyId, userId: null, userName: "Sistem · facturi recurente" };
}

/** Înlocuiește {luna}, {an}, {luna_anterioara} în texte (ex. „Mentenanță {luna} {an}”). */
export function fillPlaceholders(text: string, issueDate: string) {
  const d = parseISO(issueDate);
  return text
    .replaceAll("{luna}", format(d, "LLLL", { locale: ro }))
    .replaceAll("{an}", format(d, "yyyy"))
    .replaceAll("{luna_anterioara}", format(subMonths(d, 1), "LLLL", { locale: ro }));
}

export type RecurringRunResult = {
  documentId: string;
  fullNumber: string;
  issued: boolean;
  nextRunDate: string;
  efactura?: { ok: boolean; message?: string };
  emailed?: boolean;
  emailError?: string;
};

/**
 * Generează o factură dintr-un șablon recurent: o emite (dacă autoIssue), avansează data următoarei rulări,
 * incrementează contorul și, opțional, o transmite în SPV / pe email (erorile acestora nu anulează generarea).
 */
export async function generateFromRecurring(actor: Actor, id: string): Promise<RecurringRunResult> {
  const r = await db.query.recurringInvoices.findFirst({
    where: and(eq(recurringInvoices.id, id), eq(recurringInvoices.companyId, actor.companyId)),
  });
  if (!r) throw new Error("Șablonul recurent nu există.");
  if (!r.lines.length) throw new Error("Șablonul nu are nicio linie.");

  const issueDate = todayIso();
  const next = advanceDate(r.nextRunDate, r.frequency, r.intervalCount);

  // Revendicăm atomic rularea, ca un cron și un clic manual simultane să nu genereze două facturi.
  const [claimed] = await db
    .update(recurringInvoices)
    .set({ nextRunDate: next })
    .where(and(eq(recurringInvoices.id, r.id), eq(recurringInvoices.nextRunDate, r.nextRunDate)))
    .returning({ id: recurringInvoices.id });
  if (!claimed) throw new Error("Șablonul tocmai a fost procesat. Reîncarcă pagina.");

  let documentId: string;
  try {
    const rate = r.currency === "RON" ? 1 : ((await getExchangeRate(r.currency, issueDate))?.rate ?? null);
    if (!rate) throw new Error(`Cursul BNR pentru ${r.currency} nu este disponibil.`);
    documentId = await createDocument(actor, {
      kind: "invoice",
      partnerId: r.partnerId,
      seriesId: r.seriesId,
      issueDate,
      dueDate: addDaysIso(issueDate, r.dueDays),
      currency: r.currency,
      exchangeRate: rate,
      notes: r.notes ? fillPlaceholders(r.notes, issueDate) : null,
      recurringId: r.id,
      issue: r.autoIssue,
      lines: r.lines.map((l) => ({
        ...l,
        name: fillPlaceholders(l.name, issueDate),
        description: l.description ? fillPlaceholders(l.description, issueDate) : null,
      })),
    });
  } catch (err) {
    await db.update(recurringInvoices).set({ nextRunDate: r.nextRunDate }).where(eq(recurringInvoices.id, r.id));
    throw err;
  }

  const ended = !!r.endDate && next > r.endDate;
  await db
    .update(recurringInvoices)
    .set({ generatedCount: sql`${recurringInvoices.generatedCount} + 1`, lastRunAt: new Date(), ...(ended ? { active: false } : {}) })
    .where(eq(recurringInvoices.id, r.id));

  const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId), columns: { fullNumber: true, status: true, clientEmail: true } });
  const result: RecurringRunResult = { documentId, fullNumber: doc?.fullNumber ?? "", issued: doc?.status !== "draft", nextRunDate: next };
  await logActivity(actor, {
    entity: "recurring",
    entityId: r.id,
    action: "generated",
    message: `Factura ${result.fullNumber} generată din șablonul recurent „${r.name}”${ended ? " (ultima din serie)" : ""}`,
  });

  if (result.issued && r.autoSendEfactura) {
    try {
      const s = await sendInvoiceToSpv(actor, documentId);
      result.efactura = s.ok ? { ok: true } : { ok: false, message: s.errors.join("; ") };
    } catch (err) {
      result.efactura = { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  if (result.issued && r.autoSendEmail) {
    const partner = doc?.clientEmail ? null : await db.query.partners.findFirst({ where: eq(partners.id, r.partnerId), columns: { email: true } });
    const to = doc?.clientEmail ?? partner?.email;
    if (!to) result.emailError = "Clientul nu are o adresă de email.";
    else {
      try {
        await sendDocumentEmail(actor, documentId, { to: [to] });
        result.emailed = true;
      } catch (err) {
        result.emailError = err instanceof Error ? err.message : String(err);
      }
    }
  }
  return result;
}

/** Rulează toate șabloanele active scadente (nextRunDate ≤ azi, fără a depăși data de sfârșit) pentru o firmă. */
export async function runDueRecurring(companyId: string) {
  const today = todayIso();
  const due = await db.query.recurringInvoices.findMany({
    where: and(
      eq(recurringInvoices.companyId, companyId),
      eq(recurringInvoices.active, true),
      lte(recurringInvoices.nextRunDate, today),
      or(isNull(recurringInvoices.endDate), gte(recurringInvoices.endDate, recurringInvoices.nextRunDate)),
    ),
    columns: { id: true, name: true },
  });
  const actor = systemActor(companyId);
  const generated: (RecurringRunResult & { recurringId: string; name: string })[] = [];
  const errors: { recurringId: string; name: string; error: string }[] = [];
  for (const r of due) {
    try {
      generated.push({ ...(await generateFromRecurring(actor, r.id)), recurringId: r.id, name: r.name });
    } catch (err) {
      errors.push({ recurringId: r.id, name: r.name, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { processed: due.length, generated, errors };
}

/** Variantă pentru cron: toate firmele care au șabloane scadente. */
export async function runAllDueRecurring() {
  const today = todayIso();
  const rows = await db
    .selectDistinct({ companyId: recurringInvoices.companyId })
    .from(recurringInvoices)
    .where(and(eq(recurringInvoices.active, true), lte(recurringInvoices.nextRunDate, today)));
  const results = [];
  for (const { companyId } of rows) results.push({ companyId, ...(await runDueRecurring(companyId)) });
  return results;
}
