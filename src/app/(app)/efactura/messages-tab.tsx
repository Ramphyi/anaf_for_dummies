"use client";

import { Archive, ExternalLink, Eye, Mail, MailOpen, MessageSquare, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { downloadFile } from "@/components/anaf/download";
import { SPV_TYPE } from "@/components/anaf/utils";
import { Stagger, StaggerItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page";
import { Segmented } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { setSpvReadAction } from "./actions";
import { SpvMessageDialog } from "./spv-dialogs";
import type { SpvRow } from "./types";

function MessageCard({ m, onView }: { m: SpvRow; onView: () => void }) {
  const { run, pending } = useAction();
  const isError = m.type === "ERORI FACTURA";
  const type = SPV_TYPE[m.type] ?? { label: m.type, tone: "neutral" as const };
  const errors = (m.documentMessage ?? "").split("\n").filter(Boolean);
  return (
    <Card className={cn("relative overflow-hidden transition-shadow hover:shadow-lift", !m.read && "ring-1 ring-primary/40")}>
      <div className={cn("absolute inset-y-0 left-0 w-1", isError ? "bg-danger" : "bg-info")} />
      <div className="flex flex-col gap-4 p-4 pl-5 sm:flex-row sm:items-start">
        <div className={cn("grid size-10 shrink-0 place-items-center rounded-xl", isError ? "bg-danger-soft text-danger" : "bg-info-soft text-info")}>
          {isError ? <TriangleAlert className="size-5" /> : <MessageSquare className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={type.tone} dot>
              {type.label}
            </Badge>
            {!m.read && (
              <Badge tone="brand" dot pulse>
                Necitit
              </Badge>
            )}
            <span className="text-xs text-muted-foreground" suppressHydrationWarning>
              {formatDateTime(m.createdAt)} · {formatRelative(m.createdAt)}
            </span>
          </div>
          <p className={cn("mt-2 text-sm break-words", !m.read && "font-medium")}>{m.details ?? "Mesaj fără detalii"}</p>
          {m.documentId && (
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Factura{" "}
              <Link href={`/facturi/${m.documentId}`} className="font-medium text-primary hover:underline">
                {m.documentNumber ?? "asociată"}
              </Link>
              {m.requestId && (
                <>
                  {" "}
                  · index încărcare <span className="font-mono">{m.requestId}</span>
                </>
              )}
            </p>
          )}
          {isError && errors.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-lg bg-danger-soft/60 px-3 py-2 text-[13px] text-danger-soft-foreground">
              {errors.map((e, i) => (
                <li key={i} className="break-words">
                  {e}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5 sm:flex-col sm:items-stretch">
          <Button size="sm" variant="outline" onClick={onView}>
            <Eye /> Vezi mesajul
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void downloadFile(`/api/spv/${m.id}/zip`, `${m.anafId}.zip`)}>
            <Archive /> ZIP
          </Button>
          {m.documentId && isError && (
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/facturi/${m.documentId}`}>
                <ExternalLink /> Corectează
              </Link>
            </Button>
          )}
          <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => setSpvReadAction(m.id, !m.read))}>
            {!pending && (m.read ? <Mail /> : <MailOpen />)} {m.read ? "Necitit" : "Citit"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function MessagesTab({ rows }: { rows: SpvRow[] }) {
  const [filter, setFilter] = React.useState<"all" | "errors" | "buyer" | "unread">("all");
  const [viewId, setViewId] = React.useState<string | null>(null);
  const shown = rows.filter((m) =>
    filter === "errors" ? m.type === "ERORI FACTURA" : filter === "buyer" ? m.type === "MESAJ CUMPARATOR" : filter === "unread" ? !m.read : true,
  );
  const current = rows.find((r) => r.id === viewId) ?? null;

  if (!rows.length) {
    return (
      <Card>
        <EmptyState
          icon={<ShieldCheck />}
          title="Niciun mesaj de eroare"
          description="Aici apar erorile de validare trimise de ANAF pentru facturile tale și mesajele primite de la cumpărători prin SPV."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="scrollbar-thin -mx-1 overflow-x-auto px-1 pb-1">
        <Segmented
          value={filter}
          onChange={setFilter}
          size="sm"
          options={[
            { value: "all", label: `Toate (${rows.length})` },
            { value: "errors", label: "Erori validare" },
            { value: "buyer", label: "Mesaje cumpărători" },
            { value: "unread", label: "Necitite" },
          ]}
        />
      </div>
      {shown.length ? (
        <Stagger className="space-y-3" key={filter}>
          {shown.map((m) => (
            <StaggerItem key={m.id}>
              <MessageCard m={m} onView={() => setViewId(m.id)} />
            </StaggerItem>
          ))}
        </Stagger>
      ) : (
        <Card>
          <EmptyState compact icon={<MailOpen />} title="Niciun mesaj în această categorie" />
        </Card>
      )}
      <SpvMessageDialog row={current} open={!!current} onOpenChange={(o) => !o && setViewId(null)} />
    </div>
  );
}
