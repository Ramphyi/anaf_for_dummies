"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_0_0_rgb(255_255_255/0.15)_inset,0_1px_2px_0_rgb(0_0_0/0.1)] hover:bg-primary-hover hover:shadow-glow",
        gradient:
          "bg-[linear-gradient(110deg,var(--primary),var(--accent),var(--primary))] bg-[length:200%_auto] text-white shadow-glow hover:bg-[position:100%_0] transition-[background-position,transform] duration-500",
        secondary: "bg-muted text-foreground hover:bg-muted/70 dark:hover:bg-muted/80",
        outline: "border border-border bg-card text-foreground shadow-soft hover:border-input hover:bg-muted/60",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        soft: "bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft/70",
        destructive: "bg-danger text-white hover:bg-danger/90",
        "destructive-soft": "bg-danger-soft text-danger-soft-foreground hover:bg-danger-soft/70",
        success: "bg-success text-white hover:bg-success/90",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        xs: "h-7 rounded-md px-2 text-xs [&_svg]:size-3.5",
        sm: "h-8 px-3 text-[13px]",
        default: "h-9 px-4",
        lg: "h-11 px-6 text-[15px]",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-xs": "size-7 rounded-md",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

export function Button({ className, variant, size, asChild, loading, disabled, children, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" />}
          {children}
        </>
      )}
    </Comp>
  );
}
