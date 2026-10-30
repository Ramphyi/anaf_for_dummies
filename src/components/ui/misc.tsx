"use client";

import { Check, Minus } from "lucide-react";
import { Checkbox as C, Switch as S } from "radix-ui";
import * as React from "react";
import { cn, initials } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-input transition-colors duration-300 outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary",
        className,
      )}
      {...props}
    >
      <S.Thumb className="pointer-events-none block size-4 rounded-full bg-white shadow-md ring-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
    </S.Root>
  );
}

export function Checkbox({ className, ...props }: React.ComponentProps<typeof C.Root>) {
  return (
    <C.Root
      className={cn(
        "peer grid size-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border border-input bg-card shadow-sm transition-all outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        className,
      )}
      {...props}
    >
      <C.Indicator className="anim-pop">
        {props.checked === "indeterminate" ? <Minus className="size-3" strokeWidth={3} /> : <Check className="size-3" strokeWidth={3} />}
      </C.Indicator>
    </C.Root>
  );
}

export function Avatar({
  name,
  color,
  size = "md",
  className,
}: {
  name: string;
  color?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = { xs: "size-5 text-[9px]", sm: "size-7 text-[11px]", md: "size-9 text-xs", lg: "size-11 text-sm", xl: "size-16 text-lg" };
  const c = color ?? "#6d5dfc";
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold text-white ring-2 ring-card select-none", sizes[size], className)}
      style={{ background: `linear-gradient(135deg, ${c}, color-mix(in oklab, ${c} 60%, #000))` }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people, max = 4, size = "sm" }: { people: { name: string; color?: string | null }[]; max?: number; size?: "xs" | "sm" | "md" }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex -space-x-2">
      {shown.map((p, i) => (
        <Avatar key={`${p.name}-${i}`} name={p.name} color={p.color} size={size} />
      ))}
      {extra > 0 && (
        <span className={cn("inline-grid place-items-center rounded-full bg-muted font-semibold text-muted-foreground ring-2 ring-card", size === "xs" ? "size-5 text-[9px]" : size === "sm" ? "size-7 text-[11px]" : "size-9 text-xs")}>
          +{extra}
        </span>
      )}
    </div>
  );
}

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("skeleton rounded-lg", className)} {...props} />;
}

export function Separator({ className, vertical }: { className?: string; vertical?: boolean }) {
  return <div role="separator" className={cn("shrink-0 bg-border", vertical ? "h-full w-px" : "h-px w-full", className)} />;
}

export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border bg-muted px-1 font-sans text-[10.5px] font-medium text-muted-foreground shadow-[0_1px_0_0_var(--border)]",
        className,
      )}
      {...props}
    />
  );
}

export function Progress({ value, className, tone = "brand" }: { value: number; className?: string; tone?: "brand" | "success" | "warning" | "danger" }) {
  const colors = { brand: "bg-primary", success: "bg-success", warning: "bg-warning", danger: "bg-danger" };
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]", colors[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/** Cerc colorat (ex. culoare proiect). */
export function ColorDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ background: color }} />;
}
