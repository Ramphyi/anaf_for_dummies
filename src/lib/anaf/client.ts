import "server-only";
import { eq } from "drizzle-orm";
import { unzipSync, strFromU8 } from "fflate";
import { db } from "@/lib/db";
import { anafConnections, anafLogs, type AnafConnection, type AnafEnvironment } from "@/lib/db/schema";
import * as sim from "@/lib/anaf/simulator";
import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import type { UblParty } from "@/lib/anaf/ubl";

/* ------------------------------------------------------------------ */
/* Endpoint-uri oficiale                                               */
/* ------------------------------------------------------------------ */

export const ANAF_OAUTH = {
  authorize: "https://logincert.anaf.ro/anaf-oauth2/v1/authorize",
  token: "https://logincert.anaf.ro/anaf-oauth2/v1/token",
  revoke: "https://logincert.anaf.ro/anaf-oauth2/v1/revoke",
};

const apiBase = (env: AnafEnvironment) => `https://api.anaf.ro/${env === "prod" ? "prod" : "test"}`;
export const efacturaBase = (env: AnafEnvironment) => `${apiBase(env)}/FCTEL/rest`;
export const etransportBase = (env: AnafEnvironment) => `${apiBase(env)}/ETRANSPORT/ws/v1`;
/** Servicii publice (fără token): validare XML și conversie XML → PDF. */
export const PUBLIC_EFACTURA = "https://webservicesp.anaf.ro/prod/FCTEL/rest";

export const ENV_LABELS: Record<AnafEnvironment, string> = {
  simulation: "Simulare (fără ANAF)",
  test: "ANAF Test",
  prod: "ANAF Producție",
};

/* ------------------------------------------------------------------ */
/* Conexiune & OAuth2                                                  */
/* ------------------------------------------------------------------ */

/** Conexiunea ANAF a firmei, cu secretele decriptate (în DB sunt criptate AES-256-GCM). */
export async function getConnection(companyId: string): Promise<AnafConnection> {
  const existing = await db.query.anafConnections.findFirst({ where: eq(anafConnections.companyId, companyId) });
  if (existing) {
    return {
      ...existing,
      clientSecret: decryptSecret(existing.clientSecret),
      accessToken: decryptSecret(existing.accessToken),
      refreshToken: decryptSecret(existing.refreshToken),
    };
  }
  const [created] = await db.insert(anafConnections).values({ companyId }).returning();
  return created;
}

export function defaultRedirectUri() {
  return `${process.env.APP_URL ?? "http://localhost:3000"}/api/anaf/callback`;
}

