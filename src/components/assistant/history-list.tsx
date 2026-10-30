"use client";

import { isToday, isYesterday, subDays } from "date-fns";
import { Check, MessageSquare, Pencil, Pin, PinOff, Search, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { toast } from "sonner";
import { deleteConversationAction, renameConversationAction, togglePinConversationAction } from "@/lib/assistant/actions";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AssistantChat, ConversationSummary } from "./use-assistant-chat";

function groupOf(c: ConversationSummary) {
  if (c.pinned) return "Fixate";
  const d = new Date(c.updatedAt);
  if (isToday(d)) return "Azi";
  if (isYesterday(d)) return "Ieri";
  if (d > subDays(new Date(), 7)) return "Ultimele 7 zile";
  return "Mai vechi";
}

const ORDER = ["Fixate", "Azi", "Ieri", "Ultimele 7 zile", "Mai vechi"];

export function HistoryList({ chat, onOpen, className }: { chat: AssistantChat; onOpen?: () => void; className?: string }) {
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const { refreshConversations } = chat;

  React.useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  const filtered = chat.conversations.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()));
  const groups = ORDER.map((g) => ({ g, items: filtered.filter((c) => groupOf(c) === g) })).filter((x) => x.items.length);

  const rename = async (id: string) => {
    const r = await renameConversationAction(id, draft);
    if (r.ok) {
      chat.setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, title: r.data } : c)));
      if (chat.conversationId === id) chat.setTitle(r.data);
    } else toast.error(r.error);
    setEditing(null);
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Caută în conversații…"
            className="h-9 w-full rounded-lg border border-input bg-card pr-3 pl-9 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
        </div>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {!groups.length && (
          <div className="flex flex-col items-center px-6 py-12 text-center text-sm text-muted-foreground">
            <MessageSquare className="mb-2 size-6 opacity-50" />
            {query ? "Nicio conversație găsită." : "Nu ai încă nicio conversație."}
          </div>
        )}
        {groups.map(({ g, items }) => (
          <div key={g} className="mb-2">
            <div className="px-2.5 pt-2 pb-1 text-[10.5px] font-semibold tracking-wider text-muted-foreground/80 uppercase">{g}</div>
            <AnimatePresence initial={false}>
              {items.map((c) => (
                <motion.div
                  key={c.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className={cn(
                    "group relative flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
                    chat.conversationId === c.id ? "bg-primary-soft text-primary-soft-foreground" : "hover:bg-muted",
                  )}
                >
                  {editing === c.id ? (
                    <form
                      className="flex flex-1 items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        rename(c.id);
                      }}
                    >
                      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="h-7 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-primary" />
                      <button type="submit" className="rounded p-1 text-success hover:bg-muted">
                        <Check className="size-3.5" />
                      </button>
                      <button type="button" onClick={() => setEditing(null)} className="rounded p-1 text-muted-foreground hover:bg-muted">
                        <X className="size-3.5" />
                      </button>
                    </form>
                  ) : (
                    <>
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          chat.openConversation(c.id);
                          onOpen?.();
                        }}
                      >
                        <div className="truncate font-medium">{c.title}</div>
                        <div className="text-[11px] text-muted-foreground">{formatRelative(c.updatedAt)}</div>
                      </button>
                      <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          title={c.pinned ? "Desprinde" : "Fixează"}
                          onClick={async () => {
                            const r = await togglePinConversationAction(c.id);
                            if (r.ok) chat.setConversations((cs) => cs.map((x) => (x.id === c.id ? { ...x, pinned: r.data } : x)));
                          }}
                          className="rounded p-1 text-muted-foreground hover:bg-card hover:text-foreground"
                        >
                          {c.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                        </button>
                        <button
                          title="Redenumește"
                          onClick={() => {
                            setEditing(c.id);
                            setDraft(c.title);
                          }}
                          className="rounded p-1 text-muted-foreground hover:bg-card hover:text-foreground"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          title="Șterge"
                          onClick={async () => {
                            const r = await deleteConversationAction(c.id);
                            if (r.ok) chat.removeConversationLocal(c.id);
                            else toast.error(r.error);
                          }}
                          className="rounded p-1 text-muted-foreground hover:bg-card hover:text-danger"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}
