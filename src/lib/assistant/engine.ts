import "server-only";
import { format } from "date-fns";
import { ro } from "date-fns/locale";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import OpenAI from "openai";
import type {
  ResponseInputItem,
  ResponseOutputItem,
  ResponseStreamEvent,
  Tool,
} from "openai/resources/responses/responses";
import { DEFAULT_MODEL, FAST_MODEL, describeAiError, getOpenAI, supportsReasoning } from "@/lib/ai/openai";
import { ROLE_LABELS } from "@/lib/constants";
import { db } from "@/lib/db";
import { assistantConversations, assistantMessages, companies, mcpServers } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/server/crypto";
import { getAssistantSettings } from "./context";
import { executeTool, toolJsonSchema, toolsFor, type ToolCtx } from "./tools";

export type StreamEvent =
  | { type: "conversation"; id: string; title: string; isNew: boolean }
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "status"; label: string }
  | { type: "tool_start"; id: string; name: string; label: string; kind: "function" | "web_search" | "mcp" }
  | { type: "tool_end"; id: string; ok: boolean; summary?: string }
  | { type: "title"; title: string }
  | { type: "done"; usage: { input: number; output: number }; messageId: string | null; model: string }
  | { type: "error"; message: string };

const MAX_ITERATIONS = 10;

/** Helper-ul de stream adaugă câmpuri locale (`parsed_arguments`, `parsed`) pe care API-ul le respinge la reluare. */
function sanitizeItem<T>(item: T): T {
  if (!item || typeof item !== "object") return item;
  const { parsed_arguments: _a, ...rest } = item as Record<string, unknown>;
  if (Array.isArray(rest.content)) {
    rest.content = rest.content.map((c) => {
      if (!c || typeof c !== "object") return c;
      const { parsed: _p, ...part } = c as Record<string, unknown>;
      return part;
    });
  }
  return rest as T;
}

function instructions(ctx: ToolCtx, company: { name: string; cui: string }, custom: string | null, pathname: string | null) {
  const now = new Date();
  // Partea stabilă e prima (cache de prompt OpenAI), contextul variabil la final.
  return `Ești asistentul AI integrat în platforma „AND” (ANAF for Dummies): facturare (facturi, proforme, avize, storno, încasări), e-Factura/SPV ANAF, e-Transport, cheltuieli, stocuri, rapoarte și — pentru firme de outsourcing digital — proiecte, task-uri, pontaj, planificarea echipei și concedii.

Cum lucrezi:
- Răspunzi în limba utilizatorului (implicit română), concis și la obiect, ca un contabil și manager de proiect experimentat.
- Pentru orice informație despre firmă (facturi, încasări, cheltuieli, stocuri, clienți, ore, proiecte, echipă) folosești uneltele. Nu inventa și nu estima cifre care pot fi citite. Dacă o unealtă dă eroare, explică ce lipsește.
- Poți apela mai multe unelte în paralel. Pentru perioade relative („luna trecută”, „trimestrul ăsta”, „anul trecut”) calculează datele exacte pornind de la data de azi.
- Sume în format românesc (1.234,56 RON) cu moneda; rezultatele uneltelor marcate _ron sunt în lei.
- Pune linkuri markdown spre paginile aplicației folosind câmpul \`link\` din rezultate, de ex. [PXD0142](/facturi/…). Pentru 3+ elemente folosește tabele markdown compacte (maxim 4–5 coloane scurte; răspunsul se citește adesea într-un panou îngust). Evidențiază concluzia principală la început.
- Acțiuni: poți crea doar ciorne (factură ciornă, pontaj ciornă) și doar când utilizatorul o cere explicit; după creare oferă linkul de verificare. Nu pretinde că ai emis facturi, trimis în SPV, făcut plăți sau modificat alte date — acestea se fac din aplicație.
- Întrebări de legislație fiscală românească (TVA, e-Factura, termene ANAF): caută pe web dacă unealta e disponibilă și citează sursa; altfel spune că informația trebuie verificată.
- Ai acces doar la datele firmei curente, conform permisiunilor rolului utilizatorului.${custom ? `\n\nInstrucțiuni suplimentare de la administratorul firmei:\n${custom}` : ""}

Context curent:
- Firma: ${company.name} (CUI ${company.cui})
- Utilizator: ${ctx.userName}, rol ${ROLE_LABELS[ctx.role] ?? ctx.role}
- Data de azi: ${format(now, "yyyy-MM-dd")} (${format(now, "EEEE, d MMMM yyyy", { locale: ro })})${pathname ? `\n- Pagina deschisă în aplicație: ${pathname}` : ""}`;
}

