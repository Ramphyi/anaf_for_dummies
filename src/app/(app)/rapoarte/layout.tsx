import { PrintProvider } from "@/components/reports/report-kit";

/* La tipărire: fără sidebar/topbar/butoane flotante, culori de temă luminoasă, grafice scalate la lățimea paginii. */
const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 12mm; }
  :root, .dark {
    --background: #fff; --foreground: #111118; --card: #fff; --card-foreground: #111118;
    --popover: #fff; --muted: #f1f1f6; --muted-foreground: #5b5b70; --subtle: #f7f7fb;
    --border: #d9d9e3; --primary: #5b4aef; --primary-soft: #efedff; --primary-soft-foreground: #4b3bd6;
    --success: #15803d; --success-soft: #e8f8ee; --success-soft-foreground: #15803d;
    --warning: #b45309; --warning-soft: #fff4e0; --warning-soft-foreground: #b45309;
    --danger: #be123c; --danger-soft: #ffe9ee; --danger-soft-foreground: #be123c;
    --info: #0369a1; --info-soft: #e6f4fd; --info-soft-foreground: #0369a1;
    --chart-1: #6d5dfc; --chart-2: #06b6d4; --chart-3: #22c55e; --chart-4: #f59e0b; --chart-5: #ec4899;
    color-scheme: light;
  }
  html, body { background: #fff !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-shadow: none !important; text-shadow: none !important; }
  aside, header.sticky, .fixed, [data-sonner-toaster], nextjs-portal { display: none !important; }
  main { padding: 0 !important; }
  .recharts-responsive-container { width: 100% !important; }
  svg.recharts-surface { max-width: 100%; height: auto; }
  .scrollbar-thin { overflow: visible !important; }
  .report-section { break-inside: avoid; }
}`;

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrintProvider>
      <style>{PRINT_CSS}</style>
      {children}
    </PrintProvider>
  );
}
