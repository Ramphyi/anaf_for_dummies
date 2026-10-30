"use client";

import { X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  children,
  size = "md",
  hideClose,
  ...props
}: React.ComponentProps<typeof D.Content> & { size?: "sm" | "md" | "lg" | "xl" | "2xl"; hideClose?: boolean }) {
  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl", "2xl": "max-w-6xl" };
  return (
    <D.Portal>
      <D.Overlay className="anim-overlay fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] dark:bg-black/60" />
      <D.Content
        className={cn(
          "anim-dialog fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-lift",
          widths[size],
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <D.Close className="absolute top-4 right-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="size-4" />
            <span className="sr-only">Închide</span>
          </D.Close>
        )}
      </D.Content>
    </D.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 px-6 pt-6 pb-4 pr-12", className)} {...props} />;
}

export function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("scrollbar-thin flex-1 overflow-y-auto px-6 pb-4", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2 border-t border-border bg-subtle/60 px-6 py-4 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof D.Title>) {
  return <D.Title className={cn("text-lg font-semibold tracking-tight", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentProps<typeof D.Description>) {
  return <D.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

/* ------------------------------- Sheet ------------------------------- */

export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;
export const SheetClose = D.Close;

export function SheetContent({
  side = "right",
  className,
  children,
  ...props
}: React.ComponentProps<typeof D.Content> & { side?: "left" | "right" }) {
  return (
    <D.Portal>
      <D.Overlay className="anim-overlay fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] dark:bg-black/60" />
      <D.Content
        className={cn(
          "fixed inset-y-0 z-50 flex w-full flex-col border-border bg-popover shadow-lift sm:max-w-lg",
          side === "right" ? "anim-sheet-right right-0 border-l" : "anim-sheet-left left-0 border-r",
          className,
        )}
        {...props}
      >
        {children}
        <D.Close className="absolute top-4 right-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <X className="size-4" />
          <span className="sr-only">Închide</span>
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