function toolSummary(data: unknown): string | undefined {
  const n = (k: number) => (k === 1 ? "1 rezultat" : `${k} rezultate`);
  if (Array.isArray(data)) return n(data.length);
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (d.created) return "creat ca ciornă";
    if (typeof d.count === "number") return n(d.count);
    if (typeof d.total_count === "number") return n(d.total_count);
    if (d.found === false) return "nu a fost găsit";
  }
  return undefined;
}

async function generateTitle(text: string): Promise<string> {
  const fallback = text.replace(/\s+/g, " ").trim().slice(0, 60) || "Conversație nouă";
  try {
    const r = await getOpenAI().responses.create({
      model: FAST_MODEL,
      input: `Scrie un titlu scurt (maxim 6 cuvinte, fără ghilimele și fără punct final) pentru o conversație care începe cu mesajul:\n\n${text.slice(0, 800)}`,
      max_output_tokens: 400,
      store: false,
      ...(supportsReasoning(FAST_MODEL) ? { reasoning: { effort: "low" as const } } : {}),
    });
    const title = r.output_text.trim().replace(/^["„”']|["„”'.]$/g, "");
    return title ? title.slice(0, 80) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * O tură de conversație: încarcă istoricul, rulează bucla de unelte cu streaming (OpenAI Responses API)
 * și salvează itemii în istoric. Conversația e stateless la OpenAI (store: false) — istoricul e la noi,
 * iar raționamentul se reia criptat (`reasoning.encrypted_content`).
 */
export async function runAssistantTurn(opts: {
  ctx: ToolCtx;
  conversationId?: string | null;
  text: string;
  pathname?: string | null;
  signal: AbortSignal;
  emit: (e: StreamEvent) => void;
}) {
  const { ctx, emit, signal } = opts;
  const client = getOpenAI();
  const company = await db.query.companies.findFirst({ where: eq(companies.id, ctx.companyId) });
  if (!company) throw new Error("Firmă inexistentă.");

  // Conversația
  let conversation = opts.conversationId
    ? await db.query.assistantConversations.findFirst({
        where: and(eq(assistantConversations.id, opts.conversationId), eq(assistantConversations.userId, ctx.userId), eq(assistantConversations.companyId, ctx.companyId)),
      })
    : undefined;
  const isNew = !conversation;
  if (!conversation) {
    [conversation] = await db
      .insert(assistantConversations)
      .values({ companyId: ctx.companyId, userId: ctx.userId, title: opts.text.replace(/\s+/g, " ").slice(0, 60) })
      .returning();
  }
  emit({ type: "conversation", id: conversation.id, title: conversation.title, isNew });
  const titlePromise = isNew
    ? generateTitle(opts.text).then(async (title) => {
        await db.update(assistantConversations).set({ title }).where(eq(assistantConversations.id, conversation!.id));
        emit({ type: "title", title });
      })
    : Promise.resolve();

  // Istoricul (itemi Responses API, redați neschimbați)
  const rows = await db.query.assistantMessages.findMany({ where: eq(assistantMessages.conversationId, conversation.id), orderBy: asc(assistantMessages.seq) });
  const history = rows.flatMap((r) => (r.content as ResponseInputItem[]).map(sanitizeItem));
  let seq = (rows.at(-1)?.seq ?? 0) + 1;
  const userItem: ResponseInputItem = { type: "message", role: "user", content: opts.text };
  await db.insert(assistantMessages).values({ conversationId: conversation.id, seq: seq++, role: "user", content: [userItem] });

  // Unelte: funcțiile platformei + web search + servere MCP configurate
  const settings = await getAssistantSettings(ctx.companyId);
  const model = settings.model || DEFAULT_MODEL;
  const available = toolsFor(ctx.permissions);
  const tools: Tool[] = available.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: toolJsonSchema(t), strict: false }));
  if (settings.webSearch) tools.push({ type: "web_search" });
  const servers = await db.query.mcpServers.findMany({ where: and(eq(mcpServers.companyId, ctx.companyId), eq(mcpServers.enabled, true)) });
  for (const s of servers) {
    const token = decryptSecret(s.authorizationToken);
    tools.push({ type: "mcp", server_label: s.name, server_url: s.url, require_approval: "never", ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) });
  }
  const labels = new Map(available.map((t) => [t.name, t.label]));

  const input: ResponseInputItem[] = [...history, userItem];
  const turnItems: ResponseInputItem[] = [];
  const usage = { input: 0, output: 0 };
  let partialText = "";

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      partialText = "";
      const stream = client.responses.stream(
        {
          model,
          instructions: instructions(ctx, company, settings.instructions, opts.pathname ?? null),
          input,
          tools,
          parallel_tool_calls: true,
          store: false,
          include: ["reasoning.encrypted_content"],
          max_output_tokens: 16000,
          ...(supportsReasoning(model)
            ? { reasoning: { effort: settings.effort, ...(process.env.OPENAI_REASONING_SUMMARY ? { summary: "auto" as const } : {}) } }
            : {}),
        },
        { signal },
      );

      for await (const ev of stream as AsyncIterable<ResponseStreamEvent>) {
        switch (ev.type) {
          case "response.output_text.delta":
            partialText += ev.delta;
            emit({ type: "text", delta: ev.delta });
            break;
          case "response.reasoning_summary_text.delta":
            emit({ type: "reasoning", delta: ev.delta });
            break;
          case "response.output_item.added": {
            const item = ev.item;
            if (item.type === "function_call") emit({ type: "tool_start", id: item.call_id, name: item.name, label: labels.get(item.name) ?? item.name, kind: "function" });
            else if (item.type === "web_search_call") emit({ type: "tool_start", id: item.id, name: "web_search", label: "Caut pe web", kind: "web_search" });
            else if (item.type === "mcp_call") emit({ type: "tool_start", id: item.id, name: item.name, label: `${item.server_label} · ${item.name}`, kind: "mcp" });
            else if (item.type === "reasoning") emit({ type: "status", label: "Analizez întrebarea…" });
            break;
          }
          case "response.web_search_call.completed":
            emit({ type: "tool_end", id: ev.item_id, ok: true });
            break;
          case "response.mcp_call.completed":
            emit({ type: "tool_end", id: ev.item_id, ok: true });
            break;
          case "response.mcp_call.failed":
            emit({ type: "tool_end", id: ev.item_id, ok: false });
            break;
        }
      }

      const response = await stream.finalResponse();
      usage.input += response.usage?.input_tokens ?? 0;
      usage.output += response.usage?.output_tokens ?? 0;
      if (response.error) throw new Error(response.error.message);

      const output = (response.output as ResponseOutputItem[]).map(sanitizeItem);
      turnItems.push(...(output as ResponseInputItem[]));
      input.push(...(output as ResponseInputItem[]));
      partialText = "";

      const calls = output.filter((o): o is Extract<ResponseOutputItem, { type: "function_call" }> => o.type === "function_call");
      if (!calls.length) {
        if (response.status === "incomplete") {
          const reason = response.incomplete_details?.reason;
          emit({ type: "text", delta: reason === "max_output_tokens" ? "\n\n_(răspuns trunchiat — limita de lungime a fost atinsă)_" : "\n\n_(răspuns incomplet)_" });
        }
        break;
      }

      emit({ type: "status", label: "Citesc datele…" });
      const results = await Promise.all(
        calls.map(async (c) => {
          let args: unknown = {};
          let r: Awaited<ReturnType<typeof executeTool>>;
          try {
            args = c.arguments ? JSON.parse(c.arguments) : {};
            r = await executeTool(ctx, c.name, args);
          } catch {
            r = { ok: false, error: "Argumentele nu sunt JSON valid." };
          }
          emit({ type: "tool_end", id: c.call_id, ok: r.ok, summary: r.ok ? toolSummary(r.data) : r.error });
          const item: ResponseInputItem = { type: "function_call_output", call_id: c.call_id, output: JSON.stringify(r.ok ? r.data : { error: r.error }) };
          return item;
        }),
      );
      turnItems.push(...results);
      input.push(...results);
      if (i === MAX_ITERATIONS - 1) emit({ type: "text", delta: "\n\n_(am atins numărul maxim de pași pentru o întrebare — reformulează mai specific)_" });
    }
  } catch (err) {
    const aborted = err instanceof OpenAI.APIUserAbortError || signal.aborted;
    if (!aborted) emit({ type: "error", message: describeAiError(err, model) });
  } finally {
    // Textul parțial (oprit de utilizator) se păstrează în istoric ca mesaj simplu.
    if (partialText.trim()) turnItems.push({ type: "message", role: "assistant", content: partialText });
    let messageId: string | null = null;
    if (turnItems.length) {
      const [m] = await db.insert(assistantMessages).values({ conversationId: conversation.id, seq: seq++, role: "assistant", content: turnItems }).returning({ id: assistantMessages.id });
      messageId = m.id;
    }
    await db
      .update(assistantConversations)
      .set({
        inputTokens: sql`${assistantConversations.inputTokens} + ${usage.input}`,
        outputTokens: sql`${assistantConversations.outputTokens} + ${usage.output}`,
        updatedAt: new Date(),
      })
      .where(eq(assistantConversations.id, conversation.id));
    await titlePromise.catch(() => undefined);
    emit({ type: "done", usage, messageId, model });
  }
}

