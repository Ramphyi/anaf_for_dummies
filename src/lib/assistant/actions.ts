"use server";

import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_MODEL, getOpenAI, isAiConfigured } from "@/lib/ai/openai";
import { requireContext, requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { apiTokens, assistantConversations, assistantMessages, assistantSettings, mcpServers } from "@/lib/db/schema";
import { runAction } from "@/lib/server/action";
import { actorFrom, logActivity } from "@/lib/server/activity";
import { encryptSecret } from "@/lib/server/crypto";
import { generateApiToken, getAssistantSettings, toolCtxFromApp } from "./context";
import { listConversations, loadConversation } from "./engine";

/* ----------------------------- conversații ----------------------------- */

export async function listConversationsAction() {
  return runAction(async () => {
    const ctx = await requireContext();
    return listConversations(toolCtxFromApp(ctx), 100);
  });
}

export async function getConversationAction(id: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    const r = await loadConversation(toolCtxFromApp(ctx), id);
    if (!r) throw new Error("Conversația nu există.");
    return r;
  });
}

async function ownConversation(id: string) {
  const ctx = await requireContext();
  const conv = await db.query.assistantConversations.findFirst({
    where: and(eq(assistantConversations.id, id), eq(assistantConversations.userId, ctx.user.id), eq(assistantConversations.companyId, ctx.company.id)),
  });
  if (!conv) throw new Error("Conversația nu există.");
  return conv;
}

export async function renameConversationAction(id: string, title: string) {
  return runAction(async () => {
    await ownConversation(id);
    const t = z.string().trim().min(1).max(80).parse(title);
    await db.update(assistantConversations).set({ title: t }).where(eq(assistantConversations.id, id));
    return t;
  });
}

export async function togglePinConversationAction(id: string) {
  return runAction(async () => {
    const conv = await ownConversation(id);
    await db.update(assistantConversations).set({ pinned: !conv.pinned }).where(eq(assistantConversations.id, id));
    return !conv.pinned;
  });
}

export async function deleteConversationAction(id: string) {
  return runAction(async () => {
    await ownConversation(id);
    await db.delete(assistantMessages).where(eq(assistantMessages.conversationId, id));
    await db.delete(assistantConversations).where(eq(assistantConversations.id, id));
    return null;
  }, "Conversație ștearsă");
}

export async function deleteAllConversationsAction() {
  return runAction(async () => {
    const ctx = await requireContext();
    const convs = await db.query.assistantConversations.findMany({
      where: and(eq(assistantConversations.userId, ctx.user.id), eq(assistantConversations.companyId, ctx.company.id)),
      columns: { id: true },
    });
    for (const c of convs) await db.delete(assistantMessages).where(eq(assistantMessages.conversationId, c.id));
    await db.delete(assistantConversations).where(and(eq(assistantConversations.userId, ctx.user.id), eq(assistantConversations.companyId, ctx.company.id)));
    return convs.length;
  }, "Istoricul a fost șters");
}

export async function feedbackAction(messageId: string, value: 1 | -1 | null) {
  return runAction(async () => {
    const ctx = await requireContext();
    const msg = await db.query.assistantMessages.findFirst({ where: eq(assistantMessages.id, messageId) });
    if (!msg) throw new Error("Mesaj inexistent.");
    await ownConversation(msg.conversationId);
    await db.update(assistantMessages).set({ feedback: value }).where(eq(assistantMessages.id, messageId));
    void ctx;
    return value;
  });
}

/* ------------------------------- status ------------------------------- */

export async function getAssistantStatusAction() {
  return runAction(async () => {
    const ctx = await requireContext();
    const s = await getAssistantSettings(ctx.company.id);
    return { configured: isAiConfigured(), model: s.model || DEFAULT_MODEL, webSearch: s.webSearch };
  });
}

/* ------------------------------- setări (admin) ------------------------------- */

export async function getAssistantAdminAction() {
  return runAction(async () => {
    const ctx = await requireContext();
    const isAdmin = ctx.role === "owner" || ctx.role === "admin";
    const settings = await getAssistantSettings(ctx.company.id);
    const servers = isAdmin
      ? (await db.query.mcpServers.findMany({ where: eq(mcpServers.companyId, ctx.company.id) })).map(({ authorizationToken, ...s }) => ({ ...s, hasToken: !!authorizationToken }))
      : [];
    const tokens = await db.query.apiTokens.findMany({
      where: and(eq(apiTokens.companyId, ctx.company.id), eq(apiTokens.userId, ctx.user.id), isNull(apiTokens.revokedAt)),
      orderBy: desc(apiTokens.createdAt),
      columns: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
    });
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [usage] = await db
      .select({
        input: sql<number>`coalesce(sum(${assistantConversations.inputTokens}), 0)`,
        output: sql<number>`coalesce(sum(${assistantConversations.outputTokens}), 0)`,
        conversations: sql<number>`count(*)`,
      })
      .from(assistantConversations)
      .where(and(eq(assistantConversations.companyId, ctx.company.id), gte(assistantConversations.updatedAt, monthStart)));
    return {
      isAdmin,
      configured: isAiConfigured(),
      defaultModel: DEFAULT_MODEL,
      settings: { model: settings.model, webSearch: settings.webSearch, effort: settings.effort, instructions: settings.instructions },
      servers,
      tokens,
      usage,
      appUrl: process.env.APP_URL ?? "http://localhost:3000",
    };
  });
}

