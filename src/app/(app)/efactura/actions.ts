"use server";

import { randomBytes } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { friendlyAnafError, guessExpenseCategory } from "@/components/anaf/utils";
import { buildAuthorizeUrl, getConnection, refreshAccessToken } from "@/lib/anaf/client";
import {
  downloadSpvMessage,
  importSpvMessage,
  refreshInvoiceStatus,
  refreshPendingInvoices,
  sendInvoiceToSpv,
  syncSpvMessages,
} from "@/lib/anaf/service";
import { parseUbl, type ParsedUbl } from "@/lib/anaf/ubl-parse";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ANAF_ENVIRONMENTS, anafConnections, documents, EXPENSE_CATEGORIES, spvMessages } from "@/lib/db/schema";
import { actorFrom, logActivity } from "@/lib/server/activity";
import { runAction } from "@/lib/server/action";
import { encryptSecret } from "@/lib/server/crypto";

const zId = z.string().trim().min(1, "Identificator lipsă");

function revalidateEfactura(documentId?: string) {
  revalidatePath("/efactura");
  revalidatePath("/facturi");
  if (documentId) revalidatePath(`/facturi/${documentId}`);
  revalidatePath("/", "layout");
}

/* ------------------------------ Facturi trimise ------------------------------ */

export async function sendInvoiceAction(documentId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("anaf");
    const id = zId.parse(documentId);
    const r = await sendInvoiceToSpv(actorFrom(ctx), id);
    revalidateEfactura(id);
    if (!r.ok) throw new Error(`Factura nu a fost acceptată: ${r.errors.map(friendlyAnafError).slice(0, 3).join(" · ")}`);
    return { uploadId: r.uploadId };
  });
}

export async function sendAllUnsentAction() {
  return runAction(async () => {
    const ctx = await requirePermission("anaf");
    const actor = actorFrom(ctx);
    const unsent = await db.query.documents.findMany({
      where: and(
        eq(documents.companyId, ctx.company.id),
        eq(documents.kind, "invoice"),
        eq(documents.efacturaStatus, "none"),
        ne(documents.status, "draft"),
        ne(documents.status, "cancelled"),
      ),
      columns: { id: true },
    });
    let sent = 0;
    let failed = 0;
    for (const d of unsent) {
      try {
        const r = await sendInvoiceToSpv(actor, d.id);
        if (r.ok) sent++;
        else failed++;
      } catch {
        failed++;
      }
    }
    revalidateEfactura();
    return { total: unsent.length, sent, failed };
  });
}

export async function refreshInvoiceStatusAction(documentId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("anaf");
    const id = zId.parse(documentId);
    try {
      const r = await refreshInvoiceStatus(actorFrom(ctx), id);
      revalidateEfactura(id);
      return { state: r.state, message: r.message };
    } catch (err) {
      throw new Error(friendlyAnafError(err));
    }
  });
}

export async function refreshAllStatusesAction() {
  return runAction(async () => {
    const ctx = await requirePermission("anaf");
    const r = await refreshPendingInvoices(actorFrom(ctx));
    revalidateEfactura();
    return r;
  });
}

/* ------------------------------ Mesaje SPV ------------------------------ */

export async function syncSpvAction(days: number) {
  return runAction(async () => {
    const ctx = await requirePermission("anaf");
    const d = z.coerce.number().int().min(1, "Minimum 1 zi").max(60, "ANAF permite maximum 60 de zile").parse(days);
    try {
      const r = await syncSpvMessages(actorFrom(ctx), d);
      revalidatePath("/efactura");
      revalidatePath("/", "layout");
      return r;
    } catch (err) {
      throw new Error(friendlyAnafError(err));
    }
  });
}

export type OpenedSpvMessage = {
  id: string;
  type: string;
  xml: string | null;
  hasSignature: boolean;
  parsed: ParsedUbl | null;
  parseError: string | null;
  purchaseInvoiceId: string | null;
  suggestedCategory: string;
};

