"use client";

import { Check } from "lucide-react";
import { AnimatedBar } from "@/components/motion";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CategoryTotal = { category: string; amount: number; count: number };

/**
 * Cheltuieli pe categorii — bare orizontale ordonate (o singură serie, etichete directe).
 * Click pe o categorie → filtrează tabelul.
 */
export function CategoryBreakdown({
  data,
  active,
  onSelect,
}: {
  data: CategoryTotal[];
  active?: string | null;
  onSelect?: (category: string | null) => void;
}) {
  const total = data.reduce((s, d) => s + d.amount, 0);
  const max = Math.max(1, ...data.map((d) => d.amount));
  if (!data.length) return <p className="py-8 text-center text-sm text-muted-foreground">Nicio cheltuială în perioadă.</p>;
  return (
    <ul className="space-y-1">
      {data.map((d) => {
        const selected = active === d.category;
        const pct = total > 0 ? (d.amount / total) * 100 : 0;
        return (
          <li key={d.category}>
            <button
              type="button"
              onClick={() => onSelect?.(selected ? null : d.category)}
              className={cn(
                "group w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/60",
                selected && "bg-primary-soft hover:bg-primary-soft",
                active && !selected && "opacity-55 hover:opacity-100",
              )}
            >
              <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-1.5 truncate font-medium">
                  {selected && <Check className="size-3.5 text-primary" />}
                  {EXPENSE_CATEGORY_LABELS[d.category] ?? d.category}
                  <span className="text-xs font-normal text-muted-foreground">· {d.count}</span>
                </span>
                <span className="shrink-0 tabular">
                  {formatMoney(d.amount, "RON", { compact: true })}
                  <span className="ml-1.5 inline-block w-9 text-right text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                </span>
              </div>
              <AnimatedBar value={(d.amount / max) * 100} className="h-1.5 w-full overflow-hidden rounded-full bg-muted" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
