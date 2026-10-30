import { round2 } from "@/lib/utils";

/**
 * Calculul totalurilor unui document — partajat între formular (client) și server.
 * TVA-ul documentului se calculează pe categorie/cotă (regula BR-S-09 din EN 16931),
 * ca XML-ul e-Factura să treacă validarea ANAF.
 */

export type LineInput = {
  quantity: number;
  unitPrice: number; // fără TVA
  discountPercent?: number;
  vatRate: number;
  vatCategory?: string;
};

export type LineTotals = {
  grossAmount: number; // cantitate × preț
  discountAmount: number;
  netAmount: number; // după discount
  vatAmount: number;
  totalAmount: number;
};

export type VatBreakdown = { category: string; rate: number; taxable: number; vat: number };

export type DocumentTotals = {
  lines: LineTotals[];
  subtotal: number; // suma valorilor nete (după discount)
  discountTotal: number;
  vatTotal: number;
  total: number;
  breakdown: VatBreakdown[];
};

export function effectiveVatRate(line: Pick<LineInput, "vatRate" | "vatCategory">): number {
  const cat = line.vatCategory ?? "S";
  return cat === "S" ? line.vatRate : 0;
}

export function computeLine(line: LineInput): LineTotals {
  const gross = round2((line.quantity || 0) * (line.unitPrice || 0));
  const discountAmount = round2((gross * (line.discountPercent || 0)) / 100);
  const netAmount = round2(gross - discountAmount);
  const vatAmount = round2((netAmount * effectiveVatRate(line)) / 100);
  return { grossAmount: gross, discountAmount, netAmount, vatAmount, totalAmount: round2(netAmount + vatAmount) };
}

export function computeTotals(lines: LineInput[]): DocumentTotals {
  const computed = lines.map(computeLine);
  const groups = new Map<string, VatBreakdown>();
  lines.forEach((line, i) => {
    const category = line.vatCategory ?? "S";
    const rate = effectiveVatRate(line);
    const key = `${category}|${rate}`;
    const g = groups.get(key) ?? { category, rate, taxable: 0, vat: 0 };
    g.taxable = round2(g.taxable + computed[i].netAmount);
    groups.set(key, g);
  });
  const breakdown = [...groups.values()].map((g) => ({ ...g, vat: round2((g.taxable * g.rate) / 100) }));
  const subtotal = round2(computed.reduce((a, l) => a + l.netAmount, 0));
  const discountTotal = round2(computed.reduce((a, l) => a + l.discountAmount, 0));
  const vatTotal = round2(breakdown.reduce((a, g) => a + g.vat, 0));
  return { lines: computed, subtotal, discountTotal, vatTotal, total: round2(subtotal + vatTotal), breakdown };
}

/** Prețul fără TVA pornind de la un preț cu TVA inclus. */
export function priceWithoutVat(priceWithVat: number, vatRate: number): number {
  return Math.round((priceWithVat / (1 + vatRate / 100)) * 10000) / 10000;
}
