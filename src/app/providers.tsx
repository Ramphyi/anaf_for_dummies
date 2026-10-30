"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/popover";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={(resolvedTheme as "light" | "dark") ?? "system"}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{ classNames: { toast: "!rounded-xl !border-border !shadow-lift !font-sans" } }}
    />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={250}>
        {children}
        <ThemedToaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
