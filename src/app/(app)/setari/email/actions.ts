"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/format";
import { actorFrom, logActivity } from "@/lib/server/activity";
import { runAction, zOptText } from "@/lib/server/action";
import { encryptSecret } from "@/lib/server/crypto";
import { emailLayout, isSmtpConfigured, sendMail } from "@/lib/server/email";
import { friendlyMailError } from "@/lib/reports/mail";

const smtpSchema = z.object({
  host: z
    .string()
    .trim()
    .min(3, "Serverul SMTP este obligatoriu")
    .max(255)
    .regex(/^[a-zA-Z0-9.-]+$/, "Adresă de server invalidă (ex. smtp.gmail.com)"),
  port: z.coerce.number().int("Port invalid").min(1, "Port invalid").max(65535, "Port invalid"),
  secure: z.boolean(),
  user: z.string().trim().min(1, "Utilizatorul este obligatoriu").max(255),
  password: z.string().max(500).optional().nullable(),
  from: zOptText.refine((v) => !v || v.length <= 200, "Maxim 200 de caractere"),
});

export type SmtpInput = z.input<typeof smtpSchema>;

/** Salvează setările SMTP. Parola se criptează; câmpul gol păstrează parola existentă. */
export async function saveSmtpAction(input: SmtpInput) {
  return runAction(async () => {
    const ctx = await requirePermission("settings");
    const d = smtpSchema.parse(input);
    const password = d.password?.trim() ? d.password : null;
    if (!password && !ctx.company.smtpPass) throw new Error("Introdu parola (sau cheia API) contului SMTP.");
    await db
      .update(companies)
      .set({
        smtpHost: d.host,
        smtpPort: d.port,
        smtpSecure: d.secure,
        smtpUser: d.user,
        smtpFrom: d.from,
        ...(password ? { smtpPass: encryptSecret(password) } : {}),
      })
      .where(eq(companies.id, ctx.company.id));
    await logActivity(actorFrom(ctx), {
      entity: "company",
      entityId: ctx.company.id,
      action: "smtp_updated",
      message: `Setările de email (SMTP) au fost actualizate: ${d.user} @ ${d.host}:${d.port}${password ? " · parolă nouă" : ""}`,
    });
    revalidatePath("/setari/email");
    return { hasPassword: true };
  }, "Setările de email au fost salvate");
}

export async function clearSmtpAction() {
  return runAction(async () => {
    const ctx = await requirePermission("settings");
    await db
      .update(companies)
      .set({ smtpHost: null, smtpPort: null, smtpUser: null, smtpPass: null, smtpFrom: null, smtpSecure: false })
      .where(eq(companies.id, ctx.company.id));
    await logActivity(actorFrom(ctx), { entity: "company", entityId: ctx.company.id, action: "smtp_cleared", message: "Configurația SMTP a fost ștearsă" });
    revalidatePath("/setari/email");
    return null;
  }, "Configurația de email a fost ștearsă");
}

/** Trimite un email de test către utilizatorul curent, cu setările salvate. */
export async function sendTestEmailAction() {
  return runAction(async () => {
    const ctx = await requirePermission("settings");
    const company = await db.query.companies.findFirst({ where: eq(companies.id, ctx.company.id) });
    if (!company || !isSmtpConfigured(company)) throw new Error("Salvează mai întâi serverul, utilizatorul și parola SMTP.");
    try {
      await sendMail(company, {
        to: ctx.user.email,
        subject: `Email de test — ${company.name}`,
        html: emailLayout(
          company,
          `<p>Bună, ${ctx.user.name}!</p>
<p>Acesta este un email de test trimis din <strong>AND</strong> (ANAF for Dummies). Dacă îl citești, setările SMTP pentru <strong>${company.name}</strong> funcționează corect: facturile, reminder-ele de plată și notificările vor pleca de la adresa configurată.</p>
<p style="color:#888;font-size:13px">Server: ${company.smtpHost}:${company.smtpPort ?? (company.smtpSecure ? 465 : 587)} · trimis la ${formatDateTime(new Date())}</p>`,
        ),
        text: `Email de test trimis din AND (ANAF for Dummies) pentru ${company.name}. Setările SMTP funcționează.`,
      });
    } catch (err) {
      throw new Error(friendlyMailError(err));
    }
    return { to: ctx.user.email };
  });
}