/* ------------------------------------------------------------------ */
/* Istoric pentru UI                                                   */
/* ------------------------------------------------------------------ */

export type UiPart =
  | { type: "text"; text: string }
  | { type: "tool"; id: string; name: string; label: string; kind: "function" | "web_search" | "mcp"; state: "done" | "error"; summary?: string };

export type UiMessage = { id: string; role: "user" | "assistant"; parts: UiPart[]; feedback?: number | null };

type AnyItem = { type?: string; role?: string; content?: unknown; [k: string]: unknown };

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c: { text?: string }) => c?.text ?? "").join("");
  return "";
}

/** Transformă itemii salvați în mesaje pentru interfață (text + cipuri de unelte). */
export function toUiMessages(rows: { id: string; role: "user" | "assistant"; content: unknown; feedback: number | null }[], labels: Map<string, string>): UiMessage[] {
  const out: UiMessage[] = [];
  for (const row of rows) {
    const items = row.content as AnyItem[];
    if (row.role === "user") {
      out.push({ id: row.id, role: "user", parts: [{ type: "text", text: items.map((i) => textOf(i.content)).join("\n") }] });
      continue;
    }
    const outputs = new Map(items.filter((i) => i.type === "function_call_output").map((i) => [i.call_id as string, String(i.output ?? "")]));
    const parts: UiPart[] = [];
    for (const i of items) {
      if (i.type === "message" && i.role === "assistant") {
        const text = textOf(i.content);
        if (text) parts.push({ type: "text", text });
      } else if (i.type === "function_call") {
        const res = outputs.get(i.call_id as string) ?? "";
        const isErr = res.startsWith('{"error"');
        parts.push({ type: "tool", id: i.call_id as string, name: i.name as string, label: labels.get(i.name as string) ?? (i.name as string), kind: "function", state: isErr ? "error" : "done" });
      } else if (i.type === "web_search_call") {
        parts.push({ type: "tool", id: i.id as string, name: "web_search", label: "Caut pe web", kind: "web_search", state: "done" });
      } else if (i.type === "mcp_call") {
        parts.push({ type: "tool", id: i.id as string, name: i.name as string, label: `${i.server_label} · ${i.name}`, kind: "mcp", state: i.error ? "error" : "done" });
      }
    }
    const prev = out.at(-1);
    if (prev?.role === "assistant") prev.parts.push(...parts);
    else out.push({ id: row.id, role: "assistant", parts, feedback: row.feedback });
  }
  return out;
}

export async function loadConversation(ctx: ToolCtx, id: string) {
  const conv = await db.query.assistantConversations.findFirst({
    where: and(eq(assistantConversations.id, id), eq(assistantConversations.userId, ctx.userId), eq(assistantConversations.companyId, ctx.companyId)),
  });
  if (!conv) return null;
  const rows = await db.query.assistantMessages.findMany({ where: eq(assistantMessages.conversationId, id), orderBy: asc(assistantMessages.seq) });
  const labels = new Map(toolsFor(ctx.permissions).map((t) => [t.name, t.label]));
  return { conversation: conv, messages: toUiMessages(rows, labels) };
}

export async function listConversations(ctx: ToolCtx, limit = 50) {
  return db.query.assistantConversations.findMany({
    where: and(eq(assistantConversations.userId, ctx.userId), eq(assistantConversations.companyId, ctx.companyId)),
    orderBy: [desc(assistantConversations.pinned), desc(assistantConversations.updatedAt)],
    limit,
    columns: { id: true, title: true, pinned: true, updatedAt: true, createdAt: true },
  });
}
