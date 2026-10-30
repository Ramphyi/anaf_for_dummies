"use client";

import * as React from "react";
import { getConversationAction, listConversationsAction } from "@/lib/assistant/actions";
import type { StreamEvent, UiMessage } from "@/lib/assistant/engine";

export type ChatPart =
  | { kind: "text"; full: string; shown: number }
  | { kind: "reasoning"; text: string }
  | { kind: "tool"; id: string; name: string; label: string; toolKind: "function" | "web_search" | "mcp"; state: "running" | "done" | "error"; summary?: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  parts: ChatPart[];
  streaming?: boolean;
  error?: string;
  messageId?: string | null; // id-ul din DB (pentru feedback)
  feedback?: number | null;
};

export type ConversationSummary = { id: string; title: string; pinned: boolean; updatedAt: Date; createdAt: Date };

const uid = () => Math.random().toString(36).slice(2, 10);

function fromUi(messages: UiMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    messageId: m.role === "assistant" ? m.id : null,
    feedback: m.feedback ?? null,
    parts: m.parts.map((p): ChatPart =>
      p.type === "text"
        ? { kind: "text", full: p.text, shown: p.text.length }
        : { kind: "tool", id: p.id, name: p.name, label: p.label, toolKind: p.kind, state: p.state, summary: p.summary },
    ),
  }));
}

/**
 * Starea conversației cu asistentul: trimitere cu streaming NDJSON, efect de „typing” (textul se dezvăluie
 * cu viteză adaptivă, indiferent de mărimea fragmentelor primite), oprire, istoric.
 */
