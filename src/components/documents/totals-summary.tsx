"use client";

import { AnimatePresence, motion } from "motion/react";
import { AnimatedNumber } from "@/components/motion";
import { VAT_CATEGORY_LABELS } from "@/lib/constants";
import type { DocumentTotals } from "@/lib/documents/totals";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

function Row({ label, value, muted, className }: { label: React.ReactNode; value: React.ReactNode; muted?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 text-sm", muted && "text-muted-foreground", className)}>
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 font-medium tabular">{value}</span>
    </div>
  );
}

/** Sumarul totalurilor cu defalcarea TVA pe categorii/cote (calcul live). */
export function TotalsSummary({ totals, currency, exchangeRate }: { totals: DocumentTotals; currency: string; exchangeRate: number }) {
  const money = (n: number) => formatMoney(n, currency);
  return (
    <div className="space-y-2.5">
      <Row label="Subtotal fără TVA" value={money(totals.subtotal + totals.discountTotal)} muted />
      <AnimatePresence initial={false}>
        {totals.discountTotal > 0 && (
          <motion.div key="disc" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Row label="Discount" value={`−${money(totals.discountTotal)}`} className="text-success" />
          </motion.div>
        )}
      </AnimatePresence>
      <Row label="Bază impozabilă" value={money(totals.subtotal)} />
      <div className="space-y-1.5 rounded-lg bg-muted/50 p-2.5">
        <AnimatePresence initial={false}>
          {totals.breakdown.length === 0 ? (
            <p key="none" className="text-xs text-muted-foreground">
              Fără TVA
            </p>
          ) : (
            totals.breakdown.map((b) => (
              <motion.div
                key={`${b.category}-${b.rate}`}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <span className="min-w-0 text-muted-foreground" title={VAT_CATEGORY_LABELS[b.category]}>
                  <span className="block truncate font-medium text-foreground/80">
                    {b.category === "S" ? `TVA ${b.rate}%` : (VAT_CATEGORY_LABELS[b.category]?.split(" — ")[1] ?? b.category)}
                  </span>
                  <span className="block truncate opacity-80">bază {money(b.taxable)}</span>
                </span>
                <span className="shrink-0 font-medium text-foreground tabular">{money(b.vat)}</span>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
      <Row label="Total TVA" value={money(totals.vatTotal)} />
      <div className="border-t border-border pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-sm font-semibold whitespace-nowrap">Total de plată</span>
          <span className="ml-auto text-[22px] font-semibold tracking-tight whitespace-nowrap tabular">
            <AnimatedNumber value={totals.total} format={money} duration={0.5} />
          </span>
        </div>
        {currency !== "RON" && exchangeRate > 0 && (
          <p className="mt-1 text-right text-xs text-muted-foreground tabular">
            ≈ {formatMoney(totals.total * exchangeRate, "RON")} · curs {exchangeRate.toLocaleString("ro-RO", { maximumFractionDigits: 4 })}
          </p>
        )}
      </div>
    </div>
  );
}
