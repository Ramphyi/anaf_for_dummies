"use client";

import {
  BadgeCheck,
  ExternalLink,
  Eye,
  EyeOff,
  FlaskConical,
  KeyRound,
  Link2,
  LockKeyhole,
  Save,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Usb,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import * as React from "react";
import { CopyButton } from "@/components/anaf/copy-button";
import { Stagger, StaggerItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { useAction } from "@/hooks/use-action";
import type { Tone } from "@/lib/constants";
import type { AnafEnvironment } from "@/lib/db/schema";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveConnectionAction, startOauthAction } from "../actions";

const ENVIRONMENTS: { value: AnafEnvironment; title: string; icon: React.ReactNode; desc: string; detail: string }[] = [
  {
    value: "simulation",
    title: "Simulare",
    icon: <Sparkles />,
    desc: "Fără certificat. Răspunsuri realiste generate local.",
    detail: "Nimic nu ajunge la ANAF — ideal pentru demo și instruire.",
  },
  {
    value: "test",
    title: "ANAF Test",
    icon: <FlaskConical />,
    desc: "api.anaf.ro/test — mediul de test oficial.",
    detail: "Facturile nu au valoare fiscală. Necesită certificat și aplicație OAuth.",
  },
  {
    value: "prod",
    title: "ANAF Producție",
    icon: <ShieldCheck />,
    desc: "api.anaf.ro/prod — transmitere reală în SPV.",
    detail: "Facturile transmise au valoare fiscală și ajung la clienți.",
  },
];

type Initial = { environment: AnafEnvironment; clientId: string; redirectUri: string; autoSync: boolean };
type Status = {
  hasSecret: boolean;
  secretUnreadable: boolean;
  hasTokens: boolean;
  stateLabel: string;
  stateTone: Tone;
  connectedAt: string | null;
  accessTokenExpiresAt: string | null;
};

function GuideStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <div className="absolute top-8 bottom-0 left-[13px] w-px bg-border [li:last-child>&]:hidden" />
      <span className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-foreground ring-4 ring-card">
        {n}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-sm font-semibold">{title}</p>
        <div className="mt-1 space-y-1.5 text-[13px] leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

export function ConnectionForm({
  initial,
  status,
  defaultRedirect,
  companyCui,
}: {
  initial: Initial;
  status: Status;
  defaultRedirect: string;
  companyCui: string;
}) {
  const [form, setForm] = React.useState({ ...initial, clientSecret: "" });
  const [showSecret, setShowSecret] = React.useState(false);
  const [simOpen, setSimOpen] = React.useState(false);
  const save = useAction();
  const connect = useAction();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const redirect = form.redirectUri || defaultRedirect;
  const simulated = form.environment === "simulation";
  const secretReady = !!form.clientSecret || (status.hasSecret && form.clientId === initial.clientId);
  const canConnect = !simulated && !!form.clientId && secretReady;
  const payload = () => ({
    environment: form.environment,
    clientId: form.clientId,
    clientSecret: form.clientSecret || null,
    redirectUri: form.redirectUri,
    autoSync: form.autoSync,
  });

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    save.run(() => saveConnectionAction(payload()), { onSuccess: () => set("clientSecret", "") });
  };

  const onConnect = () => {
    if (simulated) {
      setSimOpen(true);
      return;
    }
    connect.run(() => startOauthAction(payload()), {
      onSuccess: (r) => {
        if (r.url) window.location.href = r.url;
      },
    });
  };

  const secretPlaceholder = status.secretUnreadable
    ? "Secretul salvat nu mai poate fi citit — reintrodu-l"
    : status.hasSecret
      ? "•••••••••••••••• (salvat — lasă gol pentru a-l păstra)"
      : "Client Secret din aplicația SPV";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="space-y-6">
        <form onSubmit={onSave}>
          <Card>
            <CardHeaderRow
              icon={<KeyRound />}
              title="Setări conexiune"
              description="Mediul ANAF și datele aplicației OAuth2 înregistrate în SPV."
              actions={
                <Badge tone={status.stateTone} dot pulse={status.hasTokens || initial.environment === "simulation"}>
                  {status.stateLabel}
                </Badge>
              }
            />
            <CardContent className="space-y-6">
              <div>
                <p className="mb-2 text-[13px] font-medium">Mediu</p>
                <Stagger className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Mediu ANAF">
                  {ENVIRONMENTS.map((env) => {
                    const active = form.environment === env.value;
                    return (
                      <StaggerItem key={env.value}>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => set("environment", env.value)}
                          className={cn(
                            "relative flex h-full w-full flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all",
                            active ? "border-primary bg-primary-soft/40 shadow-glow" : "border-border bg-card hover:border-primary/40 hover:bg-muted/40",
                          )}
                        >
                          <div className="flex w-full items-center justify-between">
                            <span className={cn("grid size-8 place-items-center rounded-lg [&_svg]:size-4", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                              {env.icon}
                            </span>
                            <span className={cn("grid size-4 place-items-center rounded-full border-2", active ? "border-primary" : "border-input")}>
                              {active && <motion.span layoutId="env-dot" className="size-2 rounded-full bg-primary" />}
                            </span>
                          </div>
                          <span className="text-sm font-semibold">{env.title}</span>
                          <span className="text-xs text-muted-foreground">{env.desc}</span>
                          <span className="text-[11px] text-muted-foreground/80">{env.detail}</span>
                        </button>
                      </StaggerItem>
                    );
                  })}
                </Stagger>
                <AnimatePresence>
                  {form.environment === "prod" && initial.environment !== "prod" && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 flex items-start gap-2 overflow-hidden rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-soft-foreground"
                    >
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                      În producție, fiecare factură transmisă are valoare fiscală și apare în SPV-ul clientului. Verifică facturile înainte de trimitere.
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              <div className={cn("grid gap-4 transition-opacity sm:grid-cols-2", simulated && "opacity-60")}>
                <Field label="Client ID" hint="Generat de ANAF la înregistrarea aplicației">
                  <Input
                    value={form.clientId}
                    onChange={(e) => set("clientId", e.target.value)}
                    placeholder="ex. 7f3c1e9a0b5d…"
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono text-[13px]"
                  />
                </Field>
                <Field label="Client Secret" hint={status.hasSecret ? "Stocat criptat (AES-256-GCM); nu este afișat niciodată." : "Va fi stocat criptat."}>
                  <div className="relative">
                    <Input
                      type={showSecret ? "text" : "password"}
                      value={form.clientSecret}
                      onChange={(e) => set("clientSecret", e.target.value)}
                      placeholder={secretPlaceholder}
                      autoComplete="new-password"
                      spellCheck={false}
                      aria-invalid={status.secretUnreadable && !form.clientSecret ? true : undefined}
                      className="pr-10 font-mono text-[13px]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret((s) => !s)}
                      disabled={!form.clientSecret}
                      className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                      aria-label={showSecret ? "Ascunde" : "Arată"}
                    >
                      {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </Field>
                <Field
                  label="Redirect URI (Callback URL)"
                  className="sm:col-span-2"
                  hint="Trebuie să fie identic, caracter cu caracter, cu cel declarat în aplicația din SPV."
                >
                  <div className="flex gap-2">
                    <Input
                      value={form.redirectUri}
                      onChange={(e) => set("redirectUri", e.target.value)}
                      placeholder={defaultRedirect}
                      spellCheck={false}
                      className="font-mono text-[13px]"
                    />
                    <CopyButton value={redirect} variant="outline" size="icon" tooltip="Copiază Redirect URI" toastMessage="Redirect URI copiat" />
                  </div>
                </Field>
              </div>

              <label className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
                <span>
                  <span className="block text-sm font-medium">Sincronizare automată SPV</span>
                  <span className="block text-xs text-muted-foreground">Descarcă periodic facturile primite și actualizează statusurile (prin cron).</span>
                </span>
                <Switch checked={form.autoSync} onCheckedChange={(v) => set("autoSync", v)} />
              </label>
            </CardContent>
            <div className="flex flex-col-reverse gap-2 border-t border-border bg-subtle/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="ghost" asChild>
                <Link href="/efactura">Înapoi la e-Factura</Link>
              </Button>
              <Button type="submit" variant="outline" loading={save.pending}>
                {!save.pending && <Save />} Salvează setările
              </Button>
            </div>
          </Card>
        </form>

        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute -top-20 -right-10 size-56 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-white shadow-glow">
              <Usb className="size-7" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Autorizare cu certificatul digital</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {simulated
                  ? "În modul simulare nu este necesară autorizarea — conexiunea este deja activă."
                  : status.hasTokens
                    ? `Firma este conectată${status.connectedAt ? ` din ${formatDate(status.connectedAt)}` : ""}. Reconectează-te dacă ai schimbat aplicația OAuth sau token-ul a expirat.`
                    : "Vei fi redirecționat la logincert.anaf.ro, unde alegi certificatul calificat și confirmi accesul. Revii automat în AND."}
              </p>
              {!simulated && !canConnect && (
                <p className="mt-2 text-xs text-warning-soft-foreground">Completează Client ID și Client Secret pentru a continua.</p>
              )}
            </div>
            <Button variant="gradient" size="lg" onClick={onConnect} loading={connect.pending} disabled={!simulated && !canConnect} className="shrink-0">
              {!connect.pending && <Link2 />}
              {status.hasTokens && !simulated ? "Reconectează" : "Conectează cu certificatul digital"}
            </Button>
          </div>
        </Card>
      </div>

      <Card className="h-fit lg:sticky lg:top-20">
        <CardHeaderRow icon={<BadgeCheck />} title="Ghid: înregistrarea aplicației în SPV" description="Se face o singură dată, durează ~5 minute." />
        <CardContent>
          <ol>
            <GuideStep n={1} title="Pregătește certificatul digital calificat">
              <p>
                Ai nevoie de token-ul USB cu certificatul calificat al reprezentantului legal sau al unei persoane cu drept de reprezentare pe CIF{" "}
                <span className="font-mono text-foreground">{companyCui}</span> în SPV (formularul 150 / împuternicire).
              </p>
            </GuideStep>
            <GuideStep n={2} title="Deschide pagina de înregistrare OAuth">
              <p>
                Accesează{" "}
                <a href="https://www.anaf.ro/InregOauth" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                  anaf.ro/InregOauth <ExternalLink className="size-3" />
                </a>{" "}
                și autentifică-te cu certificatul (logincert.anaf.ro).
              </p>
            </GuideStep>
            <GuideStep n={3} title="Înregistrează aplicația">
              <p>Denumire: de ex. „AND”. Bifează serviciile <strong className="text-foreground">E-Factura</strong> și <strong className="text-foreground">E-Transport</strong>.</p>
              <p>La Callback URL introdu exact:</p>
              <div className="flex items-center gap-1 rounded-lg border border-border bg-subtle py-1 pr-1 pl-2.5">
                <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground">{redirect}</code>
                <CopyButton value={redirect} toastMessage="Callback URL copiat" />
              </div>
              <p className="flex items-start gap-1.5 text-warning-soft-foreground">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                Protocolul, domeniul, portul și calea trebuie să coincidă exact; altfel ANAF refuză autorizarea.
              </p>
            </GuideStep>
            <GuideStep n={4} title="Copiază Client ID și Client Secret">
              <p>ANAF le afișează după înregistrare. Lipește-le în formular, alege mediul (Test sau Producție) și salvează.</p>
            </GuideStep>
            <GuideStep n={5} title="Conectează-te">
              <p>Apasă „Conectează cu certificatul digital”, alege certificatul în browser și confirmă. Revii automat aici.</p>
            </GuideStep>
            <GuideStep n={6} title="Gata — reîmprospătare automată">
              <p>
                Token-ul de acces e valabil <strong className="text-foreground">90 de zile</strong> și se reîmprospătează automat cu refresh token-ul, valabil{" "}
                <strong className="text-foreground">365 de zile</strong>. După un an, reconectează-te cu certificatul.
              </p>
            </GuideStep>
          </ol>
          <div className="mt-5 flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
            <LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" />
            Client Secret și token-urile sunt stocate criptat și nu sunt trimise niciodată în browser. Toate apelurile către ANAF apar în Jurnalul API.
          </div>
        </CardContent>
      </Card>

      <Dialog open={simOpen} onOpenChange={setSimOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" /> Mod simulare activ
            </DialogTitle>
            <DialogDescription>Conexiunea este simulată — nu există o autorizare reală la ANAF.</DialogDescription>
          </DialogHeader>
          <DialogBody className="text-sm text-muted-foreground">
            Pentru a te conecta cu certificatul digital, alege mai sus mediul „ANAF Test” sau „ANAF Producție”, completează Client ID și Client Secret, apoi apasă din
            nou „Conectează”.
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setSimOpen(false)}>Am înțeles</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
