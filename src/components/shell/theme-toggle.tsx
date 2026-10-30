"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "next-themes";
import * as React from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Schimbă tema cu animație „circular reveal” (View Transitions API), cu fallback lin. */
export function useThemeSwitch() {
  const { setTheme, resolvedTheme, theme } = useTheme();
  const change = React.useCallback(
    (next: string, origin?: { x: number; y: number }) => {
      const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!doc.startViewTransition || reduce) {
        document.documentElement.classList.add("theme-transition");
        setTheme(next);
        window.setTimeout(() => document.documentElement.classList.remove("theme-transition"), 400);
        return;
      }
      const x = origin?.x ?? window.innerWidth - 40;
      const y = origin?.y ?? 32;
      const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      const t = doc.startViewTransition(() => {
        flushSync(() => setTheme(next));
      });
      t.ready.then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: 650, easing: "cubic-bezier(0.65, 0, 0.35, 1)", pseudoElement: "::view-transition-new(root)" },
        );
      });
    },
    [setTheme],
  );
  return { change, resolvedTheme, theme };
}

export function ThemeToggle() {
  const { change, resolvedTheme, theme } = useThemeSwitch();
  const [mounted, setMounted] = React.useState(false);
  const btn = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => setMounted(true), []);
  const origin = () => {
    const r = btn.current?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined;
  };
  const dark = mounted && resolvedTheme === "dark";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={btn} variant="ghost" size="icon-sm" aria-label="Schimbă tema" className="overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={dark ? "moon" : "sun"}
              initial={{ y: -18, rotate: -90, opacity: 0 }}
              animate={{ y: 0, rotate: 0, opacity: 1 }}
              exit={{ y: 18, rotate: 90, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="grid place-items-center"
            >
              {dark ? <Moon /> : <Sun />}
            </motion.span>
          </AnimatePresence>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-40">
        <DropdownMenuRadioGroup value={mounted ? theme : "system"} onValueChange={(v) => change(v, origin())}>
          <DropdownMenuRadioItem value="light">
            <Sun className="size-4 text-muted-foreground" /> Luminos
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="size-4 text-muted-foreground" /> Întunecat
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor className="size-4 text-muted-foreground" /> Sistem
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
