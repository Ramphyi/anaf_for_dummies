"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { friendlyAnafError } from "@/components/anaf/utils";
import { fetchBnrRates } from "@/lib/anaf/bnr";
import { validateXml } from "@/lib/anaf/client";
import { lookupCompany, type CompanyLookup } from "@/lib/anaf/cui";
import { generateInvoiceXml } from "@/lib/anaf/service";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { anafLogs, exchangeRates, partners } from "@/lib/db/schema";
import { runAction } from "@/lib/server/action";
import { isValidCui, normalizeCui } from "@/lib/utils";

export type CuiResult = {
  company: Omit<CompanyLookup, "raw">;
  existing: { id: string; name: string; kind: string } | null;
  checkedAt: string;
};

/** Interogare registrul TVA ANAF + verificare în nomenclatorul firmei. */
export async function lookupCuiAction(rawCui: string) {
  return runAction<CuiResult>(async () => {
    const ctx = await requirePermission("anaf");
    const cui = normalizeCui(z.string().trim().min(2, "Introdu un CUI").parse(rawCui));
    if (!cui || !isValidCui(cui)) throw new Error("CUI invalid — cifra de control nu corespunde. Verifică numărul introdus.");
    const started = Date.now();
    let found: CompanyLookup | null;
    try {
      found = await lookupCompany(cui);
    } catch (err) {
      await db.insert(anafLogs).values({ companyId: ctx.company.id, action: "cui", environment: "public", success: false, request: `PlatitorTvaRest cui=${cui}`, response: String(err).slice(0, 2000), durationMs: Date.now() - started });
      throw new Error(friendlyAnafError(err));
    }
    await db.insert(anafLogs).values({
      companyId: ctx.company.id,
      action: "cui",
      environment: "public",
      success: !!found,
      request: `PlatitorTvaRest cui=${cui}`,
      response: found ? JSON.stringify(found.raw).slice(0, 8000) : "notFound",
      durationMs: Date.now() - started,
    });
    if (!found) throw new Error(`CUI-ul ${cui} nu a fost găsit în registrul ANAF.`);
    const { raw: _raw, ...company } = found;
    const existing = await db.query.partners.findFirst({
      where: and(eq(partners.companyId, ctx.company.id), eq(partners.cui, cui)),
      columns: { id: true, name: true, kind: true },
    });
    return { company, existing: existing ?? null, checkedAt: new Date().toISOString() };
  });
}

/** Validare XML prin serviciul public ANAF (FACT1 pentru facturi, FCN pentru note de credit). */
export async function validateXmlAction(xml: string) {
  return runAction(async () => {
    const ctx = await requirePermission("anaf");
    const body = z
      .string()
      .min(20, "XML-ul este gol")
      .max(5 * 1024 * 1024, "XML-ul depășește 5 MB")
      .parse(xml)
      .replace(/^﻿/, "")
      .trim();
    if (!body.startsWith("<")) throw new Error("Conținutul nu este XML.");
    const standard = /<(\w+:)?CreditNote[\s>]/.test(body) ? "FCN" : "FACT1";
    try {
      const r = await validateXml(ctx.company.id, body, standard);
      return { ...r, standard };
    } catch (err) {
      throw new Error(friendlyAnafError(err));
    }
  });
}

export type RatesResult = { date: string; rates: Record<string, number>; source: "live" | "cache"; error: string | null };

async function cachedRates(): Promise<{ date: string; rates: Record<string, number> } | null> {
  const latest = await db.query.exchangeRates.findFirst({ orderBy: desc(exchangeRates.date), columns: { date: true } });
  if (!latest) return null;
  const rows = await db.query.exchangeRates.findMany({ where: eq(exchangeRates.date, latest.date) });
  return { date: latest.date, rates: { RON: 1, ...Object.fromEntries(rows.map((r) => [r.currency, r.rate])) } };
}

/** Cursul BNR al zilei (live, salvat în cache) cu fallback la ultimul curs din baza de date. */
export async function refreshBnrAction() {
  return runAction<RatesResult>(async () => {
    await requirePermission("anaf");
    const before = await db.select({ n: sql<number>`count(*)` }).from(exchangeRates);
    try {
      const live = await fetchBnrRates();
      const after = await db.select({ n: sql<number>`count(*)` }).from(exchangeRates);
      if (after[0].n !== before[0].n) revalidatePath("/instrumente");
      return { date: live.date, rates: live.rates, source: "live", error: null };
    } catch (err) {
      const cache = await cachedRates();
      if (!cache) throw new Error("BNR nu răspunde și nu există niciun curs salvat local.");
      const reason = friendlyAnafError(err).replace(/ANAF/g, "BNR");
      return { ...cache, source: "cache", error: reason };
    }
  });
}

/** XML-ul UBL generat pentru o factură emisă + erorile de prevalidare CIUS-RO. */
export async function previewUblAction(documentId: string) {
  return runAction(async () => {
    const ctx = await requirePermission("anaf");
    const { xml, errors, doc } = await generateInvoiceXml(ctx.company.id, z.string().min(1).parse(documentId));
    return { xml, errors, number: doc.fullNumber, status: doc.efacturaStatus, id: doc.id };
  });
}
