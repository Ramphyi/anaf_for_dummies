"use client";

import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Tooltip } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { NAV } from "./nav";
import type { ShellData } from "./types";

export function useVisibleNav(permissions: ShellData["permissions"]) {
  return React.useMemo(
    () =>
      NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || permissions.includes(i.permission)) })).filter(
        (g) => g.items.length > 0,
      ),
    [permissions],
  );
}

export function SidebarNav({
  data,
  collapsed,
  onNavigate,
  layoutId = "sidebar-active",
}: {
  data: ShellData;
  collapsed?: boolean;
  onNavigate?: () => void;
  layoutId?: string;
}) {
  const pathname = usePathname();
  const groups = useVisibleNav(data.permissions);
  return (
    <nav className="scrollbar-thin flex-1 overflow-x-hidden overflow-y-auto px-3 pb-4">
      {groups.map((group) => (
        <div key={group.label} className="mt-4 first:mt-1">
          {!collapsed ? (
            <div className="mb-1 px-2.5 text-[10.5px] font-semibold tracking-[0.08em] text-muted-foreground/70 uppercase">{group.label}</div>
          ) : (
            <div className="mx-auto mb-2 h-px w-6 bg-border" />
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const badge = item.badge ? data.badges[item.badge] : undefined;
              const Icon = item.icon;
              const link = (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                    collapsed && "justify-center px-0",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId={layoutId}
                      className="absolute inset-0 rounded-lg bg-card shadow-soft ring-1 ring-border"
                      transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                    >
                      <span className="absolute top-1/2 left-0 h-4 w-[3px] -translate-x-[1px] -translate-y-1/2 rounded-full bg-primary" />
                    </motion.span>
                  )}
                  <Icon
                    className={cn(
                      "relative z-10 size-[18px] shrink-0 transition-transform duration-300 group-hover:scale-110",
                      active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                    )}
                  />
                  {!collapsed && <span className="relative z-10 truncate">{item.label}</span>}
                  {!!badge && (
                    <span
                      className={cn(
                        "relative z-10 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground",
                        collapsed ? "absolute -top-0.5 -right-0.5 h-4 min-w-4 text-[9px]" : "ml-auto",
                        item.badge === "overdue" && "bg-danger",
                      )}
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </Link>
              );
              return (
                <li key={item.href}>
                  {collapsed ? (
                    <Tooltip content={item.label} side="right">
                      {link}
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ data, collapsed, onToggle }: { data: ShellData; collapsed: boolean; onToggle: () => void }) {
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 256 }}
      transition={{ type: "spring", bounce: 0, duration: 0.45 }}
      className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex"
    >
      <div className={cn("flex h-16 items-center px-5", collapsed && "justify-center px-0")}>
        <Link href="/dashboard">
          <Logo collapsed={collapsed} />
        </Link>
      </div>
      <SidebarNav data={data} collapsed={collapsed} />
      <div className="border-t border-sidebar-border p-3">
        {!collapsed && (
          <div className="mb-2 overflow-hidden rounded-xl border border-border bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_12%,transparent),color-mix(in_oklab,var(--accent)_10%,transparent))] p-3">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
              ANAF · {data.anaf.label}
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              {data.anaf.environment === "simulation" ? "Mod demonstrativ. Conectează certificatul din e-Factura." : "Token OAuth activ pentru SPV."}
            </p>
          </div>
        )}
        <button
          onClick={onToggle}
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!collapsed && "Restrânge meniul"}
        </button>
      </div>
    </motion.aside>
  );
}