export function buildAuthorizeUrl(conn: AnafConnection, state: string) {
  if (!conn.clientId) throw new Error("Completează Client ID și Client Secret din aplicația înregistrată în SPV.");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: conn.clientId,
    redirect_uri: conn.redirectUri || defaultRedirectUri(),
    token_content_type: "jwt",
    state,
  });
  return `${ANAF_OAUTH.authorize}?${params}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number; token_type?: string; error?: string; error_description?: string };

async function tokenRequest(conn: AnafConnection, body: Record<string, string>): Promise<TokenResponse> {
  if (!conn.clientId || !conn.clientSecret) throw new Error("Lipsesc Client ID / Client Secret ANAF.");
  const started = Date.now();
  const res = await fetch(ANAF_OAUTH.token, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${conn.clientId}:${conn.clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ ...body, client_id: conn.clientId, client_secret: conn.clientSecret, token_content_type: "jwt" }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  await log(conn.companyId, conn.environment, "token", res.ok && !!json.access_token, body.grant_type, JSON.stringify({ ...json, access_token: json.access_token ? "***" : undefined, refresh_token: json.refresh_token ? "***" : undefined }), started);
  if (!res.ok || !json.access_token) throw new Error(json.error_description || json.error || `ANAF OAuth a răspuns cu ${res.status}`);
  return json;
}

async function saveTokens(conn: AnafConnection, t: TokenResponse) {
  const now = Date.now();
  await db
    .update(anafConnections)
    .set({
      accessToken: encryptSecret(t.access_token),
      refreshToken: encryptSecret(t.refresh_token ?? conn.refreshToken),
      accessTokenExpiresAt: new Date(now + (t.expires_in ?? 90 * 86400) * 1000),
      refreshTokenExpiresAt: t.refresh_token ? new Date(now + 365 * 86400 * 1000) : conn.refreshTokenExpiresAt,
      connectedAt: conn.connectedAt ?? new Date(now),
      oauthState: null,
    })
    .where(eq(anafConnections.id, conn.id));
}

export async function exchangeCode(conn: AnafConnection, code: string) {
  const t = await tokenRequest(conn, { grant_type: "authorization_code", code, redirect_uri: conn.redirectUri || defaultRedirectUri() });
  await saveTokens(conn, t);
}

export async function refreshAccessToken(conn: AnafConnection) {
  if (!conn.refreshToken) throw new Error("Nu există refresh token — reconectează-te la ANAF.");
  const t = await tokenRequest(conn, { grant_type: "refresh_token", refresh_token: conn.refreshToken });
  await saveTokens(conn, t);
  return t.access_token;
}

/** Token valid (reîmprospătat automat cu 7 zile înainte de expirare). */
async function accessToken(conn: AnafConnection): Promise<string> {
  if (!conn.accessToken) throw new Error("Firma nu este conectată la ANAF. Mergi la e-Factura → Conexiune ANAF.");
  const expires = conn.accessTokenExpiresAt?.getTime() ?? 0;
  if (expires - Date.now() < 7 * 86400 * 1000) return refreshAccessToken(conn);
  return conn.accessToken;
}

export function connectionState(conn: AnafConnection) {
  if (conn.environment === "simulation") return { connected: true, label: "Simulare activă", tone: "brand" as const };
  if (!conn.accessToken) return { connected: false, label: "Neconectat", tone: "neutral" as const };
  const expires = conn.accessTokenExpiresAt?.getTime() ?? 0;
  if (expires < Date.now()) return { connected: false, label: "Token expirat", tone: "danger" as const };
  return { connected: true, label: conn.environment === "prod" ? "Conectat (producție)" : "Conectat (test)", tone: "success" as const };
}

/* ------------------------------------------------------------------ */
/* Jurnal                                                              */
/* ------------------------------------------------------------------ */

async function log(companyId: string, environment: string, action: string, success: boolean, request: string | null, response: string | null, started: number) {
  await db.insert(anafLogs).values({
    companyId,
    environment,
    action,
    success,
    request: request?.slice(0, 4000) ?? null,
    response: response?.slice(0, 8000) ?? null,
    durationMs: Date.now() - started,
  });
}

async function authedFetch(conn: AnafConnection, action: string, url: string, init: RequestInit = {}) {
  const started = Date.now();
  const token = await accessToken(conn);
  try {
    const res = await fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    const isBinary = (res.headers.get("content-type") ?? "").includes("zip") || (res.headers.get("content-type") ?? "").includes("pdf");
    const buf = new Uint8Array(await res.arrayBuffer());
    const bodyText = isBinary ? `[binar ${buf.length} bytes]` : new TextDecoder().decode(buf);
    await log(conn.companyId, conn.environment, action, res.ok, `${init.method ?? "GET"} ${url}`, bodyText, started);
    if (res.status === 401 || res.status === 403) throw new Error("ANAF a refuzat autorizarea (token invalid sau fără drept pe acest CIF).");
    if (!res.ok) throw new Error(`ANAF a răspuns cu ${res.status}: ${bodyText.slice(0, 300)}`);
    return { res, buf, text: isBinary ? "" : bodyText };
  } catch (err) {
    if (!(err instanceof Error && err.message.startsWith("ANAF"))) {
      await log(conn.companyId, conn.environment, action, false, `${init.method ?? "GET"} ${url}`, String(err), started);
    }
    throw err;
  }
}

const attr = (xml: string, name: string) => xml.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? null;

/* ------------------------------------------------------------------ */
/* e-Factura                                                           */
/* ------------------------------------------------------------------ */

export type UploadResult = { uploadId: string | null; ok: boolean; errors: string[]; raw: string };

export async function efacturaUpload(
  conn: AnafConnection,
  cif: string,
  xml: string,
  opts: { b2c?: boolean; foreignBuyer?: boolean; selfInvoice?: boolean } = {},
): Promise<UploadResult> {
  if (conn.environment === "simulation") {
    const started = Date.now();
    const r = sim.upload(xml);
    await log(conn.companyId, "simulation", "upload", r.ok, `upload cif=${cif}`, r.raw, started);
    return r;
  }
  const params = new URLSearchParams({ standard: "UBL", cif });
  if (opts.foreignBuyer) params.set("extern", "DA");
  if (opts.selfInvoice) params.set("autofactura", "DA");
  const endpoint = opts.b2c ? "uploadb2c" : "upload";
  const { text } = await authedFetch(conn, "upload", `${efacturaBase(conn.environment)}/${endpoint}?${params}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: xml,
  });
  const status = attr(text, "ExecutionStatus");
  const errors = [...text.matchAll(/errorMessage="([^"]*)"/g)].map((m) => m[1]);
  return { uploadId: attr(text, "index_incarcare"), ok: status === "0", errors, raw: text };
}

