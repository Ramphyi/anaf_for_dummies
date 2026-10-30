"use client";

import { Popover as P, Tooltip as T } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;
export const PopoverClose = P.Close;

export function PopoverContent({ className, align = "start", sideOffset = 6, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "anim-pop z-50 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lift outline-none",
          className,
        )}
        {...props}
      />
    </P.Portal>
  );
}

export const TooltipProvider = T.Provider;

export function Tooltip({
  content,
  children,
  side = "top",
  delay = 250,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  delay?: number;
}) {
  if (!content) return <>{children}</>;
  return (
    <T.Root delayDuration={delay}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="anim-pop z-[60] max-w-xs rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-lift"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
