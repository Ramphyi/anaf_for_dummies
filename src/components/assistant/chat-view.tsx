"use client";

import {
  AlertCircle,
  ArrowUp,
  Check,
  Copy,
  Globe,
  Loader2,
  Plug,
  Square,
  ThumbsDown,
  ThumbsUp,
  Wrench,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";
import * as React from "react";
import { feedbackAction } from "@/lib/assistant/actions";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";
import { AssistantOrb } from "./orb";
import type { AssistantChat, ChatMessage, ChatPart } from "./use-assistant-chat";

const EASE = [0.16, 1, 0.3, 1] as const;

export type Suggestion = { label: string; prompt: string; icon: string };

/* ------------------------------ părți de mesaj ------------------------------ */

function ToolChip({ part }: { part: Extract<ChatPart, { kind: "tool" }> }) {
  const Icon = part.toolKind === "web_search" ? Globe : part.toolKind === "mcp" ? Plug : Wrench;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: EASE }}
      className={cn(
        "relative inline-flex max-w-full items-center gap-2 overflow-hidden rounded-full border px-2.5 py-1 text-xs",
        part.state === "error" ? "border-danger/30 bg-danger-soft text-danger-soft-foreground" : "border-border bg-subtle text-muted-foreground",
      )}
    >
      {part.state === "running" && (
        <motion.span
          className="absolute inset-0 bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--primary)_14%,transparent),transparent)]"
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
        />
      )}
      <span className="relative grid size-4 place-items-center">
        <AnimatePresence mode="wait" initial={false}>
          {part.state === "running" ? (
            <motion.span key="run" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Loader2 className="size-3.5 animate-spin text-primary" />
            </motion.span>
          ) : part.state === "error" ? (
            <motion.span key="err" initial={{ scale: 0 }} animate={{ scale: 1 }}>
              <X className="size-3.5" />
            </motion.span>
          ) : (
            <motion.span key="ok" initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", bounce: 0.5 }}>
              <Check className="size-3.5 text-success" />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <Icon className="relative size-3 shrink-0 opacity-60" />
      <span className="relative truncate font-medium">{part.label}</span>
      {part.summary && <span className="relative truncate opacity-70">· {part.summary}</span>}
    </motion.div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-primary"
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}

function Caret() {
  return <motion.span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] rounded-full bg-primary" animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.9, repeat: Infinity }} />;
}

