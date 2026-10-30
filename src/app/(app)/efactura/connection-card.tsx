"use client";

import { Clock, FlaskConical, KeyRound, Link2, RefreshCw, Settings2, ShieldCheck, Sparkles, Unplug } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { EASE_OUT } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/popover";
import { useAction } from "@/hooks/use-action";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { disconnectAction, refreshTokenAction, startOauthAction } from "./actions";
import type { ConnInfo } from "./types";

function splitDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

const pad = (n: number) => String(n).padStart(2, "0");

function TokenMeter({
  label,
  icon,
  expiresAt,
  totalDays,
  now,
  simulated,
  showSeconds,
}: {
  label: string;
  icon: React.ReactNode;
  expiresAt: string | null;
  totalDays: number;
  now: number;
  simulated: boolean;
  showSeconds?: boolean;
}) {
  const left = expiresAt ? Date.parse(expiresAt) - now : null;
  const pct = left === null ? 0 : Math.max(0, Math.min(100, (left / (totalDays * 86_400_000)) * 100));
  const days = left === null ? 0 : left / 86_400_000;
  const tone = simulated ? "var(--primary)" : left === null ? "var(--muted-foreground)" : left <= 0 ? "var(--danger)" : days < 7 ? "var(--danger)" : days < 30 ? "var(--warning)" : "var(--success)";
  const t = splitDuration(left ?? 0);

  return (
    <div className="rounded-xl border border-border bg-card/70 p-3.5 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground [&_svg]:size-3.5">
          {icon}
          {label}
        </span>
        <span className="text-[11px] text-muted-foreground">valabil {totalDays} zile</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        {simulated ? (
          <span className="text-sm font-semibold text-primary">Nu este necesar în simulare</span>
        ) : left === null ? (
          <span className="text-sm font-semibold text-muted-foreground">Neconectat</span>
        ) : left <= 0 ? (
          <span className="text-sm font-semibold text-danger">Expirat {formatRelative(expiresAt)}</span>
        ) : (
          <span className="font-mono text-[15px] font-semibold tabular" suppressHydrationWarning>
            {t.d}
            <span className="text-muted-foreground">z</span> {pad(t.h)}
            <span className="text-muted-foreground">h</span> {pad(t.m)}
            <span className="text-muted-foreground">m</span>
            {showSeconds && (
              <>
                {" "}
                {pad(t.s)}
                <span className="text-muted-foreground">s</span>
              </>
            )}
          </span>
        )}
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full rounded-full"
          style={{ background: tone }}
          initial={{ width: 0 }}
          animate={{ width: `${simulated ? 100 : pct}%` }}
          transition={{ duration: 1, ease: EASE_OUT, delay: 0.15 }}
        />
      </div>
      {!simulated && expiresAt && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">Expiră la {formatDateTime(expiresAt)}</p>
      )}
    </div>
  );
}

