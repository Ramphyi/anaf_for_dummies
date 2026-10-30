"use client";

import { Command } from "cmdk";
import { ArrowRight, FileText, FolderKanban, Loader2, Moon, Package, Plus, Search, Sparkles, Sun, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Dialog as D } from "radix-ui";
import { Kbd } from "@/components/ui/misc";
import { useAssistant } from "@/components/assistant/assistant-widget";
import { useVisibleNav } from "./sidebar";
import { useThemeSwitch } from "./theme-toggle";
import type { ShellData } from "./types";

type SearchHit = { type: "invoice" | "client" | "product" | "project"; id: string; title: string; subtitle?: string; href: string };

const HIT_ICONS = { invoice: FileText, client: Users, product: Package, project: FolderKanban };

const QUICK_ACTIONS = [
  { label: "Factură nouă", href: "/facturi/nou", keywords: "emite factura noua", permission: "billing" },
  { label: "Proformă nouă", href: "/proforme/nou", keywords: "oferta", permission: "billing" },
  { label: "Client nou", href: "/clienti?nou=1", keywords: "adauga client", permission: "billing" },
  { label: "Produs nou", href: "/produse?nou=1", keywords: "articol serviciu", permission: "billing" },
  { label: "Cheltuială nouă", href: "/cheltuieli/nou", keywords: "factura primita", permission: "billing" },
  { label: "Pontează ore", href: "/pontaj", keywords: "timesheet ore", permission: "timesheet.own" },
  { label: "Proiect nou", href: "/proiecte?nou=1", keywords: "project", permission: "projects.manage" },
  { label: "Sincronizează SPV", href: "/efactura?sync=1", keywords: "anaf mesaje", permission: "anaf" },
] as const;

export function CommandMenu({ data, open, setOpen }: { data: ShellData; open: boolean; setOpen: (o: boolean) => void }) {
  const router = useRouter();
  const groups = useVisibleNav(data.permissions);
  const { change, resolvedTheme } = useThemeSwitch();
  const assistant = useAssistant();
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (res.ok) setHits(((await res.json()) as { hits: SearchHit[] }).hits);
      } catch {
        /* abort */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const itemCls =
    "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground/90 data-[selected=true]:bg-muted data-[selected=true]:text-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground";
  const groupCls =
    "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase";

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="anim-overlay fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <D.Content className="anim-dialog fixed top-[38%] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-popover shadow-lift">
          <D.Title className="sr-only">Căutare rapidă</D.Title>
          <Command loop shouldFilter={true}>
            <div className="flex items-center gap-3 border-b border-border px-4">
              {loading ? <Loader2 className="size-4 animate-spin text-primary" /> : <Search className="size-4 text-muted-foreground" />}
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Caută facturi, clienți, produse, proiecte sau comenzi…"
                className="h-13 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
              />
              <Kbd>ESC</Kbd>
            </div>
            <Command.List className="scrollbar-thin max-h-[min(60vh,440px)] overflow-y-auto p-2">
              <Command.Empty className="py-10 text-center text-sm text-muted-foreground">Niciun rezultat pentru „{query}”.</Command.Empty>
              {hits.length > 0 && (
                <Command.Group heading="Rezultate" className={groupCls}>
                  {hits.map((h) => {
                    const Icon = HIT_ICONS[h.type];
                    return (
                      <Command.Item key={`${h.type}-${h.id}`} value={`${h.title} ${h.subtitle ?? ""} ${h.id}`} keywords={[query]} onSelect={() => go(h.href)} className={itemCls}>
                        <Icon />
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{h.title}</div>
                          {h.subtitle && <div className="truncate text-xs text-muted-foreground">{h.subtitle}</div>}
                        </div>
                        <ArrowRight className="opacity-0 transition-opacity [[data-selected=true]_&]:opacity-100" />
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}
              {query.trim().length > 3 && (
                <Command.Group heading="Asistent AI" className={groupCls}>
                  <Command.Item
                    value={`ai ${query}`}
                    keywords={[query]}
                    onSelect={() => {
                      setOpen(false);
                      assistant.ask(query);
                    }}
                    className={itemCls}
                  >
                    <Sparkles className="!text-primary" />
                    <span className="truncate">Întreabă Asistent AI: „{query}”</span>
                  </Command.Item>
                </Command.Group>
              )}
              <Command.Group heading="Acțiuni rapide" className={groupCls}>
                {QUICK_ACTIONS.filter((a) => data.permissions.includes(a.permission)).map((a) => (
                  <Command.Item key={a.href} value={`${a.label} ${a.keywords}`} onSelect={() => go(a.href)} className={itemCls}>
                    <Plus />
                    {a.label}
                  </Command.Item>
                ))}
                <Command.Item
                  value="schimba tema dark light intunecat luminos"
                  onSelect={() => {
                    setOpen(false);
                    change(resolvedTheme === "dark" ? "light" : "dark");
                  }}
                  className={itemCls}
                >
                  {resolvedTheme === "dark" ? <Sun /> : <Moon />}
                  Comută tema {resolvedTheme === "dark" ? "luminoasă" : "întunecată"}
                </Command.Item>
              </Command.Group>
              {groups.map((g) => (
                <Command.Group key={g.label} heading={g.label} className={groupCls}>
                  {g.items.map((i) => (
                    <Command.Item key={i.href} value={`${i.label} ${(i.keywords ?? []).join(" ")}`} onSelect={() => go(i.href)} className={itemCls}>
                      <i.icon />
                      {i.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
            <div className="flex items-center gap-3 border-t border-border bg-subtle/60 px-4 py-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> navighează
              </span>
              <span className="flex items-center gap-1">
                <Kbd>↵</Kbd> deschide
              </span>
              <span className="ml-auto flex items-center gap-1">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </span>
            </div>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
