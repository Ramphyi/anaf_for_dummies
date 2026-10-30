"use client";

import { Check, Eye, EyeOff, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import * as React from "react";
import { changePasswordAction, updateProfileAction } from "@/app/(app)/setari/profil/actions";
import { motion } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeaderRow } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/misc";
import { useAction } from "@/hooks/use-action";
import { PALETTE, ROLE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function ProfileForm({ initial, email, role, companyName }: { initial: { name: string; avatarColor: string }; email: string; role: string; companyName: string }) {
  const [form, setForm] = React.useState(initial);
  const [saved, setSaved] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const { run, pending } = useAction();
  const dirty = form.name !== saved.name || form.avatarColor !== saved.avatarColor;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateProfileAction(form), { onSuccess: (d) => setSaved(d), onError: (_, fe) => fe && setErrors(fe) });
      }}
    >
      <Card>
        <CardHeaderRow title="Profil" description="Cum apari colegilor în aplicație (avatar, pontaj, jurnal de activitate)." icon={<UserRound />} />
        <CardContent className="grid gap-6 sm:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-2">
            <motion.div key={form.avatarColor} initial={{ scale: 0.9 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.45, duration: 0.4 }}>
              <Avatar name={form.name || "?"} color={form.avatarColor} size="xl" className="size-20 text-2xl" />
            </motion.div>
            <Badge tone="brand">{ROLE_LABELS[role] ?? role}</Badge>
            <span className="max-w-40 truncate text-center text-xs text-muted-foreground">{companyName}</span>
          </div>
          <div className="space-y-4">
            <Field label="Nume complet" required error={errors.name}>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} aria-invalid={!!errors.name} />
            </Field>
            <Field label="Email" hint="Emailul este identificatorul contului și nu poate fi schimbat aici.">
              <Input value={email} disabled />
            </Field>
            <div>
              <p className="mb-1.5 text-[13px] font-medium">Culoare avatar</p>
              <div className="flex flex-wrap gap-2">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, avatarColor: c }))}
                    className={cn(
                      "grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-card transition-transform hover:scale-110",
                      form.avatarColor === c && "ring-2 ring-foreground/70",
                    )}
                    style={{ background: `linear-gradient(135deg, ${c}, color-mix(in oklab, ${c} 60%, #000))` }}
                    aria-label={`Culoare ${c}`}
                  >
                    {form.avatarColor === c && <Check className="size-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="button" variant="ghost" size="sm" disabled={!dirty || pending} onClick={() => setForm(saved)}>
            Renunță
          </Button>
          <Button type="submit" size="sm" loading={pending} disabled={!dirty}>
            Salvează profilul
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

function strength(p: string) {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(4, s);
}
const STRENGTH = [
  { label: "Prea scurtă", color: "var(--danger)" },
  { label: "Slabă", color: "var(--danger)" },
  { label: "Acceptabilă", color: "var(--warning)" },
  { label: "Bună", color: "var(--success)" },
  { label: "Foarte bună", color: "var(--success)" },
];

export function PasswordForm() {
  const empty = { current: "", next: "", confirm: "" };
  const [form, setForm] = React.useState(empty);
  const [show, setShow] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const { run, pending } = useAction();
  const score = form.next ? strength(form.next) : 0;
  const mismatch = !!form.confirm && form.confirm !== form.next;
  const set = (k: keyof typeof empty, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => changePasswordAction(form), {
          onSuccess: () => {
            setForm(empty);
            setErrors({});
          },
          onError: (msg, fe) => setErrors(fe ?? (msg.includes("curentă") ? { current: msg } : {})),
        });
      }}
    >
      <Card>
        <CardHeaderRow
          title="Schimbă parola"
          description="Folosește minim 8 caractere; o frază lungă e mai sigură decât o parolă complicată."
          icon={<KeyRound />}
          actions={
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => setShow((s) => !s)} aria-label={show ? "Ascunde parolele" : "Arată parolele"}>
              {show ? <EyeOff /> : <Eye />}
            </Button>
          }
        />
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Parola curentă" required error={errors.current}>
            <Input type={show ? "text" : "password"} value={form.current} onChange={(e) => set("current", e.target.value)} autoComplete="current-password" aria-invalid={!!errors.current} />
          </Field>
          <Field label="Parola nouă" required error={errors.next}>
            <Input type={show ? "text" : "password"} value={form.next} onChange={(e) => set("next", e.target.value)} autoComplete="new-password" aria-invalid={!!errors.next} />
          </Field>
          <Field label="Confirmă parola nouă" required error={errors.confirm || (mismatch ? "Parolele nu coincid" : undefined)}>
            <Input type={show ? "text" : "password"} value={form.confirm} onChange={(e) => set("confirm", e.target.value)} autoComplete="new-password" aria-invalid={mismatch} />
          </Field>
          {form.next && (
            <div className="sm:col-span-3">
              <div className="flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="h-full rounded-full"
                      initial={false}
                      animate={{ width: i < score ? "100%" : "0%", background: STRENGTH[score].color }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Putere: {STRENGTH[score].label}</p>
            </div>
          )}
        </CardContent>
        <CardFooter className="justify-between">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" /> Parolele sunt stocate doar ca hash scrypt.
          </span>
          <Button type="submit" size="sm" loading={pending} disabled={!form.current || form.next.length < 8 || mismatch}>
            Schimbă parola
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
