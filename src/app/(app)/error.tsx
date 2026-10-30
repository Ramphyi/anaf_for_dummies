"use client";

import { AlertOctagon, LayoutDashboard, Lock, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";
import { FORBIDDEN_DIGEST } from "@/lib/constants";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  if (error.digest === FORBIDDEN_DIGEST) {
    return (
      <EmptyState
        icon={<Lock />}
        title="Nu ai acces la această pagină"
        description="Rolul tău în această firmă nu include această secțiune. Cere unui administrator să-ți modifice rolul din Setări → Utilizatori."
        action={
          <Button asChild>
            <Link href="/dashboard">
              <LayoutDashboard /> Înapoi la dashboard
            </Link>
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={<AlertOctagon />}
      title="Ceva n-a mers bine"
      // În producție Next.js ascunde mesajul erorilor de server și pune un text generic în engleză.
      description={error.message && !/production builds/i.test(error.message) ? error.message : "A apărut o eroare neașteptată la încărcarea paginii."}
      action={
        <Button onClick={reset}>
          <RotateCcw /> Reîncearcă
        </Button>
      }
    />
  );
}