export function useAssistantChat() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [streaming, setStreaming] = React.useState(false);
  const [conversations, setConversations] = React.useState<ConversationSummary[]>([]);
  const [loadingConversation, setLoadingConversation] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const messagesRef = React.useRef(messages);
  messagesRef.current = messages;

  // Typewriter: un singur rAF care avansează toate părțile text nerevelate complet.
  const rafRef = React.useRef<number | null>(null);
  const tick = React.useCallback(() => {
    rafRef.current = null;
    setMessages((prev) => {
      let changed = false;
      const next = prev.map((m) => {
        if (m.role !== "assistant") return m;
        let touched = false;
        const parts = m.parts.map((p) => {
          if (p.kind !== "text" || p.shown >= p.full.length) return p;
          const remaining = p.full.length - p.shown;
          const step = Math.max(1, Math.ceil(remaining / 10));
          touched = true;
          return { ...p, shown: Math.min(p.full.length, p.shown + step) };
        });
        if (!touched) return m;
        changed = true;
        return { ...m, parts };
      });
      return changed ? next : prev;
    });
    // Updater-ul de mai sus rulează abia la render, deci decidem din ultima stare randată (ref):
    // în cel mai rău caz mai facem un cadru în plus, dar animația nu se mai oprește înainte de final.
    const pending = messagesRef.current.some((m) => m.parts.some((p) => p.kind === "text" && p.shown < p.full.length));
    if (pending) rafRef.current = requestAnimationFrame(tick);
  }, []);
  const kick = React.useCallback(() => {
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
  }, [tick]);
  React.useEffect(() => () => (rafRef.current ? cancelAnimationFrame(rafRef.current) : undefined), []);

  const refreshConversations = React.useCallback(async () => {
    const r = await listConversationsAction();
    if (r.ok) setConversations(r.data as ConversationSummary[]);
  }, []);

  const updateAssistant = React.useCallback((id: string, fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const handleEvent = React.useCallback(
    (assistantId: string, e: StreamEvent) => {
      switch (e.type) {
        case "conversation":
          setConversationId(e.id);
          setTitle(e.title);
          if (e.isNew) setConversations((c) => [{ id: e.id, title: e.title, pinned: false, updatedAt: new Date(), createdAt: new Date() }, ...c]);
          break;
        case "title":
          setTitle(e.title);
          setConversations((c) => c.map((x, i) => (i === 0 ? { ...x, title: e.title } : x)));
          break;
        case "status":
          setStatus(e.label);
          break;
        case "text":
          setStatus(null);
          updateAssistant(assistantId, (m) => {
            const parts = [...m.parts];
            const last = parts.at(-1);
            if (last?.kind === "text") parts[parts.length - 1] = { ...last, full: last.full + e.delta };
            else parts.push({ kind: "text", full: e.delta, shown: 0 });
            return { ...m, parts };
          });
          kick();
          break;
        case "reasoning":
          updateAssistant(assistantId, (m) => {
            const parts = [...m.parts];
            const idx = parts.findIndex((p) => p.kind === "reasoning");
            if (idx >= 0) parts[idx] = { kind: "reasoning", text: (parts[idx] as { text: string }).text + e.delta };
            else parts.unshift({ kind: "reasoning", text: e.delta });
            return { ...m, parts };
          });
          break;
        case "tool_start":
          setStatus(e.label);
          updateAssistant(assistantId, (m) =>
            m.parts.some((p) => p.kind === "tool" && p.id === e.id)
              ? m
              : { ...m, parts: [...m.parts, { kind: "tool", id: e.id, name: e.name, label: e.label, toolKind: e.kind, state: "running" }] },
          );
          break;
        case "tool_end":
          updateAssistant(assistantId, (m) => ({
            ...m,
            parts: m.parts.map((p) => (p.kind === "tool" && p.id === e.id ? { ...p, state: e.ok ? "done" : "error", summary: e.summary } : p)),
          }));
          break;
        case "error":
          updateAssistant(assistantId, (m) => ({ ...m, error: e.message }));
          break;
        case "done":
          updateAssistant(assistantId, (m) => ({ ...m, messageId: e.messageId, streaming: false }));
          setConversations((c) => {
            const id = c[0]?.id;
            return id ? c.map((x) => (x.id === id ? { ...x, updatedAt: new Date() } : x)) : c;
          });
          break;
      }
    },
    [kick, updateAssistant],
  );

  const send = React.useCallback(
    async (text: string, pathname?: string) => {
      const message = text.trim();
      if (!message || streaming) return;
      const assistantId = uid();
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "user", parts: [{ kind: "text", full: message, shown: message.length }] },
        { id: assistantId, role: "assistant", parts: [], streaming: true },
      ]);
      setStreaming(true);
      setStatus("Mă gândesc…");
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, message, pathname }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `Eroare ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (line) handleEvent(assistantId, JSON.parse(line) as StreamEvent);
          }
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          updateAssistant(assistantId, (m) => ({ ...m, error: err instanceof Error ? err.message : "Eroare de rețea" }));
        }
      } finally {
        updateAssistant(assistantId, (m) => ({
          ...m,
          streaming: false,
          parts: m.parts.map((p) => (p.kind === "tool" && p.state === "running" ? { ...p, state: "done" } : p)),
        }));
        setStreaming(false);
        setStatus(null);
        abortRef.current = null;
      }
    },
    [conversationId, handleEvent, streaming, updateAssistant],
  );

  const stop = React.useCallback(() => abortRef.current?.abort(), []);

  const newChat = React.useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    setTitle(null);
    setStatus(null);
  }, []);

  const openConversation = React.useCallback(async (id: string) => {
    abortRef.current?.abort();
    setLoadingConversation(true);
    try {
      const r = await getConversationAction(id);
      if (r.ok) {
        setConversationId(id);
        setTitle(r.data.conversation.title);
        setMessages(fromUi(r.data.messages));
      }
    } finally {
      setLoadingConversation(false);
    }
  }, []);

  const removeConversationLocal = React.useCallback(
    (id: string) => {
      setConversations((c) => c.filter((x) => x.id !== id));
      if (id === conversationId) newChat();
    },
    [conversationId, newChat],
  );

  return {
    messages,
    setMessages,
    conversationId,
    title,
    setTitle,
    status,
    streaming,
    send,
    stop,
    newChat,
    openConversation,
    loadingConversation,
    conversations,
    setConversations,
    refreshConversations,
    removeConversationLocal,
  };
}

export type AssistantChat = ReturnType<typeof useAssistantChat>;
