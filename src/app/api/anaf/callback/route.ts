import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { friendlyAnafError } from "@/components/anaf/utils";
import { ENV_LABELS, exchangeCode, getConnection } from "@/lib/anaf/client";
import { can, getContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { anafConnections } from "@/lib/db/schema";
import { actorFrom, logActivity } from "@/lib/server/activity";

const STATE_MAX_AGE_MS = 20 * 60 * 1000;

function sameState(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Redirect URI OAuth2 ANAF: validează `state`, schimbă `code` pe token-uri și revine în /efactura. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const back = (params: Record<string, string>) => NextResponse.redirect(new URL(`/efactura?${new URLSearchParams(params)}`, request.url));

  const ctx = await getContext();
  if (!ctx) return NextResponse.redirect(new URL("/login?next=/efactura/conexiune", request.url));
  if (!can(ctx, "anaf")) return back({ error: "Nu ai permisiunea de a conecta firma la ANAF." });

  const conn = await getConnection(ctx.company.id);
  const clearState = () => db.update(anafConnections).set({ oauthState: null }).where(eq(anafConnections.id, conn.id));

  const oauthError = q.get("error");
  if (oauthError) {
    await clearState();
    return back({ error: `ANAF a refuzat autorizarea: ${q.get("error_description") || oauthError}` });
  }

  const code = q.get("code");
  const state = q.get("state");
  if (!code || !state) return back({ error: "Răspuns incomplet de la ANAF (lipsește codul de autorizare). Încearcă din nou." });

  if (!conn.oauthState || !sameState(conn.oauthState, state)) {
    return back({ error: "Sesiunea de autorizare nu corespunde acestei firme sau a expirat. Pornește din nou conectarea." });
  }
  const issuedAt = Number.parseInt(conn.oauthState.split(".")[0] ?? "", 36);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > STATE_MAX_AGE_MS) {
    await clearState();
    return back({ error: "Cererea de autorizare a expirat (peste 20 de minute). Pornește din nou conectarea." });
  }

  try {
    await exchangeCode(conn, code);
  } catch (err) {
    await clearState();
    return back({ error: `Nu am putut obține token-ul ANAF. ${friendlyAnafError(err)}` });
  }

  await logActivity(actorFrom(ctx), {
    entity: "anaf",
    action: "connected",
    message: `Firma ${ctx.company.name} a fost conectată la ${ENV_LABELS[conn.environment]} prin OAuth2`,
  });
  revalidatePath("/", "layout");
  return back({ connected: "1" });
}
