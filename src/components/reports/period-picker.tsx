"use client";

import { CalendarRange, Check, ChevronDown, Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PERIOD_PRESETS, periodLabel, presetRange, type PeriodPreset } from "@/lib/reports/period";
import { cn } from "@/lib/utils";

/** Selector de perioadă (presetări + interval personalizat), sincronizat cu `?from=&to=`. */
export function PeriodPicker({ from, to, preset, className }: { from: string; to: string; preset: PeriodPreset; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [custom, setCustom] = React.useState({ from, to });

  React.useEffect(() => setCustom({ from, to }), [from, to]);

  const apply = (range: { from: string; to: string }) => {
    const next = new URLSearchParams(params.toString());
    next.set("from", range.from);
    next.set("to", range.to);
    setOpen(false);
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  const current = PERIOD_PRESETS.find((p) => p.value === preset);
  const invalid = !custom.from || !custom.to || custom.from > custom.to;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("max-w-full justify-between gap-2", className)}>
          {pending ? <Loader2 className="animate-spin" /> : <CalendarRange />}
          <span className="truncate">
            {current ? <span className="font-semibold">{current.label}</span> : null}
            <span className={cn(current && "ml-1.5 hidden text-muted-foreground sm:inline")}>{periodLabel(from, to)}</span>
          </span>
          <ChevronDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="p-1.5">
          {PERIOD_PRESETS.map((p) => {
            const r = presetRange(p.value);
            const active = p.value === preset;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => apply(r)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
                  active && "bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft",
                )}
              >
                <span className="font-medium">{p.label}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {periodLabel(r.from, r.to)}
                  {active && <Check className="size-3.5 text-primary" />}
                </span>
              </button>
            );
          })}
        </div>
        <form
          className="space-y-3 border-t border-border bg-subtle/60 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) apply(custom);
          }}
        >
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Interval personalizat</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="De la">
              <Input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="h-8" />
            </Field>
            <Field label="Până la">
              <Input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="h-8" />
            </Field>
          </div>
          <Button type="submit" size="sm" className="w-full" disabled={invalid}>
            Aplică intervalul
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
