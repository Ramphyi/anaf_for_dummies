import { AuthShowcase } from "./showcase";
import { Logo } from "@/components/shell/logo";
import { ThemeToggle } from "@/components/shell/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="relative flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md">{children}</div>
        </div>
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} AND <span className="opacity-70">· ANAF for Dummies</span> · Facturare conformă e-Factura (CIUS-RO)</p>
      </div>
      <AuthShowcase />
    </div>
  );
}
