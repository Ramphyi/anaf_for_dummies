"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { documents, partners } from "@/lib/db/schema";
import { remaining } from "@/lib/documents/status";
import { formatDate, formatMoney, todayIso } from "@/lib/format";
import { actorFrom, logActivity } from "@/lib/server/activity";
import { runAction } from "@/lib/server/action";
import { emailLayout, isSmtpConfigured, sendMail } from "@/lib/server/email";
import { friendlyMailError } from "@/lib/reports/mail";
import { daysBetween } from "@/lib/reports/period";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Trimite clientului un email de reamintire pentru o factură neîncasată. */
export async function sendReminderAction(documentId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const id = z.string().min(1).parse(documentId);
    const doc = await db.query.documents.findFirst({
      where: and(eq(documents.id, id), eq(documents.companyId, ctx.company.id), eq(documents.kind, "invoice")),
    });
    if (!doc) throw new Error("Factura nu există.");
    if (!["issued", "partially_paid"].includes(doc.status) || doc.isCreditNote) throw new Error("Factura nu mai are sold de încasat.");
    const rest = remaining(doc);
    if (rest <= 0) throw new Error("Factura este încasată integral.");

    const partner = doc.partnerId ? await db.query.partners.findFirst({ where: eq(partners.id, doc.partnerId), columns: { email: true, contactPerson: true } }) : null;
    const to = doc.clientEmail || partner?.email;
    if (!to) throw new Error(`Clientul ${doc.clientName} nu are o adresă de email. Adaug-o în fișa clientului.`);
    if (!isSmtpConfigured(ctx.company)) {
      throw new Error("Serverul de email (SMTP) nu este configurat încă. Configurează-l în Setări → Email, apoi reîncearcă.");
    }

    const c = ctx.company;
    const due = doc.dueDate ?? doc.issueDate;
    const late = Math.max(0, daysBetween(due, todayIso()));
    const greeting = partner?.contactPerson ? `Bună ziua, ${esc(partner.contactPerson)},` : "Bună ziua,";
    const body = `
<p>${greeting}</p>
<p>Vă reamintim că factura <strong>${esc(doc.fullNumber)}</strong> din ${formatDate(doc.issueDate)}, cu scadența la <strong>${formatDate(due)}</strong>${
      late > 0 ? ` (depășită cu ${late} ${late === 1 ? "zi" : "zile"})` : ""
    }, are un sold neachitat de:</p>
<p style="font-size:22px;font-weight:700;margin:16px 0">${formatMoney(rest, doc.currency)}</p>
${
  c.iban
    ? `<p>Plata se poate face în contul <strong>${esc(c.iban)}</strong>${c.bank ? ` deschis la ${esc(c.bank)}` : ""}, beneficiar ${esc(c.name)} (CUI ${esc(c.cui)}), menționând numărul facturii.</p>`
    : ""
}
<p>Dacă plata a fost deja efectuată, vă rugăm să ignorați acest mesaj. Pentru orice întrebare ne puteți răspunde direct la acest email.</p>
<p>Vă mulțumim,<br/>${esc(ctx.user.name)}<br/>${esc(c.name)}</p>`;

    try {
      await sendMail(c, {
        to,
        subject: `Reamintire plată — factura ${doc.fullNumber} (${formatMoney(rest, doc.currency)})`,
        html: emailLayout(c, body),
        text: `Vă reamintim că factura ${doc.fullNumber} din ${formatDate(doc.issueDate)}, scadentă la ${formatDate(due)}, are un sold neachitat de ${formatMoney(rest, doc.currency)}.`,
      });
    } catch (err) {
      throw new Error(friendlyMailError(err));
    }
    await logActivity(actorFrom(ctx), {
      entity: "document",
      entityId: doc.id,
      action: "reminder_sent",
      message: `Reminder de plată trimis pentru ${doc.fullNumber} către ${to}`,
    });
    revalidatePath("/rapoarte/restante");
    return { to };
  });
}
