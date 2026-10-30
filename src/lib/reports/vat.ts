import "server-only";
import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentLines, documents, payments, purchaseInvoices, purchaseLines } from "@/lib/db/schema";
import { effectiveVatRate } from "@/lib/documents/totals";
import { round2, sum } from "@/lib/utils";
import { loadSalesInvoices, rateResolver, signed, toRon } from "./common";
import { monthKey, monthsInPeriod } from "./period";

/** O coloană din jurnal: bază + TVA pentru o cotă / categorie. */
export type VatColumn = { key: string; label: string; hint: string; hasVat: boolean };
export type VatCells = Record<string, { base: number; vat: number }>;

export type SalesJournalRow = {
  id: string;
  number: string;
  date: string;
  partner: string;
  cui: string | null;
  country: string;
  currency: string;
  exchangeRate: number;
  isCreditNote: boolean;
  total: number; // RON, cu TVA
  base: number;
  vat: number;
  cells: VatCells;
};

export type PurchaseJournalRow = Omit<SalesJournalRow, "country" | "isCreditNote"> & { category: string };

const CATEGORY_ORDER = ["S", "Z", "E", "AE", "K", "G", "O"];
const CATEGORY_LABELS: Record<string, { label: string; hint: string }> = {
  Z: { label: "Cotă 0% (Z)", hint: "Livrări cu cota zero" },
  E: { label: "Scutite (E)", hint: "Scutite fără drept de deducere — art. 292 Cod fiscal" },
  AE: { label: "Taxare inversă (AE)", hint: "Taxare inversă: prestări intracomunitare (art. 278) sau taxare inversă internă (art. 331)" },
  K: { label: "Livrări intracom. (K)", hint: "Livrări intracomunitare scutite — art. 294 alin. (2)" },
  G: { label: "Export (G)", hint: "Export scutit — art. 294 alin. (1)" },
  O: { label: "Neimpozabile (O)", hint: "În afara sferei TVA / neplătitor" },
};

function salesKey(category: string, rate: number) {
  return category === "S" ? `S${rate}` : category;
}

function sortSalesKeys(keys: string[]) {
  return keys.sort((a, b) => {
    const ca = a.startsWith("S") && a !== "S" ? "S" : a;
    const cb = b.startsWith("S") && b !== "S" ? "S" : b;
    if (ca === "S" && cb === "S") return Number(b.slice(1)) - Number(a.slice(1));
    return CATEGORY_ORDER.indexOf(ca) - CATEGORY_ORDER.indexOf(cb);
  });
}

function salesColumn(key: string): VatColumn {
  if (key.startsWith("S")) {
    const rate = Number(key.slice(1));
    const legacy = [19, 9, 5].includes(rate);
    return {
      key,
      label: `Cota ${rate}%`,
      hint: rate === 21 ? "Cota standard" : rate === 11 ? "Cota redusă" : legacy ? "Cotă aplicabilă până la 31.07.2025" : "Cotă standard / redusă",
      hasVat: rate > 0,
    };
  }
  return { key, ...(CATEGORY_LABELS[key] ?? { label: key, hint: "" }), hasVat: false };
}

function purchaseColumn(rate: number): VatColumn {
  return {
    key: `P${rate}`,
    label: rate > 0 ? `Cota ${rate}%` : "Fără TVA / scutite",
    hint: rate > 0 ? "TVA deductibilă" : "Achiziții fără TVA",
    hasVat: rate > 0,
  };
}

export type VatReport = Awaited<ReturnType<typeof getVatReport>>;

