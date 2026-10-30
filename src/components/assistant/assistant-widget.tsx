"use client";

import { ArrowLeft, ExternalLink, History, Maximize2, Minimize2, SquarePen, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Tooltip } from "@/components/ui/popover";
import { Kbd } from "@/components/ui/misc";
import type { Permission } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { ChatView, type Suggestion } from "./chat-view";
import { HistoryList } from "./history-list";
import { AssistantOrb } from "./orb";
import { useAssistantChat, type AssistantChat } from "./use-assistant-chat";

type Ctx = { open: boolean; setOpen: (o: boolean) => void; toggle: () => void; ask: (prompt: string) => void; chat: AssistantChat };
const AssistantContext = React.createContext<Ctx | null>(null);

export function useAssistant() {
  const ctx = React.useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant trebuie folosit în <AssistantProvider>");
  return ctx;
}

export function suggestionsFor(permissions: Permission[]): Suggestion[] {
  const s: Suggestion[] = [];
  if (permissions.includes("reports")) s.push({ icon: "📊", label: "Cum stăm luna aceasta?", prompt: "Fă-mi un rezumat financiar al lunii curente comparat cu luna trecută: venituri, încasări, cheltuieli, profit și TVA." });
  if (permissions.includes("billing")) s.push({ icon: "💸", label: "Ce facturi sunt restante?", prompt: "Care sunt facturile restante, grupate pe client, și cât am de încasat în total?" });
  if (permissions.includes("anaf")) s.push({ icon: "🛡️", label: "Probleme în e-Factura?", prompt: "Am facturi respinse sau netrimise în e-Factura? Ce trebuie corectat și ce mesaje noi am în SPV?" });
  if (permissions.includes("projects.manage")) s.push({ icon: "👥", label: "Cine e supraalocat?", prompt: "Cine din echipă e supraalocat sau are capacitate liberă în următoarele două săptămâni?" });
  s.push({ icon: "📁", label: "Proiecte aproape de buget", prompt: "Care proiecte active sunt aproape de depășirea bugetului de ore? Arată-mi și orele pe membri." });
  if (permissions.includes("timesheet.own")) s.push({ icon: "⏱️", label: "Orele mele săptămâna asta", prompt: "Câte ore am pontat săptămâna aceasta, pe proiecte, și ce task-uri am deschise?" });
  s.push({ icon: "💱", label: "Cursul BNR de azi", prompt: "Care e cursul BNR de azi pentru EUR, USD și GBP?" });
  return s.slice(0, 6);
}

