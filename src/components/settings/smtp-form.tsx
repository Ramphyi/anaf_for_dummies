"use client";

import { CheckCircle2, CircleSlash, Eye, EyeOff, KeyRound, Mail, Send, Server, Trash2 } from "lucide-react";
import * as React from "react";
import { clearSmtpAction, saveSmtpAction, sendTestEmailAction } from "@/app/(app)/setari/email/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeaderRow } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { useAction } from "@/hooks/use-action";
import { cn } from "@/lib/utils";

export type SmtpFormData = { host: string; port: number; secure: boolean; user: string; from: string; hasPassword: boolean };

const PRESETS = [
  { label: "Gmail / Workspace", host: "smtp.gmail.com", port: 465, secure: true },
  { label: "Microsoft 365", host: "smtp.office365.com", port: 587, secure: false },
  { label: "Zoho Mail", host: "smtp.zoho.eu", port: 465, secure: true },
  { label: "SendGrid", host: "smtp.sendgrid.net", port: 587, secure: false, user: "apikey" },
  { label: "Mailgun (UE)", host: "smtp.eu.mailgun.org", port: 587, secure: false },
];

export function SmtpForm({ initial, userEmail }: { initial: SmtpFormData; userEmail: string }) {
  const [form, setForm] = React.useState({ ...initial, password: "" });
  const [saved, setSaved] = React.useState(initial);
  const [showPass, setShowPass] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const save = useAction();
  const test = useAction();
  const clear = useAction();

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };
  const configured = !!(saved.host && saved.user && saved.hasPassword);
  const dirty = form.host !== saved.host || form.port !== saved.port || form.secure !== saved.secure || form.user !== saved.user || form.from !== saved.from || !!form.password;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.run(() => saveSmtpAction({ host: form.host, port: form.port, secure: form.secure, user: form.user, from: form.from, password: form.password || null }), {
      onSuccess: () => {
        setSaved({ host: form.host, port: form.port, secure: form.secure, user: form.user, from: form.from, hasPassword: true });
        setForm((f) => ({ ...f, password: "", hasPassword: true }));
        setErrors({});
      },
      onError: (_, fe) => fe && setErrors(fe),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardHeaderRow
          title="Server de email (SMTP)"
          description="Folosit pentru trimiterea facturilor, a reminder-elor de plată și a notificărilor, din adresa firmei tale."
          icon={<Server />}
          actions={
            configured ? (
              <Badge tone="success" dot>
                Configurat
              </Badge>
            ) : (
              <Badge tone="warning" dot>
                Neconfigurat
              </Badge>
            )
          }
        />
        <CardContent className="space-y-5">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Completare rapidă</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, host: p.host, port: p.port, secure: p.secure, user: p.user ?? f.user }))}
                  className={cn(
                    "h-7 rounded-full px-2.5 text-xs font-medium transition-colors",
                    form.host === p.host ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid items-start gap-4 sm:grid-cols-[1fr_8rem]">
            <Field label="Server SMTP" required error={errors.host}>
              <Input value={form.host} onChange={(e) => set("host", e.target.value.trim())} placeholder="smtp.firma.ro" aria-invalid={!!errors.host} />
            </Field>
            <Field label="Port" required error={errors.port}>
              <Input type="number" value={form.port} onChange={(e) => set("port", Number(e.target.value))} aria-invalid={!!errors.port} />
            </Field>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
            <Switch checked={form.secure} onCheckedChange={(v) => setForm((f) => ({ ...f, secure: v, port: v && f.port === 587 ? 465 : !v && f.port === 465 ? 587 : f.port }))} className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Conexiune securizată SSL/TLS</span>
              <span className="block text-xs text-muted-foreground">Activ pentru portul 465. Pentru 587 lasă dezactivat — conexiunea se criptează automat prin STARTTLS.</span>
            </span>
          </label>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field label="Utilizator" required error={errors.user}>
              <Input value={form.user} onChange={(e) => set("user", e.target.value.trim())} placeholder="facturare@firma.ro" autoComplete="off" aria-invalid={!!errors.user} />
            </Field>
            <Field
              label="Parolă / cheie API"
              required={!saved.hasPassword}
              error={errors.password}
              hint={saved.hasPassword ? "Parola este salvată criptat. Lasă gol pentru a o păstra." : "Pentru Gmail/Outlook folosește o parolă de aplicație."}
            >
              <div className="relative">
                <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type={showPass ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder={saved.hasPassword ? "•••••••• (salvată)" : "Parola contului"}
                  autoComplete="new-password"
                  className="pr-9 pl-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label={showPass ? "Ascunde parola" : "Arată parola"}
                >
                  {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            <Field label="De la (expeditor)" error={errors.from} hint="Opțional — ex. „Pixelcraft Facturare” <facturare@firma.ro>" className="sm:col-span-2">
              <Input value={form.from} onChange={(e) => set("from", e.target.value)} placeholder={`"Firma mea" <${form.user || "facturare@firma.ro"}>`} />
            </Field>
          </div>
        </CardContent>
        <CardFooter className="flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!configured || dirty}
              loading={test.pending}
              onClick={() => test.run(() => sendTestEmailAction(), { success: (d) => `Email de test trimis către ${d.to} — verifică inbox-ul.` })}
            >
              <Send /> Trimite email de test
            </Button>
            {configured && (
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="ghost" size="sm" disabled={clear.pending}>
                    <Trash2 /> Șterge configurația
                  </Button>
                }
                title="Ștergi setările de email?"
                description="Facturile și reminder-ele nu vor mai putea fi trimise pe email până la o nouă configurare."
                confirmLabel="Șterge"
                destructive
                onConfirm={() =>
                  new Promise<void>((resolve) =>
                    clear.run(() => clearSmtpAction(), {
                      onSuccess: () => {
                        const empty = { host: "", port: 587, secure: false, user: "", from: "", hasPassword: false };
                        setSaved(empty);
                        setForm({ ...empty, password: "" });
                        resolve();
                      },
                      onError: () => resolve(),
                    }),
                  )
                }
              />
            )}
          </div>
          <div className="flex items-center gap-3">
            {dirty && configured && <span className="text-xs text-muted-foreground">Salvează înainte de test</span>}
            <Button type="submit" size="sm" loading={save.pending} disabled={!dirty}>
              Salvează
            </Button>
          </div>
        </CardFooter>
      </Card>

      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-3">
          {[
            { icon: <Mail />, title: "Testul ajunge la tine", text: `Emailul de test se trimite către ${userEmail}.` },
            { icon: <CheckCircle2 />, title: "Parolă criptată", text: "Parola SMTP se păstrează criptat (AES-256) și nu este afișată niciodată în browser." },
            { icon: <CircleSlash />, title: "Fără SMTP?", text: "Poți descărca PDF-ul facturii și îl poți trimite manual; reminder-ele necesită SMTP." },
          ].map((i) => (
            <div key={i.title} className="flex gap-3">
              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground [&_svg]:size-4">{i.icon}</div>
              <div>
                <p className="text-sm font-medium">{i.title}</p>
                <p className="text-xs text-muted-foreground">{i.text}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </form>
  );
}
