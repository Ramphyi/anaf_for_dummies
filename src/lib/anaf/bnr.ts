import "server-only";
import { and, desc, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { exchangeRates } from "@/lib/db/schema";
import { todayIso } from "@/lib/format";

// www.bnr.ro/nbrfxrates.xml redirecționează (302) spre prima pagină HTML; feed-ul oficial este pe curs.bnr.ro
const BNR_URL = "https://curs.bnr.ro/nbrfxrates.xml";

export type BnrRates = { date: string; rates: Record<string, number> };

/** Descarcă cursul BNR al zilei și îl salvează în cache (tabela exchange_rates). */
export async function fetchBnrRates(): Promise<BnrRates> {
  const res = await fetch(BNR_URL, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!res.ok) throw new Error(`BNR a răspuns cu ${res.status}`);
  const xml = await res.text();
  const date = xml.match(/<Cube date="([\d-]+)"/)?.[1] ?? todayIso();
  const rates: Record<string, number> = { RON: 1 };
  for (const m of xml.matchAll(/<Rate currency="(\w+)"(?: multiplier="(\d+)")?>([\d.]+)<\/Rate>/g)) {
    rates[m[1]] = Number(m[3]) / Number(m[2] ?? 1);
  }
  const rows = Object.entries(rates)
    .filter(([c]) => c !== "RON")
    .map(([currency, rate]) => ({ date, currency, rate }));
  if (!rows.length) throw new Error("BNR nu a returnat cursuri valutare (format neașteptat).");
  await db.insert(exchangeRates).values(rows).onConflictDoNothing();
  return { date, rates };
}

/** Cursul pentru o monedă la o dată (ultimul curs publicat ≤ data). Încearcă BNR dacă lipsește din cache. */
export async function getExchangeRate(currency: string, date = todayIso()): Promise<{ rate: number; date: string } | null> {
  if (currency === "RON") return { rate: 1, date };
  const cached = await db.query.exchangeRates.findFirst({
    where: and(eq(exchangeRates.currency, currency), lte(exchangeRates.date, date)),
    orderBy: desc(exchangeRates.date),
  });
  const ageDays = cached ? (Date.parse(date) - Date.parse(cached.date)) / 86_400_000 : Infinity;
  if (cached && ageDays <= 3) return { rate: cached.rate, date: cached.date };
  try {
    const fresh = await fetchBnrRates();
    if (fresh.rates[currency] && fresh.date <= date) return { rate: fresh.rates[currency], date: fresh.date };
  } catch {
    /* offline → folosim ultimul curs cunoscut */
  }
  return cached ? { rate: cached.rate, date: cached.date } : null;
}
