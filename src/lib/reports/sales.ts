import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentLines, products } from "@/lib/db/schema";
import { displayStatus } from "@/lib/documents/status";
import { round2, sum } from "@/lib/utils";
import { docRon, loadSalesInvoices, pctDelta, signed, toRon } from "./common";
import { monthKey, monthsInPeriod, previousPeriod, prevYearKey, shiftYears } from "./period";

export type SalesInvoiceRow = {
  id: string;
  fullNumber: string;
  series: string;
  issueDate: string;
  dueDate: string | null;
  clientName: string;
  clientCui: string | null;
  currency: string;
  exchangeRate: number;
  totalOriginal: number;
  net: number;
  vat: number;
  gross: number;
  paid: number;
  status: string;
  isCreditNote: boolean;
};

export type SalesReport = Awaited<ReturnType<typeof getSalesReport>>;

export async function getSalesReport(companyId: string, period: { from: string; to: string }) {
  const prev = previousPeriod(period);
  const lastYear = shiftYears(period, 1);
  const [docs, prevDocs, lyDocs] = await Promise.all([
    loadSalesInvoices(companyId, period.from, period.to),
    loadSalesInvoices(companyId, prev.from, prev.to),
    loadSalesInvoices(companyId, lastYear.from, lastYear.to),
  ]);

  const invoices: SalesInvoiceRow[] = docs.map((d) => {
    const r = docRon(d);
    return {
      id: d.id,
      fullNumber: d.fullNumber,
      series: d.series,
      issueDate: d.issueDate,
      dueDate: d.dueDate,
      clientName: d.clientName,
      clientCui: d.clientCui,
      currency: d.currency,
      exchangeRate: d.exchangeRate,
      totalOriginal: d.total,
      net: r.net,
      vat: r.vat,
      gross: r.gross,
      paid: r.paid,
      status: displayStatus(d),
      isCreditNote: d.isCreditNote,
    };
  });

  /* KPI */
  const net = round2(sum(invoices, (i) => i.net));
  const vat = round2(sum(invoices, (i) => i.vat));
  const gross = round2(sum(invoices, (i) => i.gross));
  const issued = invoices.filter((i) => !i.isCreditNote);
  const paid = round2(sum(invoices, (i) => (i.isCreditNote ? 0 : i.paid)));
  const grossPositive = sum(issued, (i) => i.gross);
  const prevNet = round2(sum(prevDocs, (d) => docRon(d).net));
  const prevCount = prevDocs.filter((d) => !d.isCreditNote).length;
  const clientsCount = new Set(docs.map((d) => d.partnerId ?? d.clientName)).size;
  const prevClients = new Set(prevDocs.map((d) => d.partnerId ?? d.clientName)).size;

  /* pe luni: curent vs anul anterior */
  const months = monthsInPeriod(period.from, period.to);
  const byMonth = new Map<string, number>();
  for (const i of invoices) byMonth.set(monthKey(i.issueDate), (byMonth.get(monthKey(i.issueDate)) ?? 0) + i.net);
  const byMonthLy = new Map<string, number>();
  for (const d of lyDocs) byMonthLy.set(monthKey(d.issueDate), (byMonthLy.get(monthKey(d.issueDate)) ?? 0) + docRon(d).net);
  const monthly = months.map((m) => ({
    key: m.key,
    label: m.label,
    long: m.long,
    current: round2(byMonth.get(m.key) ?? 0),
    previous: round2(byMonthLy.get(prevYearKey(m.key)) ?? 0),
  }));

  /* pe client */
  const clientMap = new Map<string, { key: string; name: string; cui: string | null; count: number; net: number; vat: number; gross: number }>();
  for (const [idx, i] of invoices.entries()) {
    const key = docs[idx].partnerId ?? `name:${i.clientName}`;
    const c = clientMap.get(key) ?? { key, name: i.clientName, cui: i.clientCui, count: 0, net: 0, vat: 0, gross: 0 };
    if (!i.isCreditNote) c.count++;
    c.net += i.net;
    c.vat += i.vat;
    c.gross += i.gross;
    clientMap.set(key, c);
  }
  const clients = [...clientMap.values()]
    .map((c) => ({ ...c, net: round2(c.net), vat: round2(c.vat), gross: round2(c.gross), share: net ? (c.net / net) * 100 : 0 }))
    .sort((a, b) => b.net - a.net);

  /* pe produs / serviciu (din liniile documentelor) */
  const docIds = docs.map((d) => d.id);
  const lines = docIds.length ? await db.select().from(documentLines).where(inArray(documentLines.documentId, docIds)) : [];
  const productIds = [...new Set(lines.map((l) => l.productId).filter((x): x is string => !!x))];
  const productRows = productIds.length
    ? await db.select({ id: products.id, code: products.code, type: products.type, category: products.category }).from(products).where(inArray(products.id, productIds))
    : [];
  const productInfo = new Map(productRows.map((p) => [p.id, p]));
  const docById = new Map(docs.map((d) => [d.id, d]));
  const prodMap = new Map<string, { key: string; name: string; code: string | null; type: string; unit: string; quantity: number; net: number; invoices: Set<string> }>();
  for (const l of lines) {
    const d = docById.get(l.documentId)!;
    const key = l.productId ?? `name:${l.name.trim().toLowerCase()}`;
    const info = l.productId ? productInfo.get(l.productId) : undefined;
    const p = prodMap.get(key) ?? { key, name: l.name, code: info?.code ?? null, type: info?.type ?? "service", unit: l.unit, quantity: 0, net: 0, invoices: new Set<string>() };
    p.quantity += signed(l.quantity, d.isCreditNote);
    p.net += signed(toRon(l.netAmount, d.currency, d.exchangeRate), d.isCreditNote);
    p.invoices.add(d.id);
    prodMap.set(key, p);
  }
  const productsOut = [...prodMap.values()]
    .map(({ invoices: inv, ...p }) => ({ ...p, quantity: round2(p.quantity), net: round2(p.net), count: inv.size, share: net ? (p.net / net) * 100 : 0 }))
    .sort((a, b) => b.net - a.net);

  /* pe serie */
  const seriesMap = new Map<string, { series: string; count: number; net: number; gross: number }>();
  for (const i of invoices) {
    const s = seriesMap.get(i.series) ?? { series: i.series, count: 0, net: 0, gross: 0 };
    s.count++;
    s.net += i.net;
    s.gross += i.gross;
    seriesMap.set(i.series, s);
  }
  const series = [...seriesMap.values()].map((s) => ({ ...s, net: round2(s.net), gross: round2(s.gross), share: net ? (s.net / net) * 100 : 0 })).sort((a, b) => b.net - a.net);

  /* pe monedă */
  const currencyMap = new Map<string, { currency: string; count: number; original: number; ron: number }>();
  for (const i of invoices) {
    const c = currencyMap.get(i.currency) ?? { currency: i.currency, count: 0, original: 0, ron: 0 };
    c.count++;
    c.original += signed(i.totalOriginal, i.isCreditNote);
    c.ron += i.gross;
    currencyMap.set(i.currency, c);
  }

  return {
    kpis: {
      net,
      vat,
      gross,
      count: issued.length,
      creditNotes: invoices.length - issued.length,
      average: issued.length ? round2(sum(issued, (i) => i.net) / issued.length) : 0,
      collectedPct: grossPositive ? (paid / grossPositive) * 100 : 0,
      clients: clientsCount,
      deltaNet: pctDelta(net, prevNet),
      deltaCount: pctDelta(issued.length, prevCount),
      deltaClients: pctDelta(clientsCount, prevClients),
      prevNet,
      spark: monthly.map((m) => m.current),
      lastYearNet: round2(sum(lyDocs, (d) => docRon(d).net)),
    },
    monthly,
    clients,
    products: productsOut,
    series,
    currencies: [...currencyMap.values()].map((c) => ({ ...c, original: round2(c.original), ron: round2(c.ron) })),
    invoices,
  };
}