/** Modelele disponibile în contul OpenAI (pentru selectorul din setări). */
export async function listAvailableModelsAction() {
  return runAction(async () => {
    await requirePermission("settings");
    const ids: string[] = [];
    for await (const m of getOpenAI().models.list()) ids.push(m.id);
    return ids.filter((i) => /^(gpt-5|gpt-6|gpt-4\.1|o\d)/.test(i) && !/(audio|realtime|transcribe|tts|image|search|codex|deep-research|\d{4}-\d{2}-\d{2})/.test(i)).sort().reverse();
  });
}

const settingsSchema = z.object({
  model: z.string().trim().max(80).nullable(),
  webSearch: z.boolean(),
  effort: z.enum(["low", "medium", "high"]),
  instructions: z.string().trim().max(4000).nullable(),
});

export async function saveAssistantSettingsAction(input: z.input<typeof settingsSchema>) {
  return runAction(async () => {
    const ctx = await requirePermission("settings");
    const d = settingsSchema.parse(input);
    const values = { model: d.model || null, webSearch: d.webSearch, effort: d.effort, instructions: d.instructions || null };
    await db
      .insert(assistantSettings)
      .values({ companyId: ctx.company.id, ...values })
      .onConflictDoUpdate({ target: assistantSettings.companyId, set: values });
    await logActivity(actorFrom(ctx), { entity: "assistant", action: "settings", message: "Setările asistentului AI au fost actualizate" });
    revalidatePath("/asistent");
    return null;
  }, "Setările asistentului au fost salvate");
}

/* ------------------------------- conectori MCP ------------------------------- */

const serverSchema = z.object({
  id: z.string().nullish(),
  name: z.string().trim().regex(/^[a-z0-9_-]{2,40}$/, "Folosește doar litere mici, cifre, „-” și „_” (2–40 caractere)"),
  url: z.url("URL invalid").refine((u) => u.startsWith("https://"), "Serverul MCP trebuie să fie accesibil public prin HTTPS (OpenAI îl apelează direct)"),
  token: z.string().trim().max(2000).nullish(),
  enabled: z.boolean(),
});

export async function saveMcpServerAction(input: z.input<typeof serverSchema>) {
  return runAction(async () => {
    const ctx = await requirePermission("settings");
    const d = serverSchema.parse(input);
    const dup = await db.query.mcpServers.findFirst({ where: and(eq(mcpServers.companyId, ctx.company.id), eq(mcpServers.name, d.name)) });
    if (dup && dup.id !== d.id) throw new Error(`Există deja un conector numit „${d.name}”.`);
    const values = { name: d.name, url: d.url, enabled: d.enabled, ...(d.token ? { authorizationToken: encryptSecret(d.token) } : {}) };
    if (d.id) await db.update(mcpServers).set(values).where(and(eq(mcpServers.id, d.id), eq(mcpServers.companyId, ctx.company.id)));
    else await db.insert(mcpServers).values({ companyId: ctx.company.id, ...values });
    await logActivity(actorFrom(ctx), { entity: "assistant", action: "mcp", message: `Conector MCP „${d.name}” ${d.id ? "actualizat" : "adăugat"}` });
    return null;
  }, "Conector MCP salvat");
}

export async function deleteMcpServerAction(id: string) {
  return runAction(async () => {
    const ctx = await requirePermission("settings");
    await db.delete(mcpServers).where(and(eq(mcpServers.id, id), eq(mcpServers.companyId, ctx.company.id)));
    return null;
  }, "Conector șters");
}

/** Verifică dacă un server MCP răspunde la `initialize`. */
export async function testMcpServerAction(input: { url: string; token?: string | null }) {
  return runAction(async () => {
    await requirePermission("settings");
    const res = await fetch(input.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "anaf-for-dummies", version: "1.0.0" } } }),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Serverul a răspuns cu ${res.status}: ${text.slice(0, 200)}`);
    const name = text.match(/"name"\s*:\s*"([^"]+)"/)?.[1];
    return { ok: true, server: name ?? "necunoscut" };
  });
}

/* ------------------------------- chei API (server MCP AND) ------------------------------- */

export async function createApiTokenAction(name: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    const n = z.string().trim().min(2, "Dă un nume cheii (ex. „Claude Desktop”)").max(60).parse(name);
    const { token, hash, prefix } = generateApiToken();
    await db.insert(apiTokens).values({ companyId: ctx.company.id, userId: ctx.user.id, name: n, tokenHash: hash, prefix });
    await logActivity(actorFrom(ctx), { entity: "assistant", action: "token", message: `Cheie API „${n}” creată pentru serverul MCP` });
    return { token };
  }, "Cheie creată — copiaz-o acum, nu va mai fi afișată");
}

export async function revokeApiTokenAction(id: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    await db
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, ctx.user.id), eq(apiTokens.companyId, ctx.company.id)));
    return null;
  }, "Cheie revocată");
}
