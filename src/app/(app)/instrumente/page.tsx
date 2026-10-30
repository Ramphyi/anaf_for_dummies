import { subDays } from "date-fns";
import { and, asc, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { Wrench } from "lucide-react";
import { PageHeader } from "@/components/ui/page";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { documents, exchangeRates } from "@/lib/db/schema";
import { toIsoDate } from "@/lib/format";
import { ToolsView, type ToolTab } from "./tools-view";

export const metadata = { title: "Instrumente fiscale" };

const TABS: ToolTab[] = ["cui", "validare", "pdf", "bnr", "ubl"];

export default async function InstrumentePage({ searchParams }: { searchParams: Promise<{ tab?: string; cui?: string; document?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("anaf");

  const since = toIsoDate(subDays(new Date(), 45));
  const [history, latest, invoices] = await Promise.all([
    db
      .select({ date: exchangeRates.date, currency: exchangeRates.currency, rate: exchangeRates.rate })
      .from(exchangeRates)
      .where(and(gte(exchangeRates.date, since), inArray(exchangeRates.currency, ["EUR", "USD"])))
      .orderBy(asc(exchangeRates.date)),
    db.query.exchangeRates.findFirst({ orderBy: desc(exchangeRates.date), columns: { date: true } }),
    db.query.documents.findMany({
      where: and(eq(documents.companyId, ctx.company.id), eq(documents.kind, "invoice"), ne(documents.status, "draft")),
      columns: { id: true, fullNumber: true, clientName: true, issueDate: true, total: true, currency: true, efacturaStatus: true },
      orderBy: [desc(documents.issueDate), desc(documents.number)],
      limit: 300,
    }),
  ]);
  const latestRows = latest ? await db.query.exchangeRates.findMany({ where: eq(exchangeRates.date, latest.date) }) : [];

  // Ultimele 30 de zile cu curs publicat (pivot pe dată)
  const byDate = new Map<string, { date: string; EUR?: number; USD?: number }>();
  for (const r of history) {
    const row = byDate.get(r.date) ?? { date: r.date };
    row[r.currency as "EUR" | "USD"] = r.rate;
    byDate.set(r.date, row);
  }
  const series = [...byDate.values()].slice(-30);

  const tab = sp.cui ? "cui" : sp.document ? "ubl" : TABS.includes(sp.tab as ToolTab) ? (sp.tab as ToolTab) : "cui";

  return (
    <>
      <PageHeader
        title="Instrumente fiscale"
        description="Verificare CUI la ANAF, validare și conversie XML e-Factura, curs BNR și previzualizarea facturilor în format UBL."
        icon={<Wrench />}
      />
      <ToolsView
        initialTab={tab}
        initialCui={sp.cui ?? null}
        initialDocument={sp.document ?? null}
        cachedRates={latest ? { date: latest.date, rates: { RON: 1, ...Object.fromEntries(latestRows.map((r) => [r.currency, r.rate])) } } : null}
        series={series}
        invoices={invoices}
      />
    </>
  );
}
