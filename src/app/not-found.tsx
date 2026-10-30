import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="text-center">
        <p className="text-gradient text-7xl font-bold tracking-tighter">404</p>
        <h1 className="mt-3 text-xl font-semibold">Pagina nu a fost găsită</h1>
        <p className="mt-1 text-sm text-muted-foreground">Documentul a fost mutat, șters sau nu ai acces la el.</p>
        <Button asChild className="mt-6">
          <Link href="/dashboard">Înapoi la dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
