import { z } from "zod";
import { isAiConfigured } from "@/lib/ai/openai";
import { toolCtxFromApp } from "@/lib/assistant/context";
import { runAssistantTurn, type StreamEvent } from "@/lib/assistant/engine";
import { getContext } from "@/lib/auth/session";

export const runtime = "nodejs";
export const maxDuration = 300;

const body = z.object({
  conversationId: z.string().nullish(),
  message: z.string().trim().min(1).max(8000),
  pathname: z.string().max(300).nullish(),
});

// Limitare simplă per utilizator: 30 de mesaje / 10 minute.
const hits = new Map<string, number[]>();
function rateLimited(userId: string) {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > 30;
}

/** Chat cu streaming NDJSON: o linie JSON per eveniment (text, unelte, titlu, final). */
export async function POST(request: Request) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Neautentificat" }, { status: 401 });
  if (!isAiConfigured()) return Response.json({ error: "Asistentul AI nu este configurat: lipsește OPENAI_API_KEY." }, { status: 503 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Mesaj invalid" }, { status: 400 });
  if (rateLimited(ctx.user.id)) return Response.json({ error: "Prea multe mesaje într-un timp scurt. Încearcă din nou în câteva minute." }, { status: 429 });

  const encoder = new TextEncoder();
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          /* clientul a închis conexiunea */
        }
      };
      try {
        await runAssistantTurn({
          ctx: toolCtxFromApp(ctx),
          conversationId: parsed.data.conversationId,
          text: parsed.data.message,
          pathname: parsed.data.pathname,
          signal: abort.signal,
          emit,
        });
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : "Eroare la asistent" });
      } finally {
        try {
          controller.close();
        } catch {
          /* deja închis */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
