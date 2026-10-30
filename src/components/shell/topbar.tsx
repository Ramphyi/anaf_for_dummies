"use client";

import { Bell, Building2, Check, ChevronDown, FileText, LogOut, Menu, Plus, Search, Settings, Timer, User, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, Kbd } from "@/components/ui/misc";
import { ROLE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { logoutAction, switchCompanyAction } from "@/app/(app)/shell-actions";
import { useAssistant } from "@/components/assistant/assistant-widget";
import { AssistantOrb } from "@/components/assistant/orb";
import { NAV } from "./nav";
import { ThemeToggle } from "./theme-toggle";
import type { ShellData } from "./types";

function useCurrentTitle() {
  const pathname = usePathname();
  for (const g of NAV) for (const i of g.items) if (pathname === i.href || pathname.startsWith(`${i.href}/`)) return { group: g.label, item: i };
  return null;
}

export function Topbar({ data, onMenu, onSearch }: { data: ShellData; onMenu: () => void; onSearch: () => void }) {
  const current = useCurrentTitle();
  const assistant = useAssistant();
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const can = (p: string) => data.permissions.includes(p as never);
  const totalNotif = (data.badges.spvUnread ?? 0) + (data.badges.overdue ?? 0) + (data.badges.approvals ?? 0) + (data.badges.efacturaErrors ?? 0);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 transition-[background-color,border-color,box-shadow] duration-300 sm:px-6",
        scrolled ? "glass border-border shadow-soft" : "border-transparent bg-background",
      )}
    >
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onMenu} aria-label="Meniu">
        <Menu />
      </Button>

      {current && (
        <div className="hidden min-w-0 items-center gap-2 text-sm md:flex">
          <span className="text-muted-foreground">{current.group}</span>
          <span className="text-muted-foreground/50">/</span>
          <span className="truncate font-medium">{current.item.label}</span>
        </div>
      )}

      <button
        onClick={onSearch}
        className="group ml-auto hidden h-9 w-full max-w-72 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground shadow-soft transition-all hover:border-input hover:text-foreground sm:flex md:ml-6 lg:ml-auto"
      >
        <Search className="size-4 transition-transform group-hover:scale-110" />
        <span className="flex-1 truncate text-left">Caută sau rulează o comandă…</span>
        <span className="hidden items-center gap-0.5 sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="ml-auto flex items-center gap-1 sm:ml-0">
        <Button variant="ghost" size="icon-sm" className="sm:hidden" onClick={onSearch} aria-label="Caută">
          <Search />
        </Button>
        <button onClick={assistant.toggle} className="grid size-8 place-items-center rounded-lg transition-colors hover:bg-muted sm:hidden" aria-label="Asistent AI">
          <AssistantOrb size={24} active={assistant.chat.streaming} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="gradient" className="hidden sm:inline-flex">
              <Plus /> Nou
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            {can("billing") && (
              <>
                <DropdownMenuLabel>Documente</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link href="/facturi/nou">
                    <FileText /> Factură
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/proforme/nou">
                    <FileText /> Proformă
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/avize/nou">
                    <FileText /> Aviz de însoțire
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/incasari?nou=1">
                    <Wallet /> Încasare / chitanță
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/cheltuieli/nou">
                    <FileText /> Cheltuială
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/clienti?nou=1">
                    <Users /> Client
                  </Link>
                </DropdownMenuItem>
              </>
            )}
            {can("timesheet.own") && (
              <DropdownMenuItem asChild>
                <Link href="/pontaj">
                  <Timer /> Pontaj ore
                </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="relative" aria-label="Notificări">
              <Bell />
              {totalNotif > 0 && (
                <span className="absolute top-1 right-1 flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-70" />
                  <span className="relative inline-flex size-2 rounded-full bg-danger" />
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-72">
            <DropdownMenuLabel>Notificări</DropdownMenuLabel>
            {totalNotif === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">Totul e la zi ✨</div>}
            {!!data.badges.overdue && (
              <DropdownMenuItem asChild>
                <Link href="/facturi?status=overdue">
                  <FileText />
                  <span className="flex-1">Facturi cu scadența depășită</span>
                  <Badge tone="danger">{data.badges.overdue}</Badge>
                </Link>
              </DropdownMenuItem>
            )}
            {!!data.badges.spvUnread && (
              <DropdownMenuItem asChild>
                <Link href="/efactura?tab=primite">
                  <Bell />
                  <span className="flex-1">Mesaje noi în SPV</span>
                  <Badge tone="brand">{data.badges.spvUnread}</Badge>
                </Link>
              </DropdownMenuItem>
            )}
            {!!data.badges.efacturaErrors && (
              <DropdownMenuItem asChild>
                <Link href="/efactura?tab=trimise">
                  <FileText />
                  <span className="flex-1">Facturi respinse de ANAF</span>
                  <Badge tone="danger">{data.badges.efacturaErrors}</Badge>
                </Link>
              </DropdownMenuItem>
            )}
            {!!data.badges.approvals && (
              <DropdownMenuItem asChild>
                <Link href="/pontaj/aprobari">
                  <Timer />
                  <span className="flex-1">Pontaje de aprobat</span>
                  <Badge tone="info">{data.badges.approvals}</Badge>
                </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-1 flex items-center gap-2 rounded-full p-0.5 pr-2 transition-colors hover:bg-muted">
              <Avatar name={data.user.name} color={data.user.avatarColor} size="sm" />
              <span className="hidden max-w-32 truncate text-left text-xs leading-tight xl:block">
                <span className="block truncate font-semibold text-foreground">{data.user.name}</span>
                <span className="block truncate text-muted-foreground">{data.company.name}</span>
              </span>
              <ChevronDown className="hidden size-3.5 text-muted-foreground xl:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-72">
            <div className="flex items-center gap-3 px-2.5 py-2">
              <Avatar name={data.user.name} color={data.user.avatarColor} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{data.user.name}</div>
                <div className="truncate text-xs text-muted-foreground">{data.user.email}</div>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Firme</DropdownMenuLabel>
            {data.companies.map((c) => (
              <DropdownMenuItem key={c.id} onSelect={() => c.id !== data.company.id && switchCompanyAction(c.id)}>
                <Building2 />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    CUI {c.cui} · {ROLE_LABELS[c.role]}
                  </div>
                </div>
                {c.id === data.company.id && <Check className="!text-primary" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem asChild>
              <Link href="/setari/firme-noi">
                <Plus /> Adaugă o firmă
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/setari/profil">
                <User /> Profilul meu
              </Link>
            </DropdownMenuItem>
            {can("settings") && (
              <DropdownMenuItem asChild>
                <Link href="/setari">
                  <Settings /> Setări firmă
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => logoutAction()}>
              <LogOut /> Deconectare
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
