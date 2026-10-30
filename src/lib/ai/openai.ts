import "server-only";
import OpenAI from "openai";

/**
 * Provider-ul AI al platformei: OpenAI (Responses API).
 * Toate funcțiile AI (asistentul, titluri de conversații etc.) trec prin acest modul.
 */

export const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.5";
export const FAST_MODEL = process.env.OPENAI_FAST_MODEL || "gpt-5.4-mini";

let client: OpenAI | null = null;

export function isAiConfigured() {
  return !!process.env.OPENAI_API_KEY;
}

export function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Asistentul AI nu este configurat: setează OPENAI_API_KEY în .env.local (sau în docker-compose).");
  }
  client ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    organization: process.env.OPENAI_ORG_ID || undefined,
    project: process.env.OPENAI_PROJECT_ID || undefined,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
  return client;
}

/** Modelele de raționament (gpt-5+, o-series) acceptă `reasoning.effort`. */
export function supportsReasoning(model: string) {
  return /^(gpt-5|gpt-6|o\d)/.test(model) && !/chat-latest/.test(model);
}

/** Mesaje de eroare prietenoase pentru erorile OpenAI. */
export function describeAiError(err: unknown, model?: string): string {
  if (err instanceof OpenAI.AuthenticationError) return "Cheia OpenAI (OPENAI_API_KEY) este invalidă sau a fost revocată.";
  if (err instanceof OpenAI.PermissionDeniedError) return "Contul OpenAI nu are acces la această resursă sau model.";
  if (err instanceof OpenAI.NotFoundError) return `Modelul „${model ?? DEFAULT_MODEL}” nu este disponibil pentru contul tău OpenAI. Alege alt model din Asistent → Setări.`;
  if (err instanceof OpenAI.RateLimitError) return "Limita de utilizare OpenAI a fost atinsă (rate limit sau credit epuizat). Încearcă din nou peste puțin timp.";
  if (err instanceof OpenAI.BadRequestError) return `Cererea a fost respinsă de OpenAI: ${err.message}`;
  if (err instanceof OpenAI.APIConnectionError) return "Nu mă pot conecta la OpenAI. Verifică conexiunea la internet.";
  if (err instanceof OpenAI.APIError) return `Eroare OpenAI (${err.status ?? "?"}): ${err.message}`;
  return err instanceof Error ? err.message : "Eroare necunoscută la asistentul AI.";
}
