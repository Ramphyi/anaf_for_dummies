"use client";

import { motion } from "motion/react";
import Link from "next/link";
import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Antetul unei pagini: titlu, descriere, breadcrumbs și acțiuni. */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  icon,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}
    >
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
            {breadcrumbs.map((b, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight className="size-3 opacity-60" />}
                {b.href ? (
                  <Link href={b.href} className="transition-colors hover:text-foreground">
                    {b.label}
                  </Link>
                ) : (
                  <span className="text-foreground/80">{b.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-3">
          {icon && (
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-white shadow-glow [&_svg]:size-5">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.div>
  );
}

/** Stare goală prietenoasă, cu ilustrație animată. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-4 py-8" : "px-6 py-16", className)}>
      {icon && (
        <div className="relative mb-4">
          <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl" />
          <div className="relative grid size-14 animate-float place-items-center rounded-2xl border border-border bg-card text-primary shadow-soft [&_svg]:size-6">
            {icon}
          </div>
        </div>
      )}
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Rând etichetă/valoare (pentru detalii). */
export function DetailRow({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 py-2 text-sm", className)}>
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium break-words">{children}</span>
    </div>
  );
}
