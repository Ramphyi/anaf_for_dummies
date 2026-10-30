"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import type { ComboOption } from "@/components/ui/combobox";
import { InputGroup } from "@/components/ui/input";
import { Avatar, ColorDot } from "@/components/ui/misc";
import { PALETTE } from "@/lib/constants";
import type { MemberLite, ProjectLite } from "@/lib/outsourcing/types";
import { cn } from "@/lib/utils";

/* ------------------------------- Opțiuni combobox ------------------------------- */

export function memberOptions(members: Pick<MemberLite, "id" | "name" | "color" | "position">[]): ComboOption[] {
  return members.map((m) => ({
    value: m.id,
    label: m.name,
    description: m.position ?? undefined,
    icon: <Avatar name={m.name} color={m.color} size="xs" />,
  }));
}

export function projectOptions(projects: Pick<ProjectLite, "id" | "name" | "code" | "color" | "clientName">[]): ComboOption[] {
  return projects.map((p) => ({
    value: p.id,
    label: p.name,
    description: [p.code, p.clientName].filter(Boolean).join(" · ") || undefined,
    keywords: [p.code ?? ""],
    icon: <ColorDot color={p.color} />,
  }));
}

/* ------------------------------- Selector culoare ------------------------------- */

export function ColorPicker({ value, onChange, colors = PALETTE }: { value: string; onChange: (c: string) => void; colors?: readonly string[] }) {
  const id = React.useId();
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {colors.map((c) => {
        const active = c.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={c}
            onClick={() => onChange(c)}
            className="relative grid size-7 place-items-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none"
          >
            {active && (
              <motion.span
                layoutId={`color-${id}`}
                className="absolute -inset-1 rounded-full ring-2 ring-foreground/70"
                transition={{ type: "spring", bounce: 0.25, duration: 0.4 }}
              />
            )}
            <span className="size-7 rounded-full shadow-sm ring-1 ring-black/10" style={{ background: c }} />
            {active && <Check className="absolute size-3.5 text-white" strokeWidth={3} />}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------- Input zecimal ------------------------------- */

function toText(v: number | null | undefined) {
  return v === null || v === undefined || Number.isNaN(v) ? "" : String(v).replace(".", ",");
}

/** Input numeric tolerant (acceptă „1,5” și „1.5”); emite `number | null`. */
export function DecimalInput({
  value,
  onChange,
  suffix,
  prefix,
  placeholder,
  className,
  id,
  min = 0,
  invalid,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  suffix?: React.ReactNode;
  prefix?: string;
  placeholder?: string;
  className?: string;
  id?: string;
  min?: number;
  invalid?: boolean;
}) {
  const [text, setText] = React.useState(toText(value));
  const last = React.useRef(value);
  React.useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(toText(value));
    }
  }, [value]);
  return (
    <InputGroup
      id={id}
      inputMode="decimal"
      value={text}
      prefix={prefix}
      suffix={suffix}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      className={cn("tabular", className)}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.,-]/g, "");
        setText(raw);
        const n = raw.trim() === "" ? null : Number(raw.replace(",", "."));
        const v = n === null || Number.isNaN(n) ? null : Math.max(min, n);
        last.current = v;
        onChange(v);
      }}
    />
  );
}

/* ------------------------------- Stare în URL ------------------------------- */

/**
 * Stare sincronizată cu un parametru din URL, fără navigare (history.replaceState).
 * Ideal pentru filtre/vizualizări client-side care trebuie să fie partajabile.
 */
export function useUrlState<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
  const params = useSearchParams();
  const [value, setValue] = React.useState<T>(() => (params.get(key) as T) || fallback);
  const update = React.useCallback(
    (v: T) => {
      setValue(v);
      const url = new URL(window.location.href);
      if (!v || v === fallback) url.searchParams.delete(key);
      else url.searchParams.set(key, v);
      window.history.replaceState(window.history.state, "", url);
    },
    [key, fallback],
  );
  return [value, update];
}

/** Deschide un dialog când URL-ul conține `?nou=1` (apoi curăță parametrul). */
export function useOpenFromUrl(param = "nou"): [boolean, (o: boolean) => void] {
  const params = useSearchParams();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (params.get(param) === "1") {
      setOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete(param);
      window.history.replaceState(window.history.state, "", url);
    }
  }, [params, param]);
  return [open, setOpen];
}

/* ------------------------------- Mici elemente ------------------------------- */

export function ProjectLabel({ name, color, code, className }: { name: string; color: string; code?: string | null; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <ColorDot color={color} />
      <span className="truncate">{name}</span>
      {code && <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{code}</span>}
    </span>
  );
}

/** Pastilă discretă pentru chip-uri (competențe etc.). */
export function Chip({ children, className, onRemove }: { children: React.ReactNode; className?: string; onRemove?: () => void }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-0.5 text-xs font-medium", className)}>
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} className="-mr-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Elimină">
          ×
        </button>
      )}
    </span>
  );
}