export function AssistantProvider({
  children,
  user,
  permissions,
  configured,
}: {
  children: React.ReactNode;
  user: { name: string };
  permissions: Permission[];
  configured: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const chat = useAssistantChat();
  const pathname = usePathname();
  const toggle = React.useCallback(() => setOpen((o) => !o), []);
  const ask = React.useCallback(
    (prompt: string) => {
      setOpen(true);
      chat.send(prompt, pathname);
    },
    [chat, pathname],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = React.useMemo(() => ({ open, setOpen, toggle, ask, chat }), [open, toggle, ask, chat]);
  // Pe pagina dedicată nu afișăm și widget-ul.
  const onAssistantPage = pathname.startsWith("/asistent");

  return (
    <AssistantContext.Provider value={value}>
      {children}
      {!onAssistantPage && <AssistantWidget user={user} permissions={permissions} configured={configured} />}
    </AssistantContext.Provider>
  );
}

function AssistantWidget({ user, permissions, configured }: { user: { name: string }; permissions: Permission[]; configured: boolean }) {
  const { open, setOpen, chat } = useAssistant();
  const [view, setView] = React.useState<"chat" | "history">("chat");
  const [expanded, setExpanded] = React.useState(false);
  const suggestions = React.useMemo(() => suggestionsFor(permissions), [permissions]);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.85, y: 24, filter: "blur(8px)" }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.9, y: 16, filter: "blur(6px)" }}
            transition={{ type: "spring", bounce: 0.18, duration: 0.5 }}
            style={{ transformOrigin: "bottom right" }}
            className={cn(
              "fixed z-50 flex flex-col overflow-hidden border-border bg-popover/95 shadow-[0_24px_80px_-12px_rgb(0_0_0/0.35)] backdrop-blur-xl",
              "inset-0 sm:inset-auto sm:right-5 sm:bottom-24 sm:rounded-3xl sm:border",
              expanded ? "sm:h-[calc(100dvh-8rem)] sm:w-[min(880px,calc(100vw-2.5rem))]" : "sm:h-[min(680px,calc(100dvh-8rem))] sm:w-[min(440px,calc(100vw-2.5rem))]",
            )}
          >
            <div className="pointer-events-none absolute -top-24 -right-24 size-56 rounded-full bg-primary/20 blur-3xl" />
            <div className="pointer-events-none absolute -top-16 left-10 size-40 rounded-full bg-accent/15 blur-3xl" />

            <div className="relative flex items-center gap-3 border-b border-border px-4 py-3">
              {view === "history" ? (
                <button onClick={() => setView("chat")} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                  <ArrowLeft className="size-4" />
                </button>
              ) : (
                <AssistantOrb size={32} active={chat.streaming} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  {view === "history" ? "Istoric conversații" : "Asistent AI"}
                  {view === "chat" && (
                    <span className="rounded-full bg-success-soft px-1.5 py-px text-[10px] font-medium text-success-soft-foreground">{configured ? "online" : "neconfigurat"}</span>
                  )}
                </div>
                {view === "chat" && (
                  <AnimatePresence mode="wait">
                    <motion.div key={chat.title ?? "new"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="truncate text-xs text-muted-foreground">
                      {chat.title ?? "Conversație nouă"}
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
              <div className="flex items-center gap-0.5">
                <Tooltip content="Conversație nouă">
                  <button
                    onClick={() => {
                      chat.newChat();
                      setView("chat");
                    }}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <SquarePen className="size-4" />
                  </button>
                </Tooltip>
                <Tooltip content="Istoric">
                  <button onClick={() => setView((v) => (v === "history" ? "chat" : "history"))} className={cn("rounded-lg p-1.5 transition-colors hover:bg-muted hover:text-foreground", view === "history" ? "text-primary" : "text-muted-foreground")}>
                    <History className="size-4" />
                  </button>
                </Tooltip>
                <Tooltip content={expanded ? "Micșorează" : "Mărește"}>
                  <button onClick={() => setExpanded((e) => !e)} className="hidden rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:block">
                    {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                  </button>
                </Tooltip>
                <Tooltip content="Deschide pagina asistentului">
                  <Link href={chat.conversationId ? `/asistent?c=${chat.conversationId}` : "/asistent"} onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                    <ExternalLink className="size-4" />
                  </Link>
                </Tooltip>
                <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:hidden">
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="relative flex min-h-0 flex-1 flex-col">
              <AnimatePresence mode="wait" initial={false}>
                {view === "chat" ? (
                  <motion.div key="chat" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22 }} className="flex min-h-0 flex-1 flex-col">
                    <ChatView chat={chat} userName={user.name} suggestions={suggestions} configured={configured} compact={!expanded} onNavigate={() => !expanded && window.innerWidth < 640 && setOpen(false)} />
                  </motion.div>
                ) : (
                  <motion.div key="history" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.22 }} className="flex min-h-0 flex-1 flex-col">
                    <HistoryList chat={chat} onOpen={() => setView("chat")} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Launcher open={open} onClick={() => setOpen(!open)} busy={chat.streaming} />
    </>
  );
}

function Launcher({ open, onClick, busy }: { open: boolean; onClick: () => void; busy: boolean }) {
  const [hover, setHover] = React.useState(false);
  return (
    <motion.button
      onClick={onClick}
      onHoverStart={() => setHover(true)}
      onHoverEnd={() => setHover(false)}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", bounce: 0.5, delay: 0.6 }}
      whileTap={{ scale: 0.92 }}
      aria-label={open ? "Închide asistentul" : "Deschide asistentul AI"}
      // Pe mobil asistentul se deschide din topbar, ca bula să nu acopere barele fixe ale paginilor.
      className="group fixed right-5 bottom-5 z-50 flex h-14 items-center rounded-full p-0 shadow-[0_10px_40px_-6px_color-mix(in_oklab,var(--primary)_70%,transparent)] max-sm:hidden"
    >
      <span className="absolute inset-0 animate-ping rounded-full bg-primary/25 [animation-duration:2.6s]" />
      <motion.span
        layout
        className="relative flex h-14 items-center gap-2.5 overflow-hidden rounded-full bg-[linear-gradient(135deg,var(--primary),var(--accent))] pr-1.5 pl-1.5 text-white"
        transition={{ type: "spring", bounce: 0.25, duration: 0.45 }}
      >
        <span className="grid size-11 place-items-center">
          <AnimatePresence mode="wait" initial={false}>
            {open ? (
              <motion.span key="x" initial={{ rotate: -90, scale: 0.5, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} exit={{ rotate: 90, scale: 0.5, opacity: 0 }} transition={{ duration: 0.25 }}>
                <X className="size-6" />
              </motion.span>
            ) : (
              <motion.span key="orb" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.25 }}>
                <AssistantOrb size={40} active={busy} />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        <AnimatePresence>
          {hover && !open && (
            <motion.span
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-2 overflow-hidden pr-3 text-sm font-medium whitespace-nowrap"
            >
              Întreabă Asistent AI
              <Kbd className="border-white/30 bg-white/15 text-white shadow-none">⌘J</Kbd>
            </motion.span>
          )}
        </AnimatePresence>
      </motion.span>
    </motion.button>
  );
}
