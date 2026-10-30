"use client";

import { Inbox, ScrollText, Send, TriangleAlert } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { FadeIn } from "@/components/motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ConnectionCard } from "./connection-card";
import { InboxTab } from "./inbox-tab";
import { LogsTab } from "./logs-tab";
import { MessagesTab } from "./messages-tab";
import { SentTab } from "./sent-tab";
import type { ConnInfo, LogRow, SentRow, SpvRow } from "./types";

export type EfacturaTab = "trimise" | "primite" | "erori" | "jurnal";

function Count({ n, tone = "muted" }: { n: number; tone?: "muted" | "brand" | "danger" }) {
  if (!n) return null;
  return (
    <span
      className={cn(
        "ml-0.5 min-w-5 rounded-full px-1.5 text-center text-[10.5px] leading-[18px] font-semibold tabular",
        tone === "brand" ? "bg-primary text-primary-foreground" : tone === "danger" ? "bg-danger text-white" : "bg-muted-foreground/15 text-muted-foreground",
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function EfacturaView({
  conn,
  sent,
  spv,
  logs,
  initialTab,
  autoSync,
  flash,
  serverNow,
  today,
}: {
  conn: ConnInfo;
  sent: SentRow[];
  spv: SpvRow[];
  logs: LogRow[];
  initialTab: EfacturaTab;
  autoSync: boolean;
  flash: { connected: boolean; error: string | null };
  serverNow: number;
  today: string;
}) {
  const [tab, setTab] = React.useState<EfacturaTab>(initialTab);
  const flashed = React.useRef(false);

  // Rezultatul fluxului OAuth (?connected=1 / ?error=…) → toast, apoi curățăm URL-ul
  React.useEffect(() => {
    if (flashed.current || (!flash.connected && !flash.error)) return;
    flashed.current = true;
    if (flash.connected) toast.success("Conexiunea cu ANAF a fost realizată", { description: "Token-ul de acces este valabil 90 de zile și se reîmprospătează automat." });
    if (flash.error) toast.error("Conectarea la ANAF a eșuat", { description: flash.error, duration: 10_000 });
    const url = new URL(window.location.href);
    url.searchParams.delete("connected");
    url.searchParams.delete("error");
    window.history.replaceState(null, "", `${url.pathname}${url.searchParams.size ? `?${url.searchParams}` : ""}`);
  }, [flash]);

  const changeTab = (v: string) => {
    setTab(v as EfacturaTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", v);
    window.history.replaceState(null, "", `${url.pathname}?${url.searchParams}`);
  };

  const inbox = spv.filter((m) => m.type === "FACTURA PRIMITA");
  const other = spv.filter((m) => m.type !== "FACTURA PRIMITA");
  const unreadInbox = inbox.filter((m) => !m.read).length;
  const unreadOther = other.filter((m) => !m.read).length;
  const rejected = sent.filter((d) => d.efacturaStatus === "nok" || d.efacturaStatus === "error").length;
  const failedLogs = logs.filter((l) => !l.success).length;

  return (
    <div className="space-y-6">
      <FadeIn>
        <ConnectionCard conn={conn} serverNow={serverNow} />
      </FadeIn>

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="trimise">
            <Send /> Trimise <Count n={rejected} tone="danger" />
          </TabsTrigger>
          <TabsTrigger value="primite">
            <Inbox /> Primite (SPV) <Count n={unreadInbox} tone="brand" />
          </TabsTrigger>
          <TabsTrigger value="erori">
            <TriangleAlert /> Erori & mesaje <Count n={unreadOther || other.length} tone={unreadOther ? "brand" : "muted"} />
          </TabsTrigger>
          <TabsTrigger value="jurnal">
            <ScrollText /> Jurnal API <Count n={failedLogs} tone="danger" />
          </TabsTrigger>
        </TabsList>
        <TabsContent value="trimise">
          <SentTab rows={sent} today={today} />
        </TabsContent>
        <TabsContent value="primite">
          <InboxTab rows={inbox} lastSyncAt={conn.lastSyncAt} autoSync={autoSync} />
        </TabsContent>
        <TabsContent value="erori">
          <MessagesTab rows={other} />
        </TabsContent>
        <TabsContent value="jurnal">
          <LogsTab rows={logs} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