export type StatusResult = { state: "ok" | "nok" | "processing" | "error"; downloadId: string | null; message: string | null; raw: string };

export async function efacturaStatus(conn: AnafConnection, uploadId: string): Promise<StatusResult> {
  if (conn.environment === "simulation") {
    const started = Date.now();
    const r = sim.status(uploadId);
    await log(conn.companyId, "simulation", "status", true, `stareMesaj ${uploadId}`, r.raw, started);
    return r;
  }
  const { text } = await authedFetch(conn, "status", `${efacturaBase(conn.environment)}/stareMesaj?id_incarcare=${encodeURIComponent(uploadId)}`);
  const stare = attr(text, "stare");
  const errors = [...text.matchAll(/errorMessage="([^"]*)"/g)].map((m) => m[1]);
  const state: StatusResult["state"] =
    stare === "ok" ? "ok" : stare === "nok" ? "nok" : stare === "in prelucrare" ? "processing" : errors.length ? "error" : "error";
  return { state, downloadId: attr(text, "id_descarcare"), message: errors.join("; ") || stare, raw: text };
}

export type SpvListMessage = { id: string; requestId: string; type: string; cif: string; details: string; createdAt: string };

export async function efacturaListMessages(conn: AnafConnection, cif: string, days: number, filter?: "E" | "T" | "P" | "R") {
  if (conn.environment === "simulation") {
    const started = Date.now();
    const r = sim.listMessages(cif, days);
    await log(conn.companyId, "simulation", "list", true, `listaMesajeFactura zile=${days}`, `${r.length} mesaje`, started);
    return r;
  }
  const params = new URLSearchParams({ zile: String(Math.min(60, Math.max(1, days))), cif });
  if (filter) params.set("filtru", filter);
  const { text } = await authedFetch(conn, "list", `${efacturaBase(conn.environment)}/listaMesajeFactura?${params}`);
  const json = JSON.parse(text) as {
    mesaje?: { data_creare: string; cif: string; id_solicitare: string; detalii: string; tip: string; id: string }[];
    eroare?: string;
  };
  if (!json.mesaje) {
    if (json.eroare && /nu exista mesaje/i.test(json.eroare)) return [];
    if (json.eroare) throw new Error(json.eroare);
    return [];
  }
  return json.mesaje.map<SpvListMessage>((m) => ({
    id: m.id,
    requestId: m.id_solicitare,
    type: m.tip,
    cif: m.cif,
    details: m.detalii,
    createdAt: m.data_creare,
  }));
}

