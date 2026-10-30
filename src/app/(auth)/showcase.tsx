"use client";

import { BadgeCheck, CalendarRange, FileText, ShieldCheck, Timer, TrendingUp, Wallet } from "lucide-react";
import { motion } from "motion/react";

const cards = [
  { icon: BadgeCheck, title: "FCT0142 validată de ANAF", sub: "e-Factura · index 5014729381", color: "var(--success)", x: "8%", y: "14%", delay: 0.2 },
  { icon: Wallet, title: "+ 24.890,00 RON încasați", sub: "Nimbus Digital SRL · transfer", color: "var(--primary)", x: "46%", y: "30%", delay: 0.45 },
  { icon: Timer, title: "38h 30m pontate săptămâna asta", sub: "Echipa Frontend · 96% facturabil", color: "var(--accent)", x: "12%", y: "52%", delay: 0.7 },
  { icon: CalendarRange, title: "Ana → Proiect Atlas (80%)", sub: "Planificare · săpt. 44–47", color: "var(--warning)", x: "40%", y: "72%", delay: 0.95 },
];

export function AuthShowcase() {
  return (
    <div className="relative hidden overflow-hidden border-l border-border bg-[#07070c] lg:block">
      <div className="absolute inset-0 bg-grid opacity-[0.35] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      <div className="absolute -top-1/4 -left-1/4 size-[70%] animate-aurora rounded-full bg-[#6d5dfc] opacity-40 blur-[120px]" />
      <div className="absolute -right-1/4 -bottom-1/4 size-[65%] animate-aurora rounded-full bg-[#06b6d4] opacity-30 blur-[120px] [animation-delay:-6s]" />
      <div className="absolute top-1/3 left-1/3 size-[40%] animate-aurora rounded-full bg-[#ec4899] opacity-20 blur-[120px] [animation-delay:-12s]" />

      <div className="relative flex h-full flex-col justify-between p-12 text-white">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
            <ShieldCheck className="size-3.5 text-emerald-400" /> Conectat direct la SPV ANAF prin OAuth2
          </div>
          <h2 className="mt-6 max-w-lg text-4xl leading-[1.1] font-semibold tracking-tight">
            Facturare, ANAF și echipa ta —{" "}
            <span className="bg-[linear-gradient(110deg,#a5b4fc,#67e8f9,#f0abfc)] bg-clip-text text-transparent">într-un singur loc.</span>
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/60">
            Emite facturi conforme CIUS-RO, trimite-le automat în e-Factura, importă cheltuielile din SPV și urmărește orele echipei pe fiecare proiect.
          </p>
        </motion.div>

        <div className="relative h-[46%]">
          {cards.map((c) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 30, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.8, delay: c.delay, ease: [0.16, 1, 0.3, 1] }}
              className="absolute"
              style={{ left: c.x, top: c.y }}
            >
              <div className="flex animate-float items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 shadow-2xl backdrop-blur-xl" style={{ animationDelay: `${c.delay * 2}s` }}>
                <div className="grid size-9 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${c.color} 25%, transparent)`, color: c.color }}>
                  <c.icon className="size-[18px]" />
                </div>
                <div>
                  <div className="text-sm font-medium">{c.title}</div>
                  <div className="text-xs text-white/50">{c.sub}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm">
          {[
            { icon: FileText, k: "UBL 2.1", v: "CIUS-RO 1.0.1" },
            { icon: TrendingUp, k: "Rapoarte", v: "TVA, restanțe, profit" },
            { icon: Timer, k: "Pontaj", v: "cronometru + aprobări" },
          ].map((s) => (
            <div key={s.k} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur">
              <s.icon className="size-4 text-white/60" />
              <div className="mt-2 font-semibold">{s.k}</div>
              <div className="text-xs text-white/50">{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
