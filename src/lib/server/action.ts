import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

export type ActionResult<T = null> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Rulează logica unei server action și normalizează rezultatul.
 * Erorile (inclusiv validarea Zod) devin `{ ok: false, error }`; redirect/notFound sunt re-aruncate.
 */
export async function runAction<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof z.ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      const first = err.issues[0];
      return { ok: false, error: first ? `${first.path.length ? `${first.path.join(".")}: ` : ""}${first.message}` : "Date invalide", fieldErrors };
    }
    console.error("[action]", err);
    return { ok: false, error: err instanceof Error ? err.message : "A apărut o eroare neașteptată." };
  }
}

/* Scheme Zod reutilizabile (mesaje în română) */
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dată invalidă");
export const zMoney = z.coerce.number({ error: "Sumă invalidă" }).finite();
export const zOptText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));
export const zReqText = (label: string) => z.string({ error: `${label} este obligatoriu` }).trim().min(1, `${label} este obligatoriu`);
