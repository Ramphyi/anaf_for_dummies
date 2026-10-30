"use client";

import { ChevronRight, CircleCheck, CircleX, ScrollText } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { CopyButton } from "@/components/anaf/copy-button";
import { ANAF_LOG_ACTIONS, prettyXml } from "@/components/anaf/utils";
import { EASE_OUT } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page";
import { Segmented } from "@/components/ui/tabs";
import type { Tone } from "@/lib/constants";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LogRow } from "./types";

const ENV_TONE: Record<string, Tone> = { simulation: "brand", test: "warning", prod: "success", public: "info" };
const ENV_SHORT: Record<string, string> = { simulation: "Simulare", test: "Test", prod: "Producție", public: "Public" };
const PAGE = 40;

function pretty(text: string | null) {
  if (!text) return "—";
  const t = text.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      return JSON.stringify(JSON.parse(t), null, 2);
    } catch {
      return t;
    }
  }
  if (t.startsWith("<")) {
    try {
      return prettyXml(t);
    } catch {
      return t;
    }
  }
  return t;
}

function Payload({ title, text, note }: { title: string; text: string | null; note?: string }) {
  const value = pretty(text);
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</span>
        {text && <CopyButton value={value} tooltip={`Copiază ${title.toLowerCase()}`} toastMessage={null} />}
      </div>
      <pre className="scrollbar-thin max-h-72 overflow-auto rounded-lg border border-border bg-subtle p-3 font-mono text-[11.5px] leading-relaxed break-all whitespace-pre-wrap">{value}</pre>
      {note && <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}

function LogItem({ log, open, onToggle }: { log: LogRow; open: boolean; onToggle: () => void }) {
  return (
    <li className="border-b border-border/60 last:border-0">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:px-5">
        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-90")} />
        {log.success ? <CircleCheck className="size-[18px] shrink-0 text-success" /> : <CircleX className="size-[18px] shrink-0 text-danger" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{ANAF_LOG_ACTIONS[log.action] ?? log.action}</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">{log.request ?? "—"}</p>
        </div>
        <Badge tone={ENV_TONE[log.environment] ?? "neutral"} className="hidden sm:inline-flex">
          {ENV_SHORT[log.environment] ?? log.environment}
        </Badge>
        <span className={cn("hidden w-16 text-right text-xs tabular md:block", (log.durationMs ?? 0) > 5000 ? "text-warning" : "text-muted-foreground")}>
          {log.durationMs !== null ? `${log.durationMs.toLocaleString("ro-RO")} ms` : "—"}
        </span>
        <span className="w-24 shrink-0 text-right text-xs text-muted-foreground sm:w-32" title={formatDateTime(log.createdAt)} suppressHydrationWarning>
          {formatRelative(log.createdAt)}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="grid gap-4 px-4 pb-4 sm:px-5 lg:grid-cols-2">
              <Payload title="Cerere" text={log.request} />
              <Payload title="Răspuns" text={log.response} note={log.truncated ? "Răspuns trunchiat pentru afișare." : undefined} />
              <p className="text-[11px] text-muted-foreground lg:col-span-2">
                {formatDateTime(log.createdAt)} · mediu {ENV_SHORT[log.environment] ?? log.environment} · durată {log.durationMs ?? "—"} ms
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export function LogsTab({ rows }: { rows: LogRow[] }) {
  const [filter, setFilter] = React.useState<"all" | "ok" | "fail">("all");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [limit, setLimit] = React.useState(PAGE);
  const filtered = rows.filter((l) => (filter === "ok" ? l.success : filter === "fail" ? !l.success : true));
  const failed = rows.filter((l) => !l.success).length;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <p className="font-semibold">Jurnalul apelurilor ANAF</p>
          <p className="text-[13px] text-muted-foreground">Ultimele {rows.length} cereri către serviciile ANAF (token-urile sunt mascate).</p>
        </div>
        <Segmented
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setLimit(PAGE);
          }}
          size="sm"
          options={[
            { value: "all", label: "Toate" },
            { value: "ok", label: "Reușite" },
            { value: "fail", label: `Eșuate${failed ? ` (${failed})` : ""}` },
          ]}
        />
      </div>
      {filtered.length ? (
        <>
          <ul>
            {filtered.slice(0, limit).map((l) => (
              <LogItem key={l.id} log={l} open={openId === l.id} onToggle={() => setOpenId((o) => (o === l.id ? null : l.id))} />
            ))}
          </ul>
          {filtered.length > limit && (
            <div className="border-t border-border p-3 text-center">
              <Button variant="ghost" size="sm" onClick={() => setLimit((n) => n + PAGE)}>
                Încarcă mai multe ({filtered.length - limit} rămase)
              </Button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          compact
          icon={<ScrollText />}
          title={rows.length ? "Niciun apel în această categorie" : "Niciun apel către ANAF încă"}
          description={rows.length ? undefined : "Transmiterile, sincronizările SPV și validările apar aici, cu cererea și răspunsul complet."}
        />
      )}
    </Card>
  );
}
