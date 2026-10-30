/**
 * Utilitare pentru modulul ANAF (e-Factura, SPV, e-Transport) — sigure atât pe client cât și pe server.
 */
import { RO_PUBLIC_HOLIDAYS, type Tone } from "@/lib/constants";

/* ------------------------------ Statusuri ------------------------------ */

export const ETRANSPORT_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Ciornă", tone: "neutral" },
  pending: { label: "În prelucrare", tone: "warning" },
  ok: { label: "Confirmată ANAF", tone: "success" },
  nok: { label: "Respinsă", tone: "danger" },
  error: { label: "Eroare", tone: "danger" },
};

export const SPV_TYPE: Record<string, { label: string; tone: Tone }> = {
  "FACTURA PRIMITA": { label: "Factură primită", tone: "brand" },
  "FACTURA TRIMISA": { label: "Factură trimisă", tone: "success" },
  "ERORI FACTURA": { label: "Erori de validare", tone: "danger" },
  "MESAJ CUMPARATOR": { label: "Mesaj de la cumpărător", tone: "info" },
};

export const ANAF_LOG_ACTIONS: Record<string, string> = {
  upload: "Încărcare factură",
  status: "Stare mesaj",
  list: "Listă mesaje SPV",
  download: "Descărcare mesaj",
  token: "Token OAuth",
  validate: "Validare XML",
  pdf: "Conversie XML → PDF",
  etransport_upload: "e-Transport · încărcare",
  etransport_status: "e-Transport · stare",
  cui: "Interogare CUI",
};

/* ------------------------------ Date ANAF ------------------------------ */

/** „202610271432” (YYYYMMDDHHmm, format SPV) → Date locală. */
export function parseAnafDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Adaugă zile lucrătoare (fără weekend și sărbători legale). */
export function addWorkingDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd === 0 || wd === 6 || RO_PUBLIC_HOLIDAYS[isoDay(d)]) continue;
    left--;
  }
  return isoDay(d);
}

/** Zile calendaristice între două date ISO (b − a). */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86_400_000);
}

/** Termenul legal de transmitere în e-Factura: 5 zile lucrătoare de la emitere. */
export function efacturaDeadline(issueDate: string, today: string) {
  const deadline = addWorkingDays(issueDate, 5);
  const left = daysBetween(today, deadline);
  return { deadline, left, overdue: left < 0 };
}

/** Valabilitatea codului UIT: 5 zile (transport național), 15 zile (operațiuni intracomunitare / import). */
export function etransportValidity(transportDate: string, operationType: string, today: string) {
  const days = operationType === "30" ? 5 : 15;
  const end = new Date(`${transportDate}T12:00:00`);
  end.setDate(end.getDate() + days - 1);
  const endIso = isoDay(end);
  const elapsed = daysBetween(transportDate, today);
  const remaining = daysBetween(today, endIso);
  return {
    days,
    start: transportDate,
    end: endIso,
    notStarted: elapsed < 0,
    expired: remaining < 0,
    remaining,
    progress: Math.max(0, Math.min(100, ((elapsed + 1) / days) * 100)),
  };
}

/* ------------------------------ XML ------------------------------ */

/** Indentează un XML (pentru afișare). Nu modifică conținutul, doar spațierea dintre tag-uri. */
export function prettyXml(xml: string, indent = "  "): string {
  const src = xml.replace(/>\s+</g, "><").trim();
  const tokens = src.split(/(<[^>]+>)/g).filter((t) => t !== "");
  const out: string[] = [];
  let depth = 0;
  const pad = () => indent.repeat(Math.max(0, depth));
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith("<?") || t.startsWith("<!")) {
      out.push(pad() + t);
    } else if (t.startsWith("</")) {
      depth--;
      out.push(pad() + t);
    } else if (t.startsWith("<")) {
      const selfClosing = t.endsWith("/>");
      const next = tokens[i + 1];
      const after = tokens[i + 2];
      if (!selfClosing && next !== undefined && !next.startsWith("<") && after?.startsWith("</")) {
        out.push(pad() + t + next + after);
        i += 2;
      } else if (!selfClosing && next?.startsWith("</")) {
        out.push(pad() + t + next);
        i += 1;
      } else {
        out.push(pad() + t);
        if (!selfClosing) depth++;
      }
    } else if (t.trim()) {
      out.push(pad() + t.trim());
    }
  }
  return out.join("\n");
}

/** Mesaj prietenos pentru erorile de rețea / ANAF. */
export function friendlyAnafError(err: unknown): string {
  const e = err instanceof Error ? err : null;
  const msg = e?.message ?? String(err ?? "");
  const cause = e?.cause instanceof Error ? `${e.cause.message} ${(e.cause as { code?: string }).code ?? ""}` : "";
  const hay = `${msg} ${cause} ${e?.name ?? ""}`;
  if (/TimeoutError|timed out|timeout|aborted/i.test(hay)) {
    return "Serverele ANAF nu au răspuns la timp. Încearcă din nou peste câteva minute.";
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|ETIMEDOUT|socket hang up|network/i.test(hay)) {
    return "Nu am putut contacta serverele ANAF. Verifică conexiunea la internet și încearcă din nou.";
  }
  return msg || "A apărut o eroare la comunicarea cu ANAF.";
}

/* ------------------------------ Cheltuieli ------------------------------ */

const CATEGORY_HINTS: [RegExp, string][] = [
  [/energie|electric|gaz|apă|apa |utilit|internet|telefon|fibr/i, "utilitati"],
  [/server|hosting|cloud|backup|licen|software|abonament saas|domeniu/i, "software"],
  [/laptop|monitor|docking|calculator|hardware|imprimant|tastatur|mouse/i, "hardware"],
  [/curier|transport|livrare|combustibil|motorin|benzin/i, "transport"],
  [/chiri/i, "chirie"],
  [/marketing|publicit|ads|promov/i, "marketing"],
  [/consultan|servic|mentenan|audit|contabil/i, "servicii"],
];

/** Sugerează o categorie de cheltuială pe baza denumirilor de pe factură. */
export function guessExpenseCategory(texts: string[]): string {
  const hay = texts.join(" ");
  return CATEGORY_HINTS.find(([re]) => re.test(hay))?.[1] ?? "altele";
}

/** Nume de fișier sigur. */
export function safeFilename(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}
