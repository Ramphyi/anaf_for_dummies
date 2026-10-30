"use client";

import { ArrowLeft, Printer } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui/button";

/** Bară flotantă pentru paginile de tipărire (ascunsă la print). */
export function PrintToolbar({ backHref, label, autoPrint }: { backHref?: string; label: string; autoPrint?: boolean }) {
  React.useEffect(() => {
    if (!autoPrint) return;
    const t = setTimeout(() => window.print(), 500);
    return () => clearTimeout(t);
  }, [autoPrint]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="no-print fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-2xl border border-border bg-card/90 p-2 shadow-lift backdrop-blur sm:right-6 sm:bottom-6"
    >
      {backHref && (
        <Button variant="ghost" size="sm" asChild>
          <Link href={backHref}>
            <ArrowLeft /> Înapoi
          </Link>
        </Button>
      )}
      <span className="hidden max-w-56 truncate px-1 text-xs text-muted-foreground sm:inline">{label}</span>
      <Button size="sm" onClick={() => window.print()}>
        <Printer /> Tipărește / Salvează PDF
      </Button>
    </motion.div>
  );
}
