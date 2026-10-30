"use client";

import { ArrowUpRight, Banknote, Boxes, Clock, Landmark, PiggyBank, Receipt, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { AnimatedNumber, Stagger, StaggerItem } from "@/components/motion";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  sales: TrendingUp,
  vat: Landmark,
  cashflow: Wallet,
  overdue: Clock,
  cash: Banknote,
  profit: PiggyBank,
  hours: Receipt,
  stock: Boxes,
};

export type HubCard = {
  href: string;
  icon: keyof typeof ICONS | string;
  title: string;
  description: string;
  metric: { label: string; value: number; kind: "money" | "hours" | "percent" | "number"; tone?: "brand" | "success" | "warning" | "danger" | "info" };
  note?: string;
  noteTone?: "success" | "danger" | "muted";
  color: string;
};

const fmt = {
  money: (n: number) => formatMoney(n).replace(/,\d{2}(?=\s)/, ""),
  hours: (n: number) => `${Math.round(n).toLocaleString("ro-RO")} h`,
  percent: (n: number) => `${n.toFixed(0)}%`,
  number: (n: number) => Math.round(n).toLocaleString("ro-RO"),
};

export function ReportHubGrid({ cards }: { cards: HubCard[] }) {
  return (
    <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" stagger={0.045}>
      {cards.map((c) => {
        const Icon = ICONS[c.icon] ?? TrendingUp;
        return (
          <StaggerItem key={c.href} className="h-full">
            <Link
              href={c.href}
              className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card p-5 shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lift focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <div
                className="pointer-events-none absolute -top-16 -right-16 size-40 rounded-full opacity-40 blur-3xl transition-opacity duration-500 group-hover:opacity-70"
                style={{ background: c.color }}
              />
              <div className="relative flex items-start justify-between gap-3">
                <div
                  className="grid size-10 place-items-center rounded-xl text-white shadow-sm transition-transform duration-300 group-hover:scale-105 [&_svg]:size-5"
                  style={{ background: `linear-gradient(135deg, ${c.color}, color-mix(in oklab, ${c.color} 65%, #000))` }}
                >
                  <Icon />
                </div>
                <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
              </div>
              <h3 className="relative mt-4 text-[15px] font-semibold tracking-tight">{c.title}</h3>
              <p className="relative mt-1 flex-1 text-sm leading-snug text-muted-foreground">{c.description}</p>
              <div className="relative mt-4 border-t border-border pt-3">
                <div className="text-xs text-muted-foreground">{c.metric.label}</div>
                <div className="mt-0.5 flex items-baseline justify-between gap-2">
                  <span className="text-xl font-semibold tracking-tight">
                    <AnimatedNumber value={c.metric.value} format={fmt[c.metric.kind]} />
                  </span>
                  {c.note && (
                    <span
                      className={cn(
                        "truncate text-xs font-medium",
                        c.noteTone === "success" ? "text-success" : c.noteTone === "danger" ? "text-danger" : "text-muted-foreground",
                      )}
                    >
                      {c.note}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}
