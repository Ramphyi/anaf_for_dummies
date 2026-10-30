"use client";

import { ArrowRight, Eye, EyeOff, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { loginAction, type AuthState } from "../actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(loginAction, undefined);
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
      <h1 className="text-3xl font-semibold tracking-tight">Bine ai revenit 👋</h1>
      <p className="mt-2 text-sm text-muted-foreground">Autentifică-te pentru a-ți gestiona facturile, SPV-ul și echipa.</p>

      <button
        type="button"
        onClick={() => {
          setEmail("demo@anaffordummies.ro");
          setPassword("demo1234");
        }}
        className="group mt-6 flex w-full items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary-soft/50 px-4 py-3 text-left text-sm transition-all hover:border-primary hover:bg-primary-soft"
      >
        <Sparkles className="size-4 text-primary transition-transform group-hover:rotate-12" />
        <span className="flex-1">
          <span className="font-medium text-primary-soft-foreground">Cont demo</span>
          <span className="block text-xs text-muted-foreground">demo@anaffordummies.ro · demo1234 — click pentru completare</span>
        </span>
      </button>

      <form action={action} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next} />
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nume@firma.ro" className="h-11" />
        </Field>
        <Field label="Parolă" htmlFor="password">
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 pr-10"
            />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        {state?.error && (
          <motion.p initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }} className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger-soft-foreground">
            {state.error}
          </motion.p>
        )}
        <Button type="submit" size="lg" variant="gradient" className="group w-full" loading={pending}>
          Intră în cont <ArrowRight className="transition-transform group-hover:translate-x-1" />
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Nu ai cont?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Creează unul gratuit
        </Link>
      </p>
    </motion.div>
  );
}