/** Descarcă (dacă e nevoie) și deschide un mesaj SPV: îl marchează citit și returnează XML + rezumat. */
export async function openSpvMessageAction(messageId: string) {
  return runAction<OpenedSpvMessage>(async () => {
    const ctx = await requirePermission("anaf");
    const id = zId.parse(messageId);
    const exists = await db.query.spvMessages.findFirst({
      where: and(eq(spvMessages.id, id), eq(spvMessages.companyId, ctx.company.id)),
      columns: { id: true, read: true },
    });
    if (!exists) throw new Error("Mesajul nu există.");
    if (!exists.read) {
      await db.update(spvMessages).set({ read: true }).where(eq(spvMessages.id, id));
      revalidatePath("/", "layout");
    }
    revalidatePath("/efactura");
    let msg;
    try {
      msg = await downloadSpvMessage(actorFrom(ctx), id);
    } catch (err) {
      throw new Error(`Mesajul nu a putut fi descărcat din SPV. ${friendlyAnafError(err)}`);
    }
    let parsed: ParsedUbl | null = null;
    let parseError: string | null = null;
    if (msg.xml) {
      try {
        parsed = parseUbl(msg.xml);
      } catch (err) {
        parseError = err instanceof Error ? err.message : "XML-ul nu a putut fi interpretat.";
      }
    }
    return {
      id: msg.id,
      type: msg.type,
      xml: msg.xml,
      hasSignature: !!msg.signatureXml,
      parsed,
      parseError,
      purchaseInvoiceId: msg.purchaseInvoiceId,
      suggestedCategory: parsed ? guessExpenseCategory([parsed.supplier.name, ...parsed.lines.map((l) => l.name)]) : "altele",
    };
  });
}

export async function setSpvReadAction(messageId: string, read: boolean) {
  return runAction(async () => {
    const ctx = await requirePermission("anaf");
    const id = zId.parse(messageId);
    await db
      .update(spvMessages)
      .set({ read: z.boolean().parse(read) })
      .where(and(eq(spvMessages.id, id), eq(spvMessages.companyId, ctx.company.id)));
    revalidatePath("/efactura");
    revalidatePath("/", "layout");
    return { read };
  });
}

export async function markAllSpvReadAction() {
  return runAction(async () => {
    const ctx = await requirePermission("anaf");
    const rows = await db
      .update(spvMessages)
      .set({ read: true })
      .where(and(eq(spvMessages.companyId, ctx.company.id), eq(spvMessages.read, false)))
      .returning({ id: spvMessages.id });
    revalidatePath("/efactura");
    revalidatePath("/", "layout");
    return { count: rows.length };
  }, "Toate mesajele au fost marcate ca citite");
}

export async function importSpvAction(messageId: string, category: string) {
  return runAction(async () => {
    const ctx = await requirePermission("anaf");
    const id = zId.parse(messageId);
    const cat = z.enum(EXPENSE_CATEGORIES, { error: "Categorie invalidă" }).parse(category);
    let purchaseId: string;
    try {
      purchaseId = await importSpvMessage(actorFrom(ctx), id, cat);
    } catch (err) {
      throw new Error(friendlyAnafError(err));
    }
    revalidatePath("/efactura");
    revalidatePath("/cheltuieli");
    revalidatePath("/furnizori");
    revalidatePath("/", "layout");
    return { purchaseId };
  });
}

/** Importă în lot toate facturile primite neimportate (categoria sugerată automat). */
export async function importAllSpvAction() {
  return runAction(async () => {
    const ctx = await requirePermission("anaf");
    const actor = actorFrom(ctx);
    const pending = await db.query.spvMessages.findMany({
      where: and(eq(spvMessages.companyId, ctx.company.id), eq(spvMessages.type, "FACTURA PRIMITA")),
      columns: { id: true, purchaseInvoiceId: true },
    });
    let imported = 0;
    let failed = 0;
    for (const m of pending.filter((p) => !p.purchaseInvoiceId)) {
      try {
        const msg = await downloadSpvMessage(actor, m.id);
        let category = "altele";
        if (msg.xml) {
          try {
            const p = parseUbl(msg.xml);
            category = guessExpenseCategory([p.supplier.name, ...p.lines.map((l) => l.name)]);
          } catch {
            /* categoria implicită */
          }
        }
        await importSpvMessage(actor, m.id, category);
        imported++;
      } catch {
        failed++;
      }
    }
    revalidatePath("/efactura");
    revalidatePath("/cheltuieli");
    revalidatePath("/furnizori");
    revalidatePath("/", "layout");
    return { imported, failed };
  });
}

/* ------------------------------ Conexiune OAuth2 ------------------------------ */

