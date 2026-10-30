"use client";

import Link from "next/link";
import * as React from "react";
import { Sheet, SheetContent } from "@/components/ui/dialog";
import { Dialog as D } from "radix-ui";
import { AssistantProvider } from "@/components/assistant/assistant-widget";
import { CommandMenu } from "./command-menu";
import { Logo } from "./logo";
import { Sidebar, SidebarNav } from "./sidebar";
import { Topbar } from "./topbar";
import type { ShellData } from "./types";

const COLLAPSE_KEY = "afd.sidebar.collapsed";

export function AppShell({ data, children }: { data: ShellData; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);

  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage indisponibil */
    }
  }, []);

  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });

  return (
    <AssistantProvider user={data.user} permissions={data.permissions} configured={data.aiConfigured}>
      <div className="flex min-h-dvh">
        <Sidebar data={data} collapsed={collapsed} onToggle={toggle} />
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-72 max-w-[85vw] bg-sidebar p-0">
            <D.Title className="sr-only">Meniu</D.Title>
            <div className="flex h-16 items-center px-5">
              <Link href="/dashboard" onClick={() => setMobileOpen(false)}>
                <Logo />
              </Link>
            </div>
            <SidebarNav data={data} onNavigate={() => setMobileOpen(false)} layoutId="sidebar-active-mobile" />
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar data={data} onMenu={() => setMobileOpen(true)} onSearch={() => setSearchOpen(true)} />
          <main className="relative flex-1 px-4 pt-4 pb-16 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1440px]">{children}</div>
          </main>
        </div>
        <CommandMenu data={data} open={searchOpen} setOpen={setSearchOpen} />
      </div>
    </AssistantProvider>
  );
}
