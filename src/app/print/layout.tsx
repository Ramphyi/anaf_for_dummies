import type { CSSProperties } from "react";

// Forțăm tokenii temei luminoase: documentul tipărit arată identic indiferent de tema aplicației.
const LIGHT_TOKENS = {
  "--background": "#eef0f5",
  "--foreground": "#0d0d18",
  "--card": "#ffffff",
  "--card-foreground": "#0d0d18",
  "--popover": "#ffffff",
  "--popover-foreground": "#0d0d18",
  "--muted": "#f1f2f7",
  "--muted-foreground": "#5f6075",
  "--subtle": "#f8f8fb",
  "--border": "#e3e4ec",
  "--input": "#dcdce7",
  "--primary": "#6d5dfc",
  "--primary-hover": "#5b4aef",
  "--primary-foreground": "#ffffff",
  "--primary-soft": "#efedff",
  "--primary-soft-foreground": "#4b3bd6",
  "--shadow-color": "240 30% 20%",
  colorScheme: "light",
} as CSSProperties;

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={LIGHT_TOKENS} className="min-h-dvh bg-background text-foreground print:bg-white">
      {children}
    </div>
  );
}
