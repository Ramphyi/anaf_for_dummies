"use client";

import { Building2, CircleUserRound, FileDigit, History, Mail, PlusSquare, Users, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import * as React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  company: Building2,
  series: FileDigit,
  email: Mail,
  users: Users,
  activity: History,
  profile: CircleUserRound,
  companies: PlusSquare,
};

export type SettingsNavItem = { href: string; label: string; icon: string; description: string; group: "firma" | "cont" };

/** Sub-navigația setărilor: verticală pe desktop, orizontală (scroll) pe mobil. */
export function SettingsNav({ items }: { items: SettingsNavItem[] }) {
  const pathname = usePathname();
  const scroller = React.useRef<HTMLDivElement>(null);
  // pe mobil, pastila activă rămâne vizibilă în bara orizontală
  React.useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>("[data-active=true]");
    if (el && scroller.current) scroller.current.scrollTo({ left: el.offsetLeft - 16, behavior: "smooth" });
  }, [pathname]);
  const isActive = (href: string) => (href === "/setari" ? pathname === "/setari" : pathname === href || pathname.startsWith(`${href}/`));
  const groups = [
    { key: "firma", label: "Firmă" },
    { key: "cont", label: "Contul meu" },
  ] as const;

  return (
    <nav className="min-w-0 lg:sticky lg:top-20 lg:self-start">
      {/* mobil: pastile orizontale */}
      <div ref={scroller} className="scrollbar-thin -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:hidden">
        {items.map((item) => {
          const Icon = ICONS[item.icon] ?? Building2;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              data-active={active}
              className={cn(
                "relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="settings-nav-mobile"
                  className="absolute inset-0 rounded-lg bg-card shadow-soft ring-1 ring-border"
                  transition={{ type: "spring", bounce: 0.18, duration: 0.45 }}
                />
              )}
              <Icon className="relative z-10 size-4" />
              <span className="relative z-10">{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* desktop: listă verticală grupată */}
      <div className="hidden space-y-5 lg:block">
        {groups.map((g) => {
          const list = items.filter((i) => i.group === g.key);
          if (!list.length) return null;
          return (
            <div key={g.key}>
              <div className="mb-1.5 px-3 text-[10.5px] font-semibold tracking-[0.08em] text-muted-foreground/70 uppercase">{g.label}</div>
              <ul className="space-y-0.5">
                {list.map((item) => {
                  const Icon = ICONS[item.icon] ?? Building2;
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "group relative flex items-start gap-3 rounded-lg px-3 py-2 transition-colors",
                          active ? "text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="settings-nav"
                            className="absolute inset-0 rounded-lg bg-card shadow-soft ring-1 ring-border"
                            transition={{ type: "spring", bounce: 0.18, duration: 0.45 }}
                          />
                        )}
                        {active && <span className="absolute top-1/2 left-0 z-10 h-5 w-[3px] -translate-x-[1px] -translate-y-1/2 rounded-full bg-primary" />}
                        <Icon className={cn("relative z-10 mt-0.5 size-4 shrink-0", active && "text-primary")} />
                        <span className="relative z-10 min-w-0">
                          <span className="block text-sm font-medium">{item.label}</span>
                          <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
