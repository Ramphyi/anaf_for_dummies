"use client";

import { Command } from "cmdk";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { inputBase } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ComboOption = { value: string; label: string; description?: string; keywords?: string[]; icon?: React.ReactNode };

/** Select cu căutare (cmdk). Opțional: creare rapidă a unei valori noi. */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Selectează…",
  searchPlaceholder = "Caută…",
  emptyText = "Niciun rezultat",
  onCreate,
  createLabel = "Adaugă",
  className,
  disabled,
  name,
  invalid,
  allowClear,
}: {
  options: ComboOption[];
  value: string | null | undefined;
  onChange: (value: string, option?: ComboOption) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  onCreate?: (query: string) => void;
  createLabel?: string;
  className?: string;
  disabled?: boolean;
  name?: string;
  invalid?: boolean;
  allowClear?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {name && <input type="hidden" name={name} value={value ?? ""} />}
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-invalid={invalid || undefined}
          className={cn(inputBase, "items-center justify-between gap-2 text-left", !selected && "text-muted-foreground/70", className)}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            {selected?.icon}
            <span className="truncate">{selected?.label ?? placeholder}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0" align="start">
        <Command
          filter={(v, search, keywords) => {
            const norm = (s: string) =>
              s
                .toLowerCase()
                .normalize("NFD")
                .replace(/[̀-ͯ]/g, "");
            const hay = norm([v, ...(keywords ?? [])].join(" "));
            return norm(search)
              .split(/\s+/)
              .every((t) => hay.includes(t))
              ? 1
              : 0;
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 text-muted-foreground" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder={searchPlaceholder}
              className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="scrollbar-thin max-h-72 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</Command.Empty>
            {allowClear && value && (
              <Command.Item
                value="__clear__"
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground data-[selected=true]:bg-muted"
              >
                — Fără selecție —
              </Command.Item>
            )}
            {options.map((o) => (
              <Command.Item
                key={o.value}
                value={`${o.label} ${o.value}`}
                keywords={[o.description ?? "", ...(o.keywords ?? [])]}
                onSelect={() => {
                  onChange(o.value, o);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm data-[selected=true]:bg-muted"
              >
                {o.icon}
                <div className="min-w-0 flex-1">
                  <div className="truncate">{o.label}</div>
                  {o.description && <div className="truncate text-xs text-muted-foreground">{o.description}</div>}
                </div>
                {o.value === value && <Check className="size-4 text-primary" />}
              </Command.Item>
            ))}
            {onCreate && query.trim() && (
              <Command.Item
                value={`__create__ ${query}`}
                onSelect={() => {
                  onCreate(query.trim());
                  setOpen(false);
                  setQuery("");
                }}
                className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border-t border-border px-2.5 py-2 text-sm text-primary data-[selected=true]:bg-primary-soft"
              >
                <Plus className="size-4" /> {createLabel} „{query.trim()}”
              </Command.Item>
            )}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
