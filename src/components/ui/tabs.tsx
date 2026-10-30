"use client";

import { motion } from "motion/react";
import { Tabs as T } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

const TabsCtx = React.createContext<{ value: string; id: string }>({ value: "", id: "" });

/** Tab-uri cu indicator animat (shared layout). */
export function Tabs({
  value: controlled,
  defaultValue,
  onValueChange,
  className,
  ...props
}: React.ComponentProps<typeof T.Root>) {
  const [inner, setInner] = React.useState(defaultValue ?? "");
  const value = controlled ?? inner;
  const id = React.useId();
  return (
    <TabsCtx.Provider value={{ value, id }}>
      <T.Root
        value={value}
        onValueChange={(v) => {
          setInner(v);
          onValueChange?.(v);
        }}
        className={cn("flex flex-col gap-4", className)}
        {...props}
      />
    </TabsCtx.Provider>
  );
}

export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return (
    <T.List
      className={cn(
        "scrollbar-thin inline-flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-border bg-muted/60 p-1",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, children, value, ...props }: React.ComponentProps<typeof T.Trigger>) {
  const ctx = React.useContext(TabsCtx);
  const active = ctx.value === value;
  return (
    <T.Trigger
      value={value}
      className={cn(
        "relative inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground data-[state=active]:text-foreground [&_svg]:size-4",
        className,
      )}
      {...props}
    >
      {active && (
        <motion.span
          layoutId={`tab-${ctx.id}`}
          className="absolute inset-0 rounded-lg bg-card shadow-soft ring-1 ring-border"
          transition={{ type: "spring", bounce: 0.18, duration: 0.45 }}
        />
      )}
      <span className="relative z-10 inline-flex items-center gap-1.5">{children}</span>
    </T.Trigger>
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof T.Content>) {
  return <T.Content className={cn("anim-fade-up outline-none", className)} {...props} />;
}

/** Control segmentat (fără conținut asociat) — pentru comutare de vizualizări. */
export function Segmented<V extends string>({
  value,
  onChange,
  options,
  className,
  size = "default",
}: {
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: React.ReactNode; icon?: React.ReactNode }[];
  className?: string;
  size?: "sm" | "default";
}) {
  const id = React.useId();
  return (
    <div className={cn("inline-flex items-center gap-0.5 rounded-xl border border-border bg-muted/60 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "relative inline-flex items-center gap-1.5 rounded-lg px-3 font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-4",
            size === "sm" ? "h-7 text-xs" : "h-8 text-[13px]",
            value === o.value && "text-foreground",
          )}
        >
          {value === o.value && (
            <motion.span
              layoutId={`seg-${id}`}
              className="absolute inset-0 rounded-lg bg-card shadow-soft ring-1 ring-border"
              transition={{ type: "spring", bounce: 0.18, duration: 0.45 }}
            />
          )}
          <span className="relative z-10 inline-flex items-center gap-1.5">
            {o.icon}
            {o.label}
          </span>
        </button>
      ))}
    </div>
  );
}
