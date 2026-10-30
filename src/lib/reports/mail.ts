import "server-only";

/** Traduce erorile SMTP (nodemailer) în mesaje clare, în română. */
export function friendlyMailError(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; message?: string };
  const msg = e?.message ?? "";
  if (/nu este configurat/i.test(msg)) return msg;
  if (e?.code === "EAUTH" || e?.responseCode === 535) return "Autentificarea la serverul de email a eșuat — verifică utilizatorul și parola din Setări → Email (la Gmail/Outlook folosește o „parolă de aplicație”).";
  if (e?.code === "ENOTFOUND" || e?.code === "EDNS" || /ENOTFOUND/.test(msg)) return "Serverul SMTP nu a fost găsit — verifică adresa serverului în Setări → Email.";
  if (e?.code === "ETIMEDOUT" || e?.code === "ECONNECTION" || e?.code === "ECONNREFUSED" || /ETIMEDOUT|ECONNREFUSED/.test(msg))
    return "Nu ne-am putut conecta la serverul de email — verifică portul și dacă serverul acceptă conexiuni externe.";
  if (e?.code === "ESOCKET" || /wrong version number|ssl/i.test(msg)) return "Eroare SSL/TLS — pentru portul 465 activează „Conexiune securizată”, pentru 587 dezactiveaz-o (STARTTLS).";
  if (e?.code === "EENVELOPE") return "Serverul a refuzat expeditorul sau destinatarul — verifică adresa „De la” și emailul clientului.";
  return msg || "Emailul nu a putut fi trimis.";
}
