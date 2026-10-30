import * as React from "react";
import type { Tone } from "@/lib/constants";
import { cn } from "@/lib/utils";

const tones: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  info: "bg-info-soft text-info-soft-foreground ring-info/20",
  success: "bg-success-soft text-success-soft-foreground ring-success/20",
  warning: "bg-warning-soft text-warning-soft-foreground ring-warning/20",
  danger: "bg-danger-soft text-danger-soft-foreground ring-danger/20",
  brand: "bg-primary-soft text-primary-soft-foreground ring-primary/20",
};

const dots: Record<Tone, string> = {
  neutral: "bg-muted-foreground/60",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  brand: "bg-primary",
};

export function Badge({
  tone = "neutral",
  dot,
  pulse,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { tone?: Tone; dot?: boolean; pulse?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] leading-5 font-medium whitespace-nowrap ring-1 ring-inset",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && (
        <span className="relative flex size-1.5">
          {pulse && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", dots[tone])} />}
          <span className={cn("relative inline-flex size-1.5 rounded-full", dots[tone])} />
        </span>
      )}
      {children}
    </span>
  );
}

/** Badge pentru o valoare dintr-un dicționar de statusuri (ex. DOC_STATUS). */
export function StatusBadge({
  status,
  map,
  pulse,
  className,
}: {
  status: string;
  map: Record<string, { label: string; tone: Tone }>;
  pulse?: boolean;
  className?: string;
}) {
  const s = map[status] ?? { label: status, tone: "neutral" as Tone };
  return (
    <Badge tone={s.tone} dot pulse={pulse} className={className}>
      {s.label}
    </Badge>
  );
}
