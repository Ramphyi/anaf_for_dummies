import * as React from "react";
import { cn } from "@/lib/utils";

export const inputBase =
  "flex h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 py-1 text-sm text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.03)] transition-[border-color,box-shadow] duration-200 outline-none placeholder:text-muted-foreground/70 hover:border-muted-foreground/40 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-danger/15";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(inputBase, type === "number" && "tabular", "file:border-0 file:bg-transparent file:text-sm file:font-medium", className)}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(inputBase, "min-h-20 resize-y py-2 leading-relaxed", className)} {...props} />;
}

export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative w-full">
      <select
        className={cn(
          inputBase,
          "cursor-pointer appearance-none pr-8 [&>option]:bg-card [&>option]:text-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m7 15 5 5 5-5" />
        <path d="m7 9 5-5 5 5" />
      </svg>
    </div>
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-[13px] font-medium text-foreground/90 select-none", className)} {...props} />;
}

/** Câmp de formular: etichetă + control + text ajutător / eroare. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label?: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      {label && (
        <Label htmlFor={htmlFor}>
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </Label>
      )}
      {children}
      {error ? (
        <p className="anim-fade-up text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Input cu sufix/prefix (ex. „RON”, „%”, „h”). */
export function InputGroup({
  prefix,
  suffix,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "prefix"> & { prefix?: React.ReactNode; suffix?: React.ReactNode }) {
  return (
    <div className="relative flex w-full items-center">
      {prefix && <span className="pointer-events-none absolute left-3 text-sm text-muted-foreground [&_svg]:size-4">{prefix}</span>}
      <Input className={cn(prefix && "pl-9", suffix && "pr-12", className)} {...props} />
      {suffix && <span className="pointer-events-none absolute right-3 text-xs font-medium text-muted-foreground">{suffix}</span>}
    </div>
  );
}