/** Descarcă arhiva ZIP a unui mesaj și extrage factura + semnătura. */
export async function efacturaDownload(
  conn: AnafConnection,
  downloadId: string,
  sim_opts: { fallbackXml?: () => Promise<string | null>; customer?: UblParty } = {},
) {
  let zip: Uint8Array;
  if (conn.environment === "simulation") {
    const started = Date.now();
    zip = await sim.download(downloadId, sim_opts.fallbackXml, sim_opts.customer);
    await log(conn.companyId, "simulation", "download", true, `descarcare ${downloadId}`, `[zip ${zip.length} bytes]`, started);
  } else {
    const { buf, res } = await authedFetch(conn, "download", `${efacturaBase(conn.environment)}/descarcare?id=${encodeURIComponent(downloadId)}`);
    if (!(res.headers.get("content-type") ?? "").includes("zip") && buf[0] !== 0x50) {
      throw new Error(new TextDecoder().decode(buf).slice(0, 300));
    }
    zip = buf;
  }
  const files = unzipSync(zip);
  let invoiceXml: string | null = null;
  let signatureXml: string | null = null;
  for (const [name, data] of Object.entries(files)) {
    const content = strFromU8(data);
    if (/semnatura/i.test(name)) signatureXml = content;
    else if (name.endsWith(".xml")) invoiceXml = content;
  }
  return { zip, invoiceXml, signatureXml };
}

/** Validare XML la ANAF (serviciu public — funcționează și fără conexiune OAuth). */
export async function validateXml(companyId: string, xml: string, standard: "FACT1" | "FCN" = "FACT1") {
  const started = Date.now();
  try {
    const res = await fetch(`${PUBLIC_EFACTURA}/validare/${standard}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: xml,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    await log(companyId, "public", "validate", res.ok, `validare/${standard}`, text, started);
    const json = JSON.parse(text) as { stare?: string; Messages?: { message: string }[]; trace_id?: string };
    return { ok: json.stare === "ok", messages: (json.Messages ?? []).map((m) => m.message), traceId: json.trace_id ?? null };
  } catch (err) {
    await log(companyId, "public", "validate", false, `validare/${standard}`, String(err), started);
    throw new Error(`Serviciul ANAF de validare nu răspunde: ${err instanceof Error ? err.message : err}`);
  }
}

/** Conversie XML → PDF prin serviciul public ANAF (formatul oficial de vizualizare). */
export async function xmlToPdf(companyId: string, xml: string, validate = false): Promise<Uint8Array> {
  const started = Date.now();
  const res = await fetch(`${PUBLIC_EFACTURA}/transformare/FACT1${validate ? "" : "/DA"}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: xml,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const buf = new Uint8Array(await res.arrayBuffer());
  const isPdf = buf[0] === 0x25 && buf[1] === 0x50; // %P
  await log(companyId, "public", "pdf", isPdf, "transformare/FACT1", isPdf ? `[pdf ${buf.length} bytes]` : new TextDecoder().decode(buf), started);
  if (!isPdf) throw new Error(`ANAF nu a putut genera PDF-ul: ${new TextDecoder().decode(buf).slice(0, 300)}`);
  return buf;
}

/* ------------------------------------------------------------------ */
/* e-Transport                                                         */
/* ------------------------------------------------------------------ */

export async function etransportUpload(conn: AnafConnection, cif: string, xml: string) {
  if (conn.environment === "simulation") {
    const started = Date.now();
    const r = sim.etransportUpload();
    await log(conn.companyId, "simulation", "etransport_upload", true, `ETRANSP cif=${cif}`, r.raw, started);
    return r;
  }
  const { text } = await authedFetch(conn, "etransport_upload", `${etransportBase(conn.environment)}/upload/ETRANSP/${cif}/2`, {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body: xml,
  });
  const errors = [...text.matchAll(/errorMessage="([^"]*)"/g)].map((m) => m[1]);
  return {
    ok: attr(text, "ExecutionStatus") === "0",
    uploadId: attr(text, "index_incarcare"),
    uit: attr(text, "UIT"),
    errors,
    raw: text,
  };
}

export async function etransportStatus(conn: AnafConnection, uploadId: string): Promise<StatusResult> {
  if (conn.environment === "simulation") return sim.status(uploadId);
  const { text } = await authedFetch(conn, "etransport_status", `${etransportBase(conn.environment)}/stareMesaj/${encodeURIComponent(uploadId)}`);
  const stare = attr(text, "stare");
  const errors = [...text.matchAll(/errorMessage="([^"]*)"/g)].map((m) => m[1]);
  return {
    state: stare === "ok" ? "ok" : stare === "nok" ? "nok" : stare === "in prelucrare" ? "processing" : "error",
    downloadId: attr(text, "id_descarcare"),
    message: errors.join("; ") || stare,
    raw: text,
  };
}