/** Cardul „hero” cu starea conexiunii OAuth2 la ANAF. */
export function ConnectionCard({ conn, serverNow }: { conn: ConnInfo; serverNow: number }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [busy, setBusy] = React.useState<"connect" | "refresh" | null>(null);
  const [simOpen, setSimOpen] = React.useState(false);
  const [now, setNow] = React.useState(serverNow);
  const simulated = conn.environment === "simulation";

  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const connect = () => {
    if (simulated) {
      setSimOpen(true);
      return;
    }
    if (!conn.hasClientId || !conn.hasSecret) {
      toast.info("Configurează mai întâi aplicația OAuth (Client ID și Client Secret).");
      router.push("/efactura/conexiune");
      return;
    }
    setBusy("connect");
    run(() => startOauthAction(), {
      onSuccess: (r) => {
        if (r.url) window.location.href = r.url;
      },
    });
  };

  const refresh = () => {
    setBusy("refresh");
    run(() => refreshTokenAction());
  };

  React.useEffect(() => {
    if (!pending) setBusy(null);
  }, [pending]);

  const envIcon = simulated ? <Sparkles /> : conn.environment === "test" ? <FlaskConical /> : <ShieldCheck />;

  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-dots opacity-40 [mask-image:linear-gradient(to_left,black,transparent_60%)]" />
      <div className="pointer-events-none absolute -top-24 -left-16 size-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 -bottom-28 size-72 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_auto] lg:items-center">
        {/* Identitate & stare */}
        <div className="flex min-w-0 items-start gap-4">
          <div className="relative shrink-0">
            <div className={cn("grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-white shadow-glow [&_svg]:size-7")}>
              <ShieldCheck />
            </div>
            {conn.state.connected && (
              <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-card ring-2 ring-card">
                <span className={cn("size-3 rounded-full", simulated ? "bg-primary" : "bg-success")} />
                <span className={cn("absolute size-3 animate-ping rounded-full opacity-60", simulated ? "bg-primary" : "bg-success")} />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">Conexiune ANAF</h2>
              <Badge tone={conn.state.tone} dot pulse={conn.state.connected}>
                {conn.state.label}
              </Badge>
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {conn.companyName} · CIF <span className="font-mono">{conn.companyCui}</span>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 font-medium [&_svg]:size-3.5 [&_svg]:text-primary">
                {envIcon}
                {conn.envLabel}
              </span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground" suppressHydrationWarning>
                <Clock className="size-3.5" />
                Ultima sincronizare SPV: {conn.lastSyncAt ? formatRelative(conn.lastSyncAt) : "niciodată"}
              </span>
            </div>
          </div>
        </div>

        {/* Token-uri */}
        <div className="grid gap-3 sm:grid-cols-2">
          <TokenMeter label="Token de acces" icon={<KeyRound />} expiresAt={conn.accessTokenExpiresAt} totalDays={90} now={now} simulated={simulated} showSeconds />
          <TokenMeter label="Refresh token" icon={<RefreshCw />} expiresAt={conn.refreshTokenExpiresAt} totalDays={365} now={now} simulated={simulated} />
        </div>

        {/* Acțiuni */}
        <div className="flex flex-wrap gap-2 lg:w-48 lg:flex-col">
          {!conn.hasTokens || simulated ? (
            <Button variant="gradient" onClick={connect} loading={busy === "connect"} className="flex-1 lg:flex-none">
              <Link2 /> Conectează
            </Button>
          ) : (
            <Button variant="outline" onClick={connect} loading={busy === "connect"} className="flex-1 lg:flex-none">
              <Link2 /> Reconectează
            </Button>
          )}
          <Tooltip content={simulated ? "Indisponibil în simulare" : !conn.hasTokens ? "Conectează-te întâi" : undefined}>
            <span className="flex flex-1 lg:flex-none">
              <Button variant="outline" onClick={refresh} loading={busy === "refresh"} disabled={simulated || !conn.hasTokens} className="w-full">
                <RefreshCw /> Reîmprospătează token
              </Button>
            </span>
          </Tooltip>
          {conn.hasTokens && !simulated && (
            <ConfirmDialog
              trigger={
                <Button variant="destructive-soft" className="flex-1 lg:flex-none">
                  <Unplug /> Deconectează
                </Button>
              }
              title="Deconectezi firma de la ANAF?"
              description="Token-urile salvate vor fi șterse. Facturile nu vor mai putea fi transmise până la o nouă autorizare cu certificatul digital."
              confirmLabel="Deconectează"
              destructive
              onConfirm={() =>
                new Promise<void>((resolve) => {
                  run(() => disconnectAction(), { onSuccess: () => resolve(), onError: () => resolve() });
                })
              }
            />
          )}
          <Button variant="ghost" asChild className="flex-1 lg:flex-none">
            <Link href="/efactura/conexiune">
              <Settings2 /> Setări conexiune
            </Link>
          </Button>
        </div>
      </div>

      {simulated && (
        <div className="relative flex flex-col gap-2 border-t border-border bg-primary-soft/40 px-5 py-3 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="flex items-start gap-2 text-primary-soft-foreground">
            <Sparkles className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong className="font-semibold">Mod simulare:</strong> răspunsurile ANAF sunt generate local — poți trimite facturi, sincroniza SPV și importa cheltuieli fără certificat digital. Nimic nu ajunge la ANAF.
            </span>
          </p>
          <Button variant="link" size="sm" asChild className="shrink-0 self-start sm:self-auto">
            <Link href="/efactura/conexiune">Trece pe test / producție →</Link>
          </Button>
        </div>
      )}

      <Dialog open={simOpen} onOpenChange={setSimOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" /> Conexiune simulată
            </DialogTitle>
            <DialogDescription>În modul simulare nu este nevoie de autorizare OAuth cu certificatul digital.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3 text-sm">
            <p>
              AND răspunde local exact ca serviciile ANAF: facturile trec prin „în prelucrare” → „validată”, SPV-ul primește facturi de la
              furnizori fictivi, iar e-Transport generează coduri UIT de test.
            </p>
            <ul className="space-y-2">
              {[
                "Ideal pentru demo, instruire și verificarea fluxurilor.",
                "Facturile simulate nu au valoare fiscală și nu apar în SPV-ul real.",
                "Pentru transmitere reală, alege mediul „ANAF Test” sau „ANAF Producție” și conectează-te cu certificatul digital calificat.",
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="text-muted-foreground">{t}</span>
                </li>
              ))}
            </ul>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSimOpen(false)}>
              Am înțeles
            </Button>
            <Button asChild>
              <Link href="/efactura/conexiune">
                <Settings2 /> Configurează conexiunea reală
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
