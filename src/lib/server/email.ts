import "server-only";
import nodemailer from "nodemailer";
import type { Company } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/server/crypto";

export type MailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: { filename: string; content: string | Buffer | Uint8Array; contentType?: string }[];
};

export function isSmtpConfigured(c: Pick<Company, "smtpHost" | "smtpUser" | "smtpPass">) {
  return !!(c.smtpHost && c.smtpUser && c.smtpPass);
}

/** Trimite un email folosind serverul SMTP configurat în Setări → Email. */
export async function sendMail(company: Company, mail: MailInput) {
  if (!isSmtpConfigured(company)) {
    throw new Error("Serverul de email (SMTP) nu este configurat. Mergi la Setări → Email.");
  }
  const transport = nodemailer.createTransport({
    host: company.smtpHost!,
    port: company.smtpPort ?? (company.smtpSecure ? 465 : 587),
    secure: company.smtpSecure,
    auth: { user: company.smtpUser!, pass: decryptSecret(company.smtpPass) ?? "" },
  });
  const info = await transport.sendMail({
    from: company.smtpFrom || `"${company.name}" <${company.smtpUser}>`,
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    replyTo: mail.replyTo ?? company.email ?? undefined,
    attachments: mail.attachments?.map((a) => ({ ...a, content: a.content instanceof Uint8Array && !Buffer.isBuffer(a.content) ? Buffer.from(a.content) : a.content })),
  });
  return { messageId: info.messageId };
}

/** Șablon HTML simplu, compatibil cu clienții de email. */
export function emailLayout(company: Pick<Company, "name" | "brandColor">, body: string) {
  const color = company.brandColor || "#6d5dfc";
  return `<!doctype html><html><body style="margin:0;background:#f4f4f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e6e6ef">
<tr><td style="background:${color};padding:20px 28px;color:#fff;font-size:18px;font-weight:600">${company.name}</td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.6">${body}</td></tr>
<tr><td style="padding:16px 28px;background:#fafafc;color:#888;font-size:12px">Trimis prin AND · ANAF for Dummies · facturare & e-Factura</td></tr>
</table></td></tr></table></body></html>`;
}