export async function getVatReport(company: { id: string; vatPayer: boolean; vatOnCollection: boolean }, period: { from: string; to: string }) {
  const companyId = company.id;
  const docs = await loadSalesInvoices(companyId, period.from, period.to);
  const docIds = docs.map((d) => d.id);
  const lines = docIds.length ? await db.select().from(documentLines).where(inArray(documentLines.documentId, docIds)) : [];
  const linesByDoc = new Map<string, typeof lines>();
  for (const l of lines) linesByDoc.set(l.documentId, [...(linesByDoc.get(l.documentId) ?? []), l]);

  /* ---------------- Jurnal de vânzări ---------------- */
  const salesKeys = new Set<string>();
  const sales: SalesJournalRow[] = docs.map((d) => {
    // Același calcul ca la emitere: TVA pe grupă categorie/cotă (BR-S-09), apoi conversie în RON.
    const groups = new Map<string, { base: number; rate: number }>();
    for (const l of linesByDoc.get(d.id) ?? []) {
      const rate = effectiveVatRate({ vatRate: l.vatRate, vatCategory: l.vatCategory });
      const key = salesKey(l.vatCategory, rate);
      const g = groups.get(key) ?? { base: 0, rate };
      g.base = round2(g.base + l.netAmount);
      groups.set(key, g);
    }
    if (!groups.size && d.subtotal) groups.set("S21", { base: d.subtotal, rate: d.subtotal ? round2((d.vatTotal / d.subtotal) * 100) : 0 });
    const cells: VatCells = {};
    for (const [key, g] of groups) {
      salesKeys.add(key);
      const vat = round2((g.base * g.rate) / 100);
      cells[key] = {
        base: round2(signed(toRon(g.base, d.currency, d.exchangeRate), d.isCreditNote)),
        vat: round2(signed(toRon(vat, d.currency, d.exchangeRate), d.isCreditNote)),
      };
    }
    const base = round2(sum(Object.values(cells), (c) => c.base));
    const vat = round2(sum(Object.values(cells), (c) => c.vat));
    return {
      id: d.id,
      number: d.fullNumber,
      date: d.issueDate,
      partner: d.clientName,
      cui: d.clientCui,
      country: d.clientCountry,
      currency: d.currency,
      exchangeRate: d.exchangeRate,
      isCreditNote: d.isCreditNote,
      total: round2(base + vat),
      base,
      vat,
      cells,
    };
  });

  /* ---------------- Jurnal de cumpărări ---------------- */
  const purchases = await db.query.purchaseInvoices.findMany({
    where: and(
      eq(purchaseInvoices.companyId, companyId),
      ne(purchaseInvoices.status, "cancelled"),
      gte(purchaseInvoices.issueDate, period.from),
      lte(purchaseInvoices.issueDate, period.to),
    ),
    orderBy: (p, { asc }) => [asc(p.issueDate)],
  });
  const pIds = purchases.map((p) => p.id);
  const pLines = pIds.length ? await db.select().from(purchaseLines).where(inArray(purchaseLines.purchaseInvoiceId, pIds)) : [];
  const pLinesBy = new Map<string, typeof pLines>();
  for (const l of pLines) pLinesBy.set(l.purchaseInvoiceId, [...(pLinesBy.get(l.purchaseInvoiceId) ?? []), l]);
  const purchaseRates = new Set<number>();
  const purchaseRows: PurchaseJournalRow[] = purchases.map((p) => {
    const groups = new Map<number, { base: number; vat: number }>();
    const pl = pLinesBy.get(p.id) ?? [];
    for (const l of pl) {
      const g = groups.get(l.vatRate) ?? { base: 0, vat: 0 };
      g.base += l.netAmount;
      g.vat += l.vatAmount;
      groups.set(l.vatRate, g);
    }
    // fără linii (ex. import sumar) → deducem cota din totaluri
    if (!pl.length) groups.set(p.subtotal ? Math.round((p.vatTotal / p.subtotal) * 100) : 0, { base: p.subtotal, vat: p.vatTotal });
    // TVA-ul din antet are prioritate (rotunjiri pe document)
    const linesVat = sum([...groups.values()], (g) => g.vat);
    if (pl.length && groups.size === 1 && Math.abs(linesVat - p.vatTotal) < 1) {
      const [only] = groups.values();
      only.vat = p.vatTotal;
      only.base = p.subtotal;
    }
    const cells: VatCells = {};
    for (const [rate, g] of groups) {
      purchaseRates.add(rate);
      cells[`P${rate}`] = { base: round2(toRon(g.base, p.currency, p.exchangeRate)), vat: round2(toRon(g.vat, p.currency, p.exchangeRate)) };
    }
    const base = round2(sum(Object.values(cells), (c) => c.base));
    const vat = round2(sum(Object.values(cells), (c) => c.vat));
    return {
      id: p.id,
      number: p.number,
      date: p.issueDate,
      partner: p.supplierName,
      cui: p.supplierCui,
      currency: p.currency,
      exchangeRate: p.exchangeRate,
      category: p.category,
      total: round2(base + vat),
      base,
      vat,
      cells,
    };
  });

  /* ---------------- Decont estimat pe luni ---------------- */
  const months = monthsInPeriod(period.from, period.to);
  const aeBase = (r: SalesJournalRow) => sum(Object.entries(r.cells).filter(([k]) => !k.startsWith("S")), ([, c]) => c.base);
  const decont = months.map((m) => {
    const s = sales.filter((r) => monthKey(r.date) === m.key);
    const p = purchaseRows.filter((r) => monthKey(r.date) === m.key);
    const collected = round2(sum(s, (r) => r.vat));
    const deductible = round2(sum(p, (r) => r.vat));
    return {
      key: m.key,
      label: m.label,
      long: m.long,
      salesBase: round2(sum(s, (r) => r.base)),
      collected,
      exemptBase: round2(sum(s, aeBase)),
      purchaseBase: round2(sum(p, (r) => r.base)),
      deductible,
      balance: round2(collected - deductible), // > 0 de plată, < 0 de recuperat
    };
  });

  /* ---------------- TVA la încasare (exigibilitate la plată) ---------------- */
  let cashVat: { key: string; label: string; collected: number; deductible: number; balance: number }[] | null = null;
  const anyCashVatDocs = docs.some((d) => d.vatOnCollection);
  if (company.vatOnCollection || anyCashVatDocs) {
    const resolve = await rateResolver();
    const pays = await db
      .select({ p: payments, d: documents, pi: purchaseInvoices })
      .from(payments)
      .leftJoin(documents, eq(documents.id, payments.documentId))
      .leftJoin(purchaseInvoices, eq(purchaseInvoices.id, payments.purchaseInvoiceId))
      .where(and(eq(payments.companyId, companyId), gte(payments.date, period.from), lte(payments.date, period.to)));
    const byMonth = new Map<string, { collected: number; deductible: number }>();
    for (const { p, d, pi } of pays) {
      const m = byMonth.get(monthKey(p.date)) ?? { collected: 0, deductible: 0 };
      if (p.direction === "in" && d && d.total && (company.vatOnCollection || d.vatOnCollection)) {
        m.collected += p.amount * (d.vatTotal / d.total) * resolve(p.currency, p.date, d.exchangeRate, d.currency);
      }
      if (p.direction === "out" && pi && pi.total && company.vatOnCollection) {
        m.deductible += p.amount * (pi.vatTotal / pi.total) * resolve(p.currency, p.date, pi.exchangeRate, pi.currency);
      }
      byMonth.set(monthKey(p.date), m);
    }
    cashVat = months.map((mo) => {
      const v = byMonth.get(mo.key) ?? { collected: 0, deductible: 0 };
      return { key: mo.key, label: mo.label, collected: round2(v.collected), deductible: round2(v.deductible), balance: round2(v.collected - v.deductible) };
    });
  }

  const salesColumns = sortSalesKeys([...salesKeys]).map(salesColumn);
  const purchaseColumns = [...purchaseRates].sort((a, b) => b - a).map(purchaseColumn);
  const collected = round2(sum(decont, (m) => m.collected));
  const deductible = round2(sum(decont, (m) => m.deductible));

  return {
    vatPayer: company.vatPayer,
    vatOnCollection: company.vatOnCollection,
    sales,
    salesColumns,
    purchases: purchaseRows,
    purchaseColumns,
    decont,
    cashVat,
    totals: {
      collected,
      deductible,
      balance: round2(collected - deductible),
      salesBase: round2(sum(sales, (r) => r.base)),
      purchaseBase: round2(sum(purchaseRows, (r) => r.base)),
      exemptBase: round2(sum(decont, (m) => m.exemptBase)),
      salesCount: sales.length,
      purchaseCount: purchaseRows.length,
      foreignCount: sales.filter((r) => r.currency !== "RON").length,
    },
  };
}