const connectionSchema = z.object({
  environment: z.enum(ANAF_ENVIRONMENTS, { error: "Mediu invalid" }),
  clientId: z.string().trim().max(200).optional().nullable(),
  clientSecret: z.string().trim().max(400).optional().nullable(),
  redirectUri: z
    .union([z.url({ protocol: /^https?$/, error: "Redirect URI trebuie să fie un URL complet (http/https)" }), z.literal("")])
    .optional()
    .nullable(),
  autoSync: z.boolean().optional(),
});

export type ConnectionInput = z.input<typeof connectionSchema>;

async function saveConnection(companyId: string, input: ConnectionInput) {
  const d = connectionSchema.parse(input);
  const conn = await getConnection(companyId);
  const clientId = d.clientId || null;
  const values: Partial<typeof anafConnections.$inferInsert> = {
    environment: d.environment,
    clientId,
    redirectUri: d.redirectUri || null,
  };
  if (d.autoSync !== undefined) values.autoSync = d.autoSync;
  // Secretul se păstrează dacă nu a fost introdus unul nou; se șterge doar odată cu Client ID-ul.
  if (d.clientSecret) values.clientSecret = encryptSecret(d.clientSecret);
  else if (!clientId) values.clientSecret = null;
  // Schimbarea aplicației OAuth invalidează token-urile existente.
  if (conn.clientId && clientId !== conn.clientId) {
    Object.assign(values, { accessToken: null, refreshToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null, connectedAt: null });
  }
  await db.update(anafConnections).set(values).where(eq(anafConnections.id, conn.id));
  return d;
}

export async function saveConnectionAction(input: ConnectionInput) {
  return runAction(async () => {
    const ctx = await requirePermission("anaf");
    const d = await saveConnection(ctx.company.id, input);
    await logActivity(actorFrom(ctx), { entity: "anaf", action: "settings", message: `Setările conexiunii ANAF au fost actualizate (mediu: ${d.environment})` });
    revalidatePath("/efactura");
    revalidatePath("/efactura/conexiune");
    revalidatePath("/", "layout");
    return { environment: d.environment };
  }, "Setările conexiunii au fost salvate");
}

/** Pornește fluxul OAuth2: generează `state`, îl salvează și returnează URL-ul de autorizare ANAF. */
export async function startOauthAction(input?: ConnectionInput) {
  return runAction(async () => {
    const ctx = await requirePermission("anaf");
    if (input) await saveConnection(ctx.company.id, input);
    const conn = await getConnection(ctx.company.id);
    revalidatePath("/efactura/conexiune");
    if (conn.environment === "simulation") return { simulated: true as const, url: null };
    if (!conn.clientId || !conn.clientSecret) {
      throw new Error("Completează și salvează Client ID și Client Secret din aplicația înregistrată în SPV.");
    }
    const state = `${Date.now().toString(36)}.${randomBytes(24).toString("base64url")}`;
    await db.update(anafConnections).set({ oauthState: state }).where(eq(anafConnections.id, conn.id));
    return { simulated: false as const, url: buildAuthorizeUrl({ ...conn, oauthState: state }, state) };
  });
}

export async function refreshTokenAction() {
  return runAction(async () => {
    const ctx = await requirePermission("anaf");
    const conn = await getConnection(ctx.company.id);
    if (conn.environment === "simulation") throw new Error("În modul simulare nu există token-uri de reîmprospătat.");
    try {
      await refreshAccessToken(conn);
    } catch (err) {
      throw new Error(friendlyAnafError(err));
    }
    revalidatePath("/efactura");
    revalidatePath("/", "layout");
    return { ok: true };
  }, "Token-ul ANAF a fost reîmprospătat");
}

export async function disconnectAction() {
  return runAction(async () => {
    const ctx = await requirePermission("anaf");
    const conn = await getConnection(ctx.company.id);
    await db
      .update(anafConnections)
      .set({ accessToken: null, refreshToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null, connectedAt: null, oauthState: null })
      .where(eq(anafConnections.id, conn.id));
    await logActivity(actorFrom(ctx), { entity: "anaf", action: "disconnected", message: "Conexiunea OAuth ANAF a fost eliminată" });
    revalidatePath("/efactura");
    revalidatePath("/", "layout");
    return { ok: true };
  }, "Firma a fost deconectată de la ANAF");
}
