"use client";

import { ArrowLeft, ArrowRight, BadgeCheck, Building2, Loader2, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { COUNTIES } from "@/lib/constants";
import { lookupCuiAction, registerAction, type AuthState } from "../actions";

export function RegisterForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(registerAction, undefined);
  const [step, setStep] = useState(0);
  const [looking, startLookup] = useTransition();
  // Câmpuri controlate: pasul 1 se re-montează la animație, iar valorile trebuie să ajungă la submit.
  const [account, setAccount] = useState({ name: "", email: "", password: "" });
  const [accountErrors, setAccountErrors] = useState<Record<string, string>>({});
  const [company, setCompany] = useState({ cui: "", companyName: "", regCom: "", address: "", city: "", county: "", vatPayer: true });
  const [found, setFound] = useState(false);
  const fe = { ...state?.fieldErrors, ...accountErrors };

  // Eroare de server pe datele contului (ex. email deja folosit) → revenim la pasul 1.
  useEffect(() => {
    const errs = state?.fieldErrors ?? {};
    if (errs.name || errs.email || errs.password) setStep(0);
  }, [state]);

  const validateAccount = () => {
    const errs: Record<string, string> = {};
    if (account.name.trim().length < 2) errs.name = "Numele este prea scurt";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email.trim())) errs.email = "Email invalid";
    if (account.password.length < 8) errs.password = "Parola trebuie să aibă minim 8 caractere";
    setAccountErrors(errs);
    return !Object.keys(errs).length;
  };

  const goNext = () => {
    if (validateAccount()) setStep(1);
  };

  const lookup = () =>
    startLookup(async () => {
      const r = await lookupCuiAction(company.cui);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setCompany((c) => ({
        ...c,
        companyName: r.data.name,
        regCom: r.data.regCom ?? "",
        address: r.data.street ?? r.data.address ?? "",
        city: r.data.city ?? "",
        county: r.data.county ?? "",
        vatPayer: r.data.vatPayer,
      }));
      setFound(true);
      toast.success(`Date preluate de la ANAF: ${r.data.name}`);
    });

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Creează-ți contul</h1>
      <p className="mt-2 text-sm text-muted-foreground">Durează mai puțin de un minut. Datele firmei le preluăm automat de la ANAF.</p>

      <div className="mt-6 flex items-center gap-2">
        {["Cont", "Firmă"].map((label, i) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div className={`grid size-6 place-items-center rounded-full text-xs font-semibold transition-colors ${i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{i + 1}</div>
            <span className={`text-sm font-medium ${i <= step ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
            {i === 0 && (
              <div className="h-px flex-1 overflow-hidden bg-border">
                <motion.div className="h-full bg-primary" animate={{ width: step > 0 ? "100%" : "0%" }} transition={{ duration: 0.5 }} />
              </div>
            )}
          </div>
        ))}
      </div>

      <form
        action={action}
        noValidate
        onSubmit={(e) => {
          // Enter pe pasul 1 trece la pasul 2, nu trimite formularul incomplet.
          if (step === 0) {
            e.preventDefault();
            goNext();
          }
        }}
        className="mt-6"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: step ? 24 : -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: step ? -24 : 24 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-4"
          >
            <div className={step === 0 ? "space-y-4" : "hidden"}>
              <Field label="Nume complet" error={fe.name} required>
                <Input name="name" value={account.name} onChange={(e) => setAccount({ ...account, name: e.target.value })} autoComplete="name" placeholder="Andrei Popescu" className="h-11" />
              </Field>
              <Field label="Email" error={fe.email} required>
                <Input name="email" type="email" value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} autoComplete="email" placeholder="andrei@firma.ro" className="h-11" />
              </Field>
              <Field label="Parolă" error={fe.password} hint="Minim 8 caractere" required>
                <Input name="password" type="password" value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} autoComplete="new-password" className="h-11" />
              </Field>
              <Button type="button" size="lg" className="w-full" onClick={goNext}>
                Continuă <ArrowRight />
              </Button>
            </div>
            <div className={step === 1 ? "space-y-4" : "hidden"}>
              <Field label="CUI firmă" error={fe.cui} hint="Introdu CUI-ul și apasă „Caută la ANAF” pentru completare automată." required>
                <div className="flex gap-2">
                  <Input name="cui" value={company.cui} onChange={(e) => setCompany({ ...company, cui: e.target.value })} placeholder="RO12345678" className="h-11" required />
                  <Button type="button" variant="outline" size="lg" onClick={lookup} disabled={!company.cui || looking}>
                    {looking ? <Loader2 className="animate-spin" /> : <Search />} Caută la ANAF
                  </Button>
                </div>
              </Field>
              <AnimatePresence>
                {found && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm text-success-soft-foreground">
                    <BadgeCheck className="size-4" /> Firmă găsită în registrul ANAF — verifică datele de mai jos.
                  </motion.div>
                )}
              </AnimatePresence>
              <Field label="Denumire firmă" error={fe.companyName} required>
                <div className="relative">
                  <Building2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input name="companyName" value={company.companyName} onChange={(e) => setCompany({ ...company, companyName: e.target.value })} className="h-11 pl-9" required />
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nr. Reg. Com." hint="Obligatoriu pe facturi pentru societăți (Legea 31/1990)">
                  <Input name="regCom" value={company.regCom} onChange={(e) => setCompany({ ...company, regCom: e.target.value })} placeholder="J40/123/2020" />
                </Field>
                <Field label="Județ" error={fe.county} required>
                  <NativeSelect name="county" value={company.county} onChange={(e) => setCompany({ ...company, county: e.target.value })}>
                    <option value="">—</option>
                    {COUNTIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <Field label="Adresă" error={fe.address} required>
                <Input name="address" value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} placeholder="Str. Exemplu nr. 1" />
              </Field>
              <Field label="Localitate" error={fe.city} required>
                <Input name="city" value={company.city} onChange={(e) => setCompany({ ...company, city: e.target.value })} placeholder="Cluj-Napoca / Sector 1" />
              </Field>
              <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm">
                <span>
                  <span className="font-medium">Plătitor de TVA</span>
                  <span className="block text-xs text-muted-foreground">Determină categoria TVA pe facturi (S vs. O)</span>
                </span>
                <Switch checked={company.vatPayer} onCheckedChange={(v) => setCompany({ ...company, vatPayer: v })} />
                <input type="hidden" name="vatPayer" value={company.vatPayer ? "true" : "false"} />
              </label>
              {state?.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger-soft-foreground">{state.error}</p>}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="lg" onClick={() => setStep(0)}>
                  <ArrowLeft /> Înapoi
                </Button>
                <Button type="submit" size="lg" variant="gradient" className="flex-1" loading={pending}>
                  Creează contul
                </Button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Ai deja cont?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Autentifică-te
        </Link>
      </p>
    </div>
  );
}
