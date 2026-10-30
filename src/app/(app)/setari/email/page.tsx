import { SmtpForm } from "@/components/settings/smtp-form";
import { requirePermission } from "@/lib/auth/session";

export const metadata = { title: "Setări email" };

export default async function EmailSettingsPage() {
  const ctx = await requirePermission("settings");
  const c = ctx.company;
  return (
    <SmtpForm
      userEmail={ctx.user.email}
      // parola SMTP nu se trimite niciodată către browser — doar dacă există
      initial={{
        host: c.smtpHost ?? "",
        port: c.smtpPort ?? (c.smtpSecure ? 465 : 587),
        secure: c.smtpSecure,
        user: c.smtpUser ?? "",
        from: c.smtpFrom ?? "",
        hasPassword: !!c.smtpPass,
      }}
    />
  );
}
