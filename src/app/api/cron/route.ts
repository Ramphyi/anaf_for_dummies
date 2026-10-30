import { eq } from "drizzle-orm";
import { refreshPendingInvoices, syncSpvMessages } from "@/lib/anaf/service";
import { db } from "@/lib/db";
import { anafConnections } from "@/lib/db/schema";
import { runAllDueRecurring, systemActor } from "@/lib/recurring/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Job zilnic: generează facturile recurente scadente, actualizează statusul facturilor din SPV
 * și sincronizează mesajele SPV pentru firmele cu sincronizare automată.
 * Apel: `curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron`
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) return Response.json({ error: "Neautorizat" }, { status: 401 });

  const recurring = await runAllDueRecurring().catch((e: unknown) => ({ error: String(e) }));
  const connections = await db.query.anafConnections.findMany({ where: eq(anafConnections.autoSync, true) });
  const anaf = [];
  for (const c of connections) {
    const actor = systemActor(c.companyId);
    try {
      const pending = await refreshPendingInvoices(actor);
      const spv = await syncSpvMessages(actor, 3);
      anaf.push({ companyId: c.companyId, pending, spv });
    } catch (e) {
      anaf.push({ companyId: c.companyId, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return Response.json({ ok: true, at: new Date().toISOString(), recurring, anaf });
}