function AssistantMessage({ m, status, onNavigate }: { m: ChatMessage; status: string | null; onNavigate?: () => void }) {
  const [copied, setCopied] = React.useState(false);
  const [feedback, setFeedback] = React.useState(m.feedback ?? null);
  const text = m.parts.filter((p) => p.kind === "text").map((p) => (p as { full: string }).full).join("\n\n");
  const revealing = m.parts.some((p) => p.kind === "text" && p.shown < p.full.length);
  const typing = m.streaming || revealing;
  const lastTextIdx = m.parts.map((p) => p.kind).lastIndexOf("text");
  const waiting = m.streaming && (m.parts.length === 0 || m.parts.at(-1)?.kind === "tool");

  const rate = async (v: 1 | -1) => {
    if (!m.messageId) return;
    const next = feedback === v ? null : v;
    setFeedback(next);
    await feedbackAction(m.messageId, next);
  };

  return (
    <div className="group flex gap-3">
      <AssistantOrb size={28} active={m.streaming} className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-2">
        {m.parts.map((p, i) => {
          if (p.kind === "tool") return <ToolChip key={p.id} part={p} />;
          if (p.kind === "reasoning")
            return (
              <details key={`r${i}`} className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">Raționament</summary>
                <p className="mt-1 whitespace-pre-wrap">{p.text}</p>
              </details>
            );
          // În timpul animației închidem temporar un `**` nepereche, ca bold-ul să nu apară „brut”.
          const visible = p.full.slice(0, p.shown);
          const text = p.shown < p.full.length && (visible.match(/\*\*/g)?.length ?? 0) % 2 === 1 ? `${visible}**` : visible;
          return (
            <div key={`t${i}`} className="relative">
              <Markdown text={text} onNavigate={onNavigate} />
              {typing && i === lastTextIdx && !waiting && <Caret />}
            </div>
          );
        })}
        <AnimatePresence>
          {waiting && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <TypingDots />
              <motion.span key={status} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} className="bg-[linear-gradient(90deg,var(--muted-foreground),var(--foreground),var(--muted-foreground))] bg-[length:200%_100%] bg-clip-text text-transparent [animation:shimmer_2s_linear_infinite]">
                {status ?? "Mă gândesc…"}
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>
        {m.error && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger-soft-foreground">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" /> {m.error}
          </motion.div>
        )}
        {!typing && text && (
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button
              onClick={() => {
                navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Copiază"
            >
              {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
            </button>
            {m.messageId && (
              <>
                <button onClick={() => rate(1)} className={cn("rounded-md p-1.5 hover:bg-muted", feedback === 1 ? "text-success" : "text-muted-foreground hover:text-foreground")} aria-label="Răspuns util">
                  <ThumbsUp className="size-3.5" />
                </button>
                <button onClick={() => rate(-1)} className={cn("rounded-md p-1.5 hover:bg-muted", feedback === -1 ? "text-danger" : "text-muted-foreground hover:text-foreground")} aria-label="Răspuns greșit">
                  <ThumbsDown className="size-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ vizualizarea chatului ------------------------------ */

export function ChatView({
  chat,
  userName,
  suggestions,
  onNavigate,
  configured,
  compact,
}: {
  chat: AssistantChat;
  userName: string;
  suggestions: Suggestion[];
  onNavigate?: () => void;
  configured: boolean;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const [input, setInput] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const stick = React.useRef(true);

  // Auto-scroll cât timp utilizatorul e la final.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chat.messages]);

  React.useEffect(() => {
    const t = textareaRef.current;
    if (!t) return;
    t.style.height = "0px";
    t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
  }, [input]);

  React.useEffect(() => {
    textareaRef.current?.focus();
  }, [chat.conversationId]);

  const submit = (text = input) => {
    if (!text.trim() || chat.streaming || !configured) return;
    stick.current = true;
    chat.send(text, pathname);
    setInput("");
  };

  const empty = chat.messages.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        className={cn("scrollbar-thin min-h-0 flex-1 overflow-y-auto", compact ? "px-4 py-4" : "px-6 py-6")}
      >
        {chat.loadingConversation ? (
          <div className="grid h-full place-items-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : empty ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", bounce: 0.45, duration: 0.8 }} className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/40 blur-2xl" />
              <AssistantOrb size={compact ? 56 : 72} />
            </motion.div>
            <motion.h3 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5, ease: EASE }} className="mt-5 text-lg font-semibold tracking-tight">
              Salut, {userName.split(" ")[0]}! Cu ce te ajut?
            </motion.h3>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="mt-1 max-w-sm text-sm text-muted-foreground">
              Întreabă-mă despre facturi, încasări, cheltuieli, stocuri, e-Factura, proiecte sau echipă — răspund din datele firmei.
            </motion.p>
            {configured ? (
              <div className={cn("mt-6 grid w-full gap-2", compact ? "max-w-sm" : "max-w-xl sm:grid-cols-2")}>
                {suggestions.map((s, i) => (
                  <motion.button
                    key={s.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.06, duration: 0.45, ease: EASE }}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => submit(s.prompt)}
                    className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-left text-[13px] shadow-soft transition-colors hover:border-primary/40 hover:bg-primary-soft/40"
                  >
                    <span className="text-base">{s.icon}</span>
                    <span className="text-foreground/90">{s.label}</span>
                  </motion.button>
                ))}
              </div>
            ) : (
              <div className="mt-6 max-w-sm rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-left text-sm text-warning-soft-foreground">
                Asistentul nu este configurat. Adaugă <code className="font-mono">OPENAI_API_KEY</code> în <code className="font-mono">.env.local</code> și repornește aplicația.
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {chat.messages.map((m) =>
              m.role === "user" ? (
                <motion.div key={m.id} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35, ease: EASE }} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[linear-gradient(135deg,var(--primary),color-mix(in_oklab,var(--primary)_70%,var(--accent)))] px-3.5 py-2 text-[13.5px] whitespace-pre-wrap text-primary-foreground shadow-glow">
                    {(m.parts[0] as { full: string })?.full}
                  </div>
                </motion.div>
              ) : (
                <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}>
                  <AssistantMessage m={m} status={chat.status} onNavigate={onNavigate} />
                </motion.div>
              ),
            )}
          </div>
        )}
      </div>

      <div className={cn("border-t border-border bg-card/60 backdrop-blur", compact ? "p-3" : "p-4")}>
        <div className="relative flex items-end gap-2 rounded-2xl border border-input bg-card p-1.5 shadow-soft transition-[border-color,box-shadow] focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            disabled={!configured}
            placeholder={configured ? "Întreabă orice despre firma ta…" : "Asistentul nu este configurat"}
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2.5 py-2 text-[13.5px] outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
          />
          <AnimatePresence mode="wait" initial={false}>
            {chat.streaming ? (
              <motion.button
                key="stop"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                onClick={chat.stop}
                className="grid size-9 shrink-0 place-items-center rounded-xl bg-foreground text-background transition-transform active:scale-95"
                aria-label="Oprește"
              >
                <Square className="size-3.5 fill-current" />
              </motion.button>
            ) : (
              <motion.button
                key="send"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                onClick={() => submit()}
                disabled={!input.trim() || !configured}
                className="grid size-9 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,var(--primary),var(--accent))] text-white shadow-glow transition-[transform,opacity] active:scale-95 disabled:opacity-40 disabled:shadow-none"
                aria-label="Trimite"
              >
                <ArrowUp className="size-4" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        <p className="mt-1.5 px-1 text-center text-[10.5px] text-muted-foreground">
          Enter trimite · Shift+Enter rând nou · AI poate greși, verifică cifrele importante
        </p>
      </div>
    </div>
  );
}
