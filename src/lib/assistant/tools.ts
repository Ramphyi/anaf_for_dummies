import "server-only";
import { addDays, format, startOfMonth, startOfWeek } from "date-fns";
import { and, desc, eq, gte, inArray, like, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { lookupCompany } from "@/lib/anaf/cui";
import { fetchBnrRates, getExchangeRate } from "@/lib/anaf/bnr";
import { getConnection } from "@/lib/anaf/client";
import type { Permission } from "@/lib/auth/session";
import { DOC_KIND_LABELS, DOC_STATUS, EFACTURA_STATUS, EXPENSE_CATEGORY_LABELS, TASK_STATUS } from "@/lib/constants";
import { db } from "@/lib/db";
import {
  allocations,
  companies,
  documents,
  partners,
  payments,
  products,
  projectMembers,
  projects,
  purchaseInvoices,
  spvMessages,
  tasks,
  teamMembers,
  timeEntries,
  timeOff,
  warehouses,
  type Role,
} from "@/lib/db/schema";
import { createDocument, type LineDraft } from "@/lib/documents/server";
import { displayStatus } from "@/lib/documents/status";
import { getStockLevels } from "@/lib/stock/server";
import { todayIso } from "@/lib/format";
import { normalizeCui, round2 } from "@/lib/utils";

/** Contextul în care rulează o unealtă: utilizatorul și firma pentru care se citesc datele. */
export type ToolCtx = {
  companyId: string;
  companyName: string;
  userId: string;
  userName: string;
  role: Role;
  teamMemberId: string | null;
  permissions: Permission[];
};

export type AssistantTool<S extends z.ZodType = z.ZodType> = {
  name: string;
  /** Etichetă scurtă pentru UI (cipul animat din chat). */
  label: string;
  description: string;
  schema: S;
  /** Permisiunea necesară; `null` = disponibil oricărui utilizator autentificat. */
  permission: Permission | null;
  /** true = modifică date (creează ciorne/pontaje). */
  mutates?: boolean;
  run: (ctx: ToolCtx, input: z.infer<S>) => Promise<unknown>;
};

function tool<S extends z.ZodType>(t: AssistantTool<S>): AssistantTool<S> {
  return t;
}

/* ------------------------------------------------------------------ */
/* Utilitare                                                           */
/* ------------------------------------------------------------------ */

const ISSUED = ["issued", "partially_paid", "paid", "storned"] as const;
const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD");
const defaultFrom = () => format(startOfMonth(new Date()), "yyyy-MM-dd");
const docLink = (d: { id: string; kind: string }) => `${DOC_KIND_LABELS[d.kind as keyof typeof DOC_KIND_LABELS]?.path ?? "/facturi"}/${d.id}`;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

async function resolvePartner(companyId: string, ref: string) {
  const byId = await db.query.partners.findFirst({ where: and(eq(partners.companyId, companyId), eq(partners.id, ref)) });
  if (byId) return byId;
  const cui = normalizeCui(ref);
  if (cui.length >= 4) {
    const byCui = await db.query.partners.findFirst({ where: and(eq(partners.companyId, companyId), eq(partners.cui, cui)) });
    if (byCui) return byCui;
  }
  const matches = await db.query.partners.findMany({
    where: and(eq(partners.companyId, companyId), like(partners.name, `%${ref}%`)),
    limit: 5,
  });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const exact = matches.find((m) => m.name.toLowerCase() === ref.toLowerCase());
    if (exact) return exact;
    throw new Error(`Mai mulți parteneri se potrivesc cu „${ref}”: ${matches.map((m) => m.name).join(", ")}. Precizează.`);
  }
  throw new Error(`Nu am găsit niciun client/furnizor „${ref}”.`);
}

async function resolveProject(companyId: string, ref: string) {
  const all = await db.query.projects.findMany({ where: eq(projects.companyId, companyId) });
  const r = ref.toLowerCase();
  const p =
    all.find((x) => x.id === ref) ??
    all.find((x) => x.code?.toLowerCase() === r) ??
    all.find((x) => x.name.toLowerCase() === r) ??
    all.filter((x) => x.name.toLowerCase().includes(r))[0];
  if (!p) throw new Error(`Nu am găsit proiectul „${ref}”. Proiecte: ${all.map((x) => x.name).join(", ")}.`);
  return p;
}

async function resolveMember(companyId: string, ref: string) {
  const all = await db.query.teamMembers.findMany({ where: eq(teamMembers.companyId, companyId) });
  const r = ref.toLowerCase();
  const m = all.find((x) => x.id === ref) ?? all.find((x) => x.name.toLowerCase() === r) ?? all.find((x) => x.name.toLowerCase().includes(r));
  if (!m) throw new Error(`Nu am găsit membrul de echipă „${ref}”.`);
  return m;
}

const canSeeTeamData = (ctx: ToolCtx) => ctx.permissions.includes("projects.manage") || ctx.permissions.includes("timesheet.approve");

/* ------------------------------------------------------------------ */
/* Unelte                                                              */
/* ------------------------------------------------------------------ */

export const ASSISTANT_TOOLS = [
  tool({
    name: "get_financial_summary",
    label: "Analizez situația financiară",
    description:
      "Indicatori financiari pentru o perioadă: venituri facturate (RON, fără și cu TVA), număr facturi, încasări, cheltuieli, TVA colectată/deductibilă, profit estimat, sold de încasat și restanțe la zi, top clienți. Folosește-l pentru întrebări de tipul „cât am facturat”, „cum stăm luna asta”, „profit”.",
    permission: "reports",
    schema: z.object({
      from: zDate.optional().describe("Data de început (implicit prima zi a lunii curente)"),
      to: zDate.optional().describe("Data de sfârșit (implicit azi)"),
    }),
    run: async (ctx, { from = defaultFrom(), to = todayIso() }) => {
      const cid = ctx.companyId;
      const today = todayIso();
      const [rev] = await db
        .select({
          net: sql<number>`coalesce(sum(${documents.subtotal} * ${documents.exchangeRate}), 0)`,
          vat: sql<number>`coalesce(sum(${documents.vatTotal} * ${documents.exchangeRate}), 0)`,
          gross: sql<number>`coalesce(sum(${documents.total} * ${documents.exchangeRate}), 0)`,
          n: sql<number>`count(*)`,
        })
        .from(documents)
        .where(and(eq(documents.companyId, cid), eq(documents.kind, "invoice"), inArray(documents.status, [...ISSUED]), gte(documents.issueDate, from), lte(documents.issueDate, to)));
      const [exp] = await db
        .select({
          net: sql<number>`coalesce(sum(${purchaseInvoices.subtotal} * ${purchaseInvoices.exchangeRate}), 0)`,
          vat: sql<number>`coalesce(sum(${purchaseInvoices.vatTotal} * ${purchaseInvoices.exchangeRate}), 0)`,
          gross: sql<number>`coalesce(sum(${purchaseInvoices.total} * ${purchaseInvoices.exchangeRate}), 0)`,
        })
        .from(purchaseInvoices)
        .where(and(eq(purchaseInvoices.companyId, cid), ne(purchaseInvoices.status, "cancelled"), gte(purchaseInvoices.issueDate, from), lte(purchaseInvoices.issueDate, to)));
      const [col] = await db
        .select({ v: sql<number>`coalesce(sum(${payments.amount} * coalesce(${documents.exchangeRate}, 1)), 0)` })
        .from(payments)
        .leftJoin(documents, eq(documents.id, payments.documentId))
        .where(and(eq(payments.companyId, cid), eq(payments.direction, "in"), gte(payments.date, from), lte(payments.date, to)));
      const [open] = await db
        .select({
          total: sql<number>`coalesce(sum((${documents.total} - ${documents.paidAmount}) * ${documents.exchangeRate}), 0)`,
          overdue: sql<number>`coalesce(sum(case when ${documents.dueDate} < ${today} then (${documents.total} - ${documents.paidAmount}) * ${documents.exchangeRate} else 0 end), 0)`,
          overdueCount: sql<number>`coalesce(sum(case when ${documents.dueDate} < ${today} then 1 else 0 end), 0)`,
        })
        .from(documents)
        .where(and(eq(documents.companyId, cid), eq(documents.kind, "invoice"), inArray(documents.status, ["issued", "partially_paid"])));
      const top = await db
        .select({ id: documents.partnerId, name: documents.clientName, v: sql<number>`sum(${documents.subtotal} * ${documents.exchangeRate})` })
        .from(documents)
        .where(and(eq(documents.companyId, cid), eq(documents.kind, "invoice"), inArray(documents.status, [...ISSUED]), gte(documents.issueDate, from), lte(documents.issueDate, to)))
        .groupBy(documents.partnerId, documents.clientName)
        .orderBy(desc(sql`3`))
        .limit(5);
      return {
        period: { from, to },
        currency: "RON",
        revenue: { net: round2(rev.net), vat: round2(rev.vat), gross: round2(rev.gross), invoices: rev.n },
        collected: round2(col.v),
        expenses: { net: round2(exp.net), vat_deductible: round2(exp.vat), gross: round2(exp.gross) },
        vat_balance_estimate: round2(rev.vat - exp.vat),
        profit_estimate_net: round2(rev.net - exp.net),
        receivables_now: { open: round2(open.total), overdue: round2(open.overdue), overdue_invoices: open.overdueCount },
        top_clients: top.map((t) => ({ name: t.name, revenue_net: round2(t.v), link: t.id ? `/clienti/${t.id}` : null })),
      };
    },
  }),

  tool({
    name: "search_documents",
    label: "Caut documente",
    description:
      "Caută facturi, proforme sau avize după număr, client, status și perioadă. Statusuri: draft, issued, partially_paid, paid, overdue (scadență depășită), cancelled, storned, converted. Returnează linkuri către fiecare document.",
    permission: "billing",
    schema: z.object({
      query: z.string().optional().describe("Text liber: număr document sau nume client"),
      kind: z.enum(["invoice", "proforma", "notice"]).optional(),
      status: z.enum(["draft", "issued", "partially_paid", "paid", "overdue", "cancelled", "storned", "converted"]).optional(),
      client: z.string().optional().describe("Numele, CUI-ul sau ID-ul clientului"),
      from: zDate.optional(),
      to: zDate.optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    run: async (ctx, input) => {
      const conds = [eq(documents.companyId, ctx.companyId), eq(documents.kind, input.kind ?? "invoice")];
      if (input.query) conds.push(or(like(documents.fullNumber, `%${input.query}%`), like(documents.clientName, `%${input.query}%`))!);
      if (input.client) conds.push(eq(documents.partnerId, (await resolvePartner(ctx.companyId, input.client)).id));
      if (input.from) conds.push(gte(documents.issueDate, input.from));
      if (input.to) conds.push(lte(documents.issueDate, input.to));
      if (input.status && input.status !== "overdue") conds.push(eq(documents.status, input.status));
      if (input.status === "overdue") conds.push(inArray(documents.status, ["issued", "partially_paid"]), sql`${documents.dueDate} < ${todayIso()}`);
      const rows = await db.query.documents.findMany({ where: and(...conds), orderBy: (d, { desc }) => [desc(d.issueDate), desc(d.number)], limit: input.limit ?? 20 });
      return {
        count: rows.length,
        documents: rows.map((d) => ({
          id: d.id,
          number: d.fullNumber,
          storno: d.isCreditNote || undefined,
          client: d.clientName,
          issue_date: d.issueDate,
          due_date: d.dueDate,
          total: d.total,
          remaining: round2(d.total - d.paidAmount),
          currency: d.currency,
          status: DOC_STATUS[displayStatus(d)]?.label,
          efactura: EFACTURA_STATUS[d.efacturaStatus]?.label,
          link: docLink(d),
        })),
      };
    },
  }),

  tool({
    name: "get_document",
    label: "Deschid documentul",
    description: "Detaliile complete ale unei facturi/proforme/aviz (după ID sau număr, ex. PXD0142): linii, TVA, încasări, status e-Factura și erori ANAF.",
    permission: "billing",
    schema: z.object({ id_or_number: z.string() }),
    run: async (ctx, { id_or_number }) => {
      const d = await db.query.documents.findFirst({
        where: and(eq(documents.companyId, ctx.companyId), or(eq(documents.id, id_or_number), eq(documents.fullNumber, id_or_number.toUpperCase()))),
        with: { lines: { orderBy: (l, { asc }) => [asc(l.position)] }, payments: true },
      });
      if (!d) throw new Error(`Documentul „${id_or_number}” nu există.`);
      return {
        id: d.id,
        type: d.isCreditNote ? "Factură storno" : DOC_KIND_LABELS[d.kind].one,
        number: d.fullNumber,
        status: DOC_STATUS[displayStatus(d)]?.label,
        client: { name: d.clientName, cui: d.clientCui, address: [d.clientAddress, d.clientCity].filter(Boolean).join(", "), link: d.partnerId ? `/clienti/${d.partnerId}` : null },
        issue_date: d.issueDate,
        due_date: d.dueDate,
        currency: d.currency,
        exchange_rate: d.exchangeRate,
        lines: d.lines.map((l) => ({ name: l.name, quantity: l.quantity, unit: l.unit, unit_price: l.unitPrice, discount_percent: l.discountPercent || undefined, vat_rate: l.vatRate, vat_category: l.vatCategory, net: l.netAmount, vat: l.vatAmount, total: l.totalAmount })),
        subtotal: d.subtotal,
        vat_total: d.vatTotal,
        total: d.total,
        paid: d.paidAmount,
        remaining: round2(d.total - d.paidAmount),
        payments: d.payments.map((p) => ({ date: p.date, amount: p.amount, method: p.method, receipt: p.receiptNumber ? `${p.receiptSeries}${p.receiptNumber}` : undefined })),
        efactura: { status: EFACTURA_STATUS[d.efacturaStatus]?.label, upload_id: d.efacturaUploadId, message: d.efacturaMessage },
        notes: d.notes,
        link: docLink(d),
      };
    },
  }),

  tool({
    name: "list_receivables",
    label: "Verific restanțele",
    description: "Sumele de încasat: total pe intervale de întârziere (curent, 1–30, 31–60, 61–90, peste 90 de zile) și lista facturilor neîncasate, cele mai întârziate primele.",
    permission: "billing",
    schema: z.object({
      overdue_only: z.boolean().optional(),
      client: z.string().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    run: async (ctx, input) => {
      const today = todayIso();
      const conds = [eq(documents.companyId, ctx.companyId), eq(documents.kind, "invoice"), inArray(documents.status, ["issued", "partially_paid"])];
      if (input.client) conds.push(eq(documents.partnerId, (await resolvePartner(ctx.companyId, input.client)).id));
      const rows = await db.query.documents.findMany({ where: and(...conds), orderBy: (d, { asc }) => [asc(d.dueDate)] });
      const buckets = { curent: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
      const list = rows
        .map((d) => {
          const remaining = round2((d.total - d.paidAmount) * d.exchangeRate);
          const late = d.dueDate ? daysBetween(d.dueDate, today) : 0;
          const key = late <= 0 ? "curent" : late <= 30 ? "1-30" : late <= 60 ? "31-60" : late <= 90 ? "61-90" : "90+";
          buckets[key] = round2(buckets[key] + remaining);
          return { number: d.fullNumber, client: d.clientName, due_date: d.dueDate, days_overdue: Math.max(0, late), remaining_ron: remaining, currency: d.currency, link: docLink(d) };
        })
        .filter((d) => !input.overdue_only || d.days_overdue > 0)
        .sort((a, b) => b.days_overdue - a.days_overdue);
      return { total_ron: round2(Object.values(buckets).reduce((a, b) => a + b, 0)), buckets_ron: buckets, invoices: list.slice(0, input.limit ?? 25), total_count: list.length };
    },
  }),

  tool({
    name: "search_partners",
    label: "Caut parteneri",
    description: "Caută clienți sau furnizori după nume, CUI sau oraș; include soldul de încasat (clienți) și totalul facturat în ultimele 12 luni.",
    permission: "billing",
    schema: z.object({
      query: z.string().optional(),
      kind: z.enum(["client", "supplier"]).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    run: async (ctx, input) => {
      const conds = [eq(partners.companyId, ctx.companyId), eq(partners.active, true)];
      if (input.query) conds.push(or(like(partners.name, `%${input.query}%`), like(partners.cui, `%${normalizeCui(input.query) || input.query}%`), like(partners.city, `%${input.query}%`))!);
      if (input.kind) conds.push(inArray(partners.kind, [input.kind, "both"]));
      const rows = await db.query.partners.findMany({ where: and(...conds), limit: input.limit ?? 20, orderBy: (p, { asc }) => [asc(p.name)] });
      const since = format(addDays(new Date(), -365), "yyyy-MM-dd");
      const stats = rows.length
        ? await db
            .select({
              id: documents.partnerId,
              invoiced: sql<number>`sum(case when ${documents.issueDate} >= ${since} then ${documents.total} * ${documents.exchangeRate} else 0 end)`,
              open: sql<number>`sum(case when ${documents.status} in ('issued','partially_paid') then (${documents.total} - ${documents.paidAmount}) * ${documents.exchangeRate} else 0 end)`,
            })
            .from(documents)
            .where(and(eq(documents.companyId, ctx.companyId), eq(documents.kind, "invoice"), inArray(documents.status, [...ISSUED]), inArray(documents.partnerId, rows.map((r) => r.id))))
            .groupBy(documents.partnerId)
        : [];
      const by = new Map(stats.map((s) => [s.id, s]));
      return rows.map((p) => ({
        id: p.id,
        name: p.name,
        kind: p.kind,
        cui: p.cui,
        city: p.city,
        country: p.country,
        vat_payer: p.vatPayer,
        email: p.email,
        invoiced_12m_ron: round2(by.get(p.id)?.invoiced ?? 0),
        open_balance_ron: round2(by.get(p.id)?.open ?? 0),
        link: p.kind === "supplier" ? `/furnizori/${p.id}` : `/clienti/${p.id}`,
      }));
    },
  }),

  tool({
    name: "get_partner_details",
    label: "Analizez partenerul",
    description: "Fișa completă a unui client sau furnizor: date de identificare, total facturat, încasat, sold, întârziere medie la plată, ultimele documente și proiecte.",
    permission: "billing",
    schema: z.object({ partner: z.string().describe("Nume, CUI sau ID") }),
    run: async (ctx, { partner }) => {
      const p = await resolvePartner(ctx.companyId, partner);
      const docs = await db.query.documents.findMany({
        where: and(eq(documents.companyId, ctx.companyId), eq(documents.partnerId, p.id), eq(documents.kind, "invoice"), inArray(documents.status, [...ISSUED])),
        orderBy: (d, { desc }) => [desc(d.issueDate)],
        with: { payments: true },
      });
      const purchases = await db.query.purchaseInvoices.findMany({ where: and(eq(purchaseInvoices.companyId, ctx.companyId), eq(purchaseInvoices.supplierId, p.id)), orderBy: (d, { desc }) => [desc(d.issueDate)], limit: 10 });
      const delays = docs.filter((d) => d.status === "paid" && d.dueDate && d.payments.length).map((d) => daysBetween(d.dueDate!, d.payments.map((x) => x.date).sort().at(-1)!));
      const projs = await db.query.projects.findMany({ where: and(eq(projects.companyId, ctx.companyId), eq(projects.clientId, p.id)), columns: { id: true, name: true, status: true } });
      return {
        partner: { id: p.id, name: p.name, kind: p.kind, cui: p.cui, reg_com: p.regCom, vat_payer: p.vatPayer, address: [p.address, p.city, p.county, p.country].filter(Boolean).join(", "), email: p.email, phone: p.phone, payment_term_days: p.paymentTermDays },
        invoiced_total_ron: round2(docs.reduce((a, d) => a + d.total * d.exchangeRate, 0)),
        paid_total_ron: round2(docs.reduce((a, d) => a + d.paidAmount * d.exchangeRate, 0)),
        open_balance_ron: round2(docs.filter((d) => d.status !== "paid").reduce((a, d) => a + (d.total - d.paidAmount) * d.exchangeRate, 0)),
        average_payment_delay_days: delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null,
        last_invoices: docs.slice(0, 8).map((d) => ({ number: d.fullNumber, date: d.issueDate, total: d.total, currency: d.currency, status: DOC_STATUS[displayStatus(d)]?.label, link: docLink(d) })),
        purchases: purchases.map((x) => ({ number: x.number, date: x.issueDate, total: x.total, status: x.status, link: `/cheltuieli/${x.id}` })),
        projects: projs.map((x) => ({ ...x, link: `/proiecte/${x.id}` })),
        link: p.kind === "supplier" ? `/furnizori/${p.id}` : `/clienti/${p.id}`,
      };
    },
  }),

  tool({
    name: "search_expenses",
    label: "Caut cheltuieli",
    description: `Caută facturi primite / cheltuieli după furnizor, categorie (${Object.keys(EXPENSE_CATEGORY_LABELS).join(", ")}), status (unpaid, partially_paid, paid) și perioadă; include totaluri pe categorii.`,
    permission: "billing",
    schema: z.object({
      query: z.string().optional(),
      category: z.string().optional(),
      status: z.enum(["unpaid", "partially_paid", "paid", "cancelled"]).optional(),
      from: zDate.optional(),
      to: zDate.optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    run: async (ctx, input) => {
      const conds = [eq(purchaseInvoices.companyId, ctx.companyId)];
      if (input.query) conds.push(or(like(purchaseInvoices.supplierName, `%${input.query}%`), like(purchaseInvoices.number, `%${input.query}%`))!);
      if (input.category) conds.push(eq(purchaseInvoices.category, input.category));
      if (input.status) conds.push(eq(purchaseInvoices.status, input.status));
      if (input.from) conds.push(gte(purchaseInvoices.issueDate, input.from));
      if (input.to) conds.push(lte(purchaseInvoices.issueDate, input.to));
      const rows = await db.query.purchaseInvoices.findMany({ where: and(...conds), orderBy: (p, { desc }) => [desc(p.issueDate)] });
      const byCat: Record<string, number> = {};
      for (const r of rows) byCat[EXPENSE_CATEGORY_LABELS[r.category] ?? r.category] = round2((byCat[EXPENSE_CATEGORY_LABELS[r.category] ?? r.category] ?? 0) + r.total * r.exchangeRate);
      return {
        count: rows.length,
        total_ron: round2(rows.reduce((a, r) => a + r.total * r.exchangeRate, 0)),
        by_category_ron: byCat,
        expenses: rows.slice(0, input.limit ?? 20).map((r) => ({ supplier: r.supplierName, number: r.number, date: r.issueDate, due: r.dueDate, total: r.total, currency: r.currency, remaining: round2(r.total - r.paidAmount), status: r.status, category: EXPENSE_CATEGORY_LABELS[r.category] ?? r.category, source: r.source, link: `/cheltuieli/${r.id}` })),
      };
    },
  }),

  tool({
    name: "search_products",
    label: "Caut în nomenclator",
    description: "Caută produse și servicii din nomenclator (cod, preț fără TVA, cotă TVA, UM) și stocul curent pentru produsele gestionate.",
    permission: "billing",
    schema: z.object({ query: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }),
    run: async (ctx, input) => {
      const conds = [eq(products.companyId, ctx.companyId), eq(products.active, true)];
      if (input.query) conds.push(or(like(products.name, `%${input.query}%`), like(products.code, `%${input.query}%`))!);
      const rows = await db.query.products.findMany({ where: and(...conds), limit: input.limit ?? 25, orderBy: (p, { asc }) => [asc(p.name)] });
      const levels = await getStockLevels(ctx.companyId);
      return rows.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        type: p.type === "service" ? "serviciu" : "produs",
        unit: p.unit,
        price: p.price,
        currency: p.currency,
        vat_rate: p.vatRate,
        stock: p.trackStock ? round2(levels.filter((l) => l.productId === p.id).reduce((a, l) => a + l.quantity, 0)) : undefined,
        link: `/produse?id=${p.id}`,
      }));
    },
  }),

  tool({
    name: "get_stock",
    label: "Verific stocurile",
    description: "Stocul pe produse și gestiuni: cantitate, cost mediu, valoare; semnalează stocurile mici (sub prag) sau negative.",
    permission: "billing",
    schema: z.object({ product: z.string().optional(), low_stock_threshold: z.number().optional() }),
    run: async (ctx, input) => {
      const [levels, prods, whs] = await Promise.all([
        getStockLevels(ctx.companyId),
        db.query.products.findMany({ where: and(eq(products.companyId, ctx.companyId), eq(products.trackStock, true)) }),
        db.query.warehouses.findMany({ where: eq(warehouses.companyId, ctx.companyId) }),
      ]);
      const q = input.product?.toLowerCase();
      const threshold = input.low_stock_threshold ?? 3;
      const rows = levels
        .map((l) => {
          const p = prods.find((x) => x.id === l.productId);
          return { product: p?.name ?? "?", code: p?.code, warehouse: whs.find((w) => w.id === l.warehouseId)?.name, quantity: l.quantity, avg_cost: l.avgCost, value_ron: l.value, low: l.quantity <= threshold };
        })
        .filter((r) => !q || r.product.toLowerCase().includes(q) || r.code?.toLowerCase().includes(q));
      return { total_value_ron: round2(rows.reduce((a, r) => a + r.value_ron, 0)), items: rows, link: "/stocuri" };
    },
  }),

  tool({
    name: "get_efactura_overview",
    label: "Verific e-Factura",
    description: "Situația e-Factura / SPV: facturi pe statusuri (validate, în prelucrare, respinse, netrimise), facturile respinse cu mesajele de eroare ANAF, mesaje SPV necitite, mediul conexiunii ANAF și ultima sincronizare.",
    permission: "anaf",
    schema: z.object({}),
    run: async (ctx) => {
      const counts = await db
        .select({ s: documents.efacturaStatus, n: sql<number>`count(*)` })
        .from(documents)
        .where(and(eq(documents.companyId, ctx.companyId), eq(documents.kind, "invoice"), ne(documents.status, "draft"), ne(documents.status, "cancelled")))
        .groupBy(documents.efacturaStatus);
      const rejected = await db.query.documents.findMany({ where: and(eq(documents.companyId, ctx.companyId), inArray(documents.efacturaStatus, ["nok", "error"])), limit: 10 });
      const unsent = await db.query.documents.findMany({ where: and(eq(documents.companyId, ctx.companyId), eq(documents.kind, "invoice"), eq(documents.efacturaStatus, "none"), inArray(documents.status, ["issued", "partially_paid", "paid"])), limit: 10 });
      const [unread] = await db.select({ n: sql<number>`count(*)` }).from(spvMessages).where(and(eq(spvMessages.companyId, ctx.companyId), eq(spvMessages.read, false)));
      const conn = await getConnection(ctx.companyId);
      return {
        connection: { environment: conn.environment, connected: conn.environment === "simulation" || !!conn.accessToken, token_expires: conn.accessTokenExpiresAt, last_sync: conn.lastSyncAt },
        invoices_by_status: Object.fromEntries(counts.map((c) => [EFACTURA_STATUS[c.s]?.label ?? c.s, c.n])),
        rejected: rejected.map((d) => ({ number: d.fullNumber, client: d.clientName, message: d.efacturaMessage, link: docLink(d) })),
        not_sent: unsent.map((d) => ({ number: d.fullNumber, client: d.clientName, date: d.issueDate, link: docLink(d) })),
        unread_spv_messages: unread.n,
        link: "/efactura",
      };
    },
  }),

  tool({
    name: "lookup_company_anaf",
    label: "Interoghez ANAF",
    description: "Caută o firmă în registrul public ANAF după CUI: denumire, adresă, Reg. Com., CAEN, plătitor TVA, TVA la încasare, split TVA, contribuabil inactiv, înregistrat în RO e-Factura.",
    permission: null,
    schema: z.object({ cui: z.string() }),
    run: async (_ctx, { cui }) => {
      const r = await lookupCompany(cui);
      if (!r) return { found: false, cui };
      const { raw: _raw, ...rest } = r;
      return { found: true, ...rest };
    },
  }),

  tool({
    name: "get_exchange_rates",
    label: "Citesc cursul BNR",
    description: "Cursul BNR (RON pentru 1 unitate de valută). Fără parametri returnează cursurile zilei pentru principalele valute.",
    permission: null,
    schema: z.object({ currency: z.string().length(3).optional(), date: zDate.optional() }),
    run: async (_ctx, input) => {
      if (input.currency) {
        const r = await getExchangeRate(input.currency.toUpperCase(), input.date);
        if (!r) throw new Error(`Nu am găsit cursul pentru ${input.currency}.`);
        return { currency: input.currency.toUpperCase(), rate_ron: r.rate, date: r.date, source: "BNR" };
      }
      const all = await fetchBnrRates();
      const keep = ["EUR", "USD", "GBP", "CHF", "HUF", "PLN", "BGN", "MDL"];
      return { date: all.date, source: "BNR", rates_ron: Object.fromEntries(keep.filter((k) => all.rates[k]).map((k) => [k, all.rates[k]])) };
    },
  }),

  tool({
    name: "list_projects",
    label: "Listez proiectele",
    description: "Proiectele firmei (de outsourcing): client, status, tip facturare, buget ore/sumă, ore consumate total și luna curentă, membri.",
    permission: null,
    schema: z.object({ status: z.enum(["planning", "active", "on_hold", "completed", "cancelled"]).optional(), query: z.string().optional() }),
    run: async (ctx, input) => {
      const conds = [eq(projects.companyId, ctx.companyId)];
      if (input.status) conds.push(eq(projects.status, input.status));
      if (input.query) conds.push(or(like(projects.name, `%${input.query}%`), like(projects.code, `%${input.query}%`))!);
      const rows = await db.query.projects.findMany({ where: and(...conds), with: { client: { columns: { name: true } }, members: { with: { member: { columns: { name: true } } } } } });
      const monthStart = defaultFrom();
      const hours = await db
        .select({ p: timeEntries.projectId, total: sql<number>`sum(${timeEntries.hours})`, month: sql<number>`sum(case when ${timeEntries.date} >= ${monthStart} then ${timeEntries.hours} else 0 end)` })
        .from(timeEntries)
        .where(eq(timeEntries.companyId, ctx.companyId))
        .groupBy(timeEntries.projectId);
      const h = new Map(hours.map((x) => [x.p, x]));
      return rows.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        client: p.client?.name ?? "intern",
        status: p.status,
        billing: p.billingType,
        hourly_rate: p.hourlyRate,
        currency: p.currency,
        budget_hours: p.budgetHours,
        budget_amount: p.budgetAmount,
        hours_total: round2(h.get(p.id)?.total ?? 0),
        hours_this_month: round2(h.get(p.id)?.month ?? 0),
        budget_used_pct: p.budgetHours ? Math.round(((h.get(p.id)?.total ?? 0) / p.budgetHours) * 100) : null,
        members: p.members.map((m) => m.member?.name),
        start: p.startDate,
        end: p.endDate,
        link: `/proiecte/${p.id}`,
      }));
    },
  }),

  tool({
    name: "get_project_details",
    label: "Analizez proiectul",
    description: "Detalii despre un proiect: ore pe membri, ore facturabile, venit estimat (ore × tarif), cost estimat (ore × cost intern), marjă, task-uri pe statusuri și task-uri întârziate.",
    permission: null,
    schema: z.object({ project: z.string().describe("Nume, cod sau ID proiect"), from: zDate.optional(), to: zDate.optional() }),
    run: async (ctx, input) => {
      const p = await resolveProject(ctx.companyId, input.project);
      const conds = [eq(timeEntries.projectId, p.id)];
      if (input.from) conds.push(gte(timeEntries.date, input.from));
      if (input.to) conds.push(lte(timeEntries.date, input.to));
      const entries = await db.query.timeEntries.findMany({ where: and(...conds), with: { member: true } });
      const pm = await db.query.projectMembers.findMany({ where: eq(projectMembers.projectId, p.id) });
      const byMember = new Map<string, { name: string; hours: number; billable: number; revenue: number; cost: number }>();
      for (const e of entries) {
        const m = e.member;
        const rate = pm.find((x) => x.memberId === e.memberId)?.hourlyRate ?? m?.hourlyRate ?? p.hourlyRate ?? 0;
        const cur = byMember.get(e.memberId) ?? { name: m?.name ?? "?", hours: 0, billable: 0, revenue: 0, cost: 0 };
        cur.hours += e.hours;
        if (e.billable) {
          cur.billable += e.hours;
          cur.revenue += e.hours * rate;
        }
        cur.cost += e.hours * (m?.hourlyCost ?? 0);
        byMember.set(e.memberId, cur);
      }
      const ts = await db.query.tasks.findMany({ where: eq(tasks.projectId, p.id), with: { assignee: { columns: { name: true } } } });
      const today = todayIso();
      const members = [...byMember.values()].map((m) => ({ ...m, hours: round2(m.hours), billable: round2(m.billable), revenue: round2(m.revenue), cost_ron: round2(m.cost) }));
      const revenue = members.reduce((a, m) => a + m.revenue, 0);
      const cost = members.reduce((a, m) => a + m.cost_ron, 0);
      return {
        project: { id: p.id, name: p.name, status: p.status, billing: p.billingType, currency: p.currency, budget_hours: p.budgetHours, budget_amount: p.budgetAmount, start: p.startDate, end: p.endDate },
        hours_total: round2(members.reduce((a, m) => a + m.hours, 0)),
        hours_billable: round2(members.reduce((a, m) => a + m.billable, 0)),
        revenue_estimate: { amount: round2(revenue), currency: p.currency },
        cost_estimate_ron: round2(cost),
        by_member: members.sort((a, b) => b.hours - a.hours),
        tasks_by_status: Object.fromEntries(Object.keys(TASK_STATUS).map((s) => [TASK_STATUS[s].label, ts.filter((t) => t.status === s).length])),
        overdue_tasks: ts.filter((t) => t.status !== "done" && t.dueDate && t.dueDate < today).map((t) => ({ title: t.title, due: t.dueDate, assignee: t.assignee?.name, priority: t.priority })),
        link: `/proiecte/${p.id}`,
      };
    },
  }),

  tool({
    name: "get_timesheet_summary",
    label: "Citesc pontajele",
    description:
      "Rezumatul orelor pontate într-o perioadă, grupate pe membru, proiect sau zi; include ore facturabile și statusul aprobării. Angajații văd doar pontajul propriu.",
    permission: "timesheet.own",
    schema: z.object({
      from: zDate.optional().describe("Implicit începutul săptămânii curente"),
      to: zDate.optional(),
      member: z.string().optional(),
      project: z.string().optional(),
      group_by: z.enum(["member", "project", "day"]).optional(),
    }),
    run: async (ctx, input) => {
      const from = input.from ?? format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
      const to = input.to ?? todayIso();
      const conds = [eq(timeEntries.companyId, ctx.companyId), gte(timeEntries.date, from), lte(timeEntries.date, to)];
      if (!canSeeTeamData(ctx)) {
        if (!ctx.teamMemberId) throw new Error("Contul tău nu este asociat unui membru al echipei.");
        conds.push(eq(timeEntries.memberId, ctx.teamMemberId));
      } else if (input.member) conds.push(eq(timeEntries.memberId, (await resolveMember(ctx.companyId, input.member)).id));
      if (input.project) conds.push(eq(timeEntries.projectId, (await resolveProject(ctx.companyId, input.project)).id));
      const rows = await db.query.timeEntries.findMany({ where: and(...conds), with: { member: { columns: { name: true } }, project: { columns: { name: true } } } });
      const group = input.group_by ?? "member";
      const agg = new Map<string, { key: string; hours: number; billable: number; approved: number; pending: number }>();
      for (const e of rows) {
        const key = group === "member" ? (e.member?.name ?? "?") : group === "project" ? (e.project?.name ?? "?") : e.date;
        const g = agg.get(key) ?? { key, hours: 0, billable: 0, approved: 0, pending: 0 };
        g.hours += e.hours;
        if (e.billable) g.billable += e.hours;
        if (e.status === "approved") g.approved += e.hours;
        if (e.status === "submitted") g.pending += e.hours;
        agg.set(key, g);
      }
      const groups = [...agg.values()].map((g) => ({ ...g, hours: round2(g.hours), billable: round2(g.billable), approved: round2(g.approved), pending_approval: round2(g.pending) }));
      return { period: { from, to }, group_by: group, total_hours: round2(rows.reduce((a, e) => a + e.hours, 0)), groups: groups.sort((a, b) => (group === "day" ? a.key.localeCompare(b.key) : b.hours - a.hours)), link: "/pontaj" };
    },
  }),

  tool({
    name: "get_team_overview",
    label: "Verific echipa",
    description:
      "Echipa și disponibilitatea într-un interval: pentru fiecare membru — capacitate, ore alocate pe proiecte (planificare), concedii, încărcare % (supra/sub-alocat). Folosește-l pentru „cine e liber”, „cine e supraalocat”, „pe ce proiect lucrează X”.",
    permission: null,
    schema: z.object({ from: zDate.optional(), to: zDate.optional() }),
    run: async (ctx, input) => {
      const from = input.from ?? todayIso();
      const to = input.to ?? format(addDays(new Date(from), 13), "yyyy-MM-dd");
      const [members, allocs, offs] = await Promise.all([
        db.query.teamMembers.findMany({ where: and(eq(teamMembers.companyId, ctx.companyId), eq(teamMembers.active, true)) }),
        db.query.allocations.findMany({ where: and(eq(allocations.companyId, ctx.companyId), lte(allocations.startDate, to), gte(allocations.endDate, from)), with: { project: { columns: { name: true } } } }),
        db.query.timeOff.findMany({ where: and(eq(timeOff.companyId, ctx.companyId), lte(timeOff.startDate, to), gte(timeOff.endDate, from), ne(timeOff.status, "rejected")) }),
      ]);
      const workdays = (a: string, b: string) => {
        let n = 0;
        for (let d = new Date(a); d <= new Date(b); d = addDays(d, 1)) if (d.getDay() % 6 !== 0) n++;
        return n;
      };
      const totalDays = workdays(from, to);
      return {
        period: { from, to, workdays: totalDays },
        members: members.map((m) => {
          const mine = allocs.filter((a) => a.memberId === m.id);
          const allocated = mine.reduce((acc, a) => acc + a.hoursPerDay * workdays(a.startDate < from ? from : a.startDate, a.endDate > to ? to : a.endDate), 0);
          const off = offs.filter((o) => o.memberId === m.id);
          const offDays = off.reduce((acc, o) => acc + workdays(o.startDate < from ? from : o.startDate, o.endDate > to ? to : o.endDate), 0);
          const capacity = (m.weeklyCapacity / 5) * Math.max(0, totalDays - offDays);
          return {
            name: m.name,
            position: m.position,
            department: m.department,
            capacity_hours: round2(capacity),
            allocated_hours: round2(allocated),
            load_pct: capacity ? Math.round((allocated / capacity) * 100) : null,
            projects: mine.map((a) => `${a.project?.name} (${a.hoursPerDay}h/zi, ${a.startDate} → ${a.endDate})`),
            time_off: off.map((o) => `${o.type} ${o.startDate} → ${o.endDate} (${o.status})`),
            link: `/echipa/${m.id}`,
          };
        }),
        link: "/planificare",
      };
    },
  }),

  tool({
    name: "list_tasks",
    label: "Caut task-uri",
    description: "Task-urile din proiecte, filtrate după proiect, responsabil, status (backlog, todo, in_progress, review, done) sau doar cele întârziate.",
    permission: null,
    schema: z.object({
      project: z.string().optional(),
      assignee: z.string().optional().describe("Nume membru sau „eu” pentru utilizatorul curent"),
      status: z.enum(["backlog", "todo", "in_progress", "review", "done"]).optional(),
      overdue_only: z.boolean().optional(),
    }),
    run: async (ctx, input) => {
      const conds = [eq(tasks.companyId, ctx.companyId)];
      if (input.project) conds.push(eq(tasks.projectId, (await resolveProject(ctx.companyId, input.project)).id));
      if (input.assignee) {
        const me = /^(eu|me|mine)$/i.test(input.assignee.trim());
        const memberId = me ? ctx.teamMemberId : (await resolveMember(ctx.companyId, input.assignee)).id;
        if (memberId) conds.push(eq(tasks.assigneeId, memberId));
      }
      if (input.status) conds.push(eq(tasks.status, input.status));
      if (input.overdue_only) conds.push(ne(tasks.status, "done"), sql`${tasks.dueDate} < ${todayIso()}`);
      const rows = await db.query.tasks.findMany({ where: and(...conds), with: { project: { columns: { name: true, id: true } }, assignee: { columns: { name: true } } }, limit: 40, orderBy: (t, { asc }) => [asc(t.dueDate)] });
      return rows.map((t) => ({ title: t.title, project: t.project?.name, status: TASK_STATUS[t.status]?.label, priority: t.priority, assignee: t.assignee?.name, due: t.dueDate, estimate_hours: t.estimateHours, link: `/proiecte/${t.projectId}` }));
    },
  }),

  tool({
    name: "create_draft_invoice",
    label: "Pregătesc factura ciornă",
    description:
      "Creează o factură CIORNĂ (nu se emite și nu se trimite la ANAF) pentru un client, cu liniile date. Utilizatorul o verifică și o emite din aplicație. Folosește-l doar când utilizatorul cere explicit o factură.",
    permission: "billing",
    mutates: true,
    schema: z.object({
      client: z.string().describe("Numele, CUI-ul sau ID-ul clientului"),
      lines: z
        .array(
          z.object({
            name: z.string().optional().describe("Denumirea; dacă lipsește se ia din produs"),
            product: z.string().optional().describe("Cod sau nume din nomenclator"),
            quantity: z.number().positive(),
            unit_price: z.number().nonnegative().optional().describe("Preț unitar fără TVA; implicit prețul din nomenclator"),
            unit: z.string().optional(),
            vat_rate: z.number().optional(),
          }),
        )
        .min(1),
      currency: z.string().length(3).optional(),
      notes: z.string().optional(),
    }),
    run: async (ctx, input) => {
      const partner = await resolvePartner(ctx.companyId, input.client);
      const company = await db.query.companies.findFirst({ where: eq(companies.id, ctx.companyId) });
      if (!company) throw new Error("Firmă inexistentă.");
      const foreign = partner.country !== "RO";
      const allProducts = await db.query.products.findMany({ where: eq(products.companyId, ctx.companyId) });
      const lines: LineDraft[] = input.lines.map((l) => {
        const q = l.product?.toLowerCase();
        const prod = q ? allProducts.find((p) => p.code?.toLowerCase() === q) ?? allProducts.find((p) => p.name.toLowerCase().includes(q)) : undefined;
        const name = l.name ?? prod?.name;
        if (!name) throw new Error("Fiecare linie are nevoie de o denumire sau de un produs din nomenclator.");
        const vatCategory = !company.vatPayer ? "O" : foreign && partner.vatPayer ? "AE" : "S";
        return {
          productId: prod?.id ?? null,
          name,
          unit: l.unit ?? prod?.unit ?? "buc",
          quantity: l.quantity,
          unitPrice: l.unit_price ?? prod?.price ?? 0,
          vatRate: vatCategory === "S" ? (l.vat_rate ?? prod?.vatRate ?? company.defaultVatRate) : 0,
          vatCategory,
        };
      });
      const currency = (input.currency ?? partner.defaultCurrency ?? company.defaultCurrency).toUpperCase();
      const rate = currency === "RON" ? 1 : ((await getExchangeRate(currency))?.rate ?? 1);
      const today = todayIso();
      const id = await createDocument(
        { companyId: ctx.companyId, userId: ctx.userId, userName: ctx.userName },
        {
          kind: "invoice",
          partnerId: partner.id,
          issueDate: today,
          dueDate: format(addDays(new Date(), partner.paymentTermDays ?? company.defaultDueDays), "yyyy-MM-dd"),
          currency,
          exchangeRate: rate,
          notes: input.notes ?? (foreign && partner.vatPayer ? "Taxare inversă — art. 278 alin. (2) Cod fiscal" : null),
          issuedBy: ctx.userName,
          issue: false,
          lines,
        },
      );
      const doc = await db.query.documents.findFirst({ where: eq(documents.id, id) });
      return { created: true, status: "ciornă", id, number: doc?.fullNumber, client: partner.name, total: doc?.total, currency, edit_link: `/facturi/${id}/editare`, link: `/facturi/${id}` };
    },
  }),

  tool({
    name: "log_time",
    label: "Pontez orele",
    description: "Adaugă în pontajul utilizatorului curent ore lucrate pe un proiect (ca ciornă, de trimis spre aprobare din pagina Pontaj).",
    permission: "timesheet.own",
    mutates: true,
    schema: z.object({
      project: z.string(),
      hours: z.number().min(0.25).max(24),
      date: zDate.optional(),
      description: z.string().optional(),
    }),
    run: async (ctx, input) => {
      if (!ctx.teamMemberId) throw new Error("Contul tău nu este asociat unui membru al echipei, deci nu pot ponta.");
      const p = await resolveProject(ctx.companyId, input.project);
      const date = input.date ?? todayIso();
      const [e] = await db
        .insert(timeEntries)
        .values({ companyId: ctx.companyId, memberId: ctx.teamMemberId, projectId: p.id, date, hours: input.hours, description: input.description ?? null, billable: p.billingType !== "non_billable", status: "draft" })
        .returning();
      return { created: true, id: e.id, project: p.name, date, hours: input.hours, status: "ciornă", link: `/pontaj?week=${date}` };
    },
  }),
] as const;

export type AssistantToolName = (typeof ASSISTANT_TOOLS)[number]["name"];

export function toolsFor(permissions: Permission[]): AssistantTool[] {
  return (ASSISTANT_TOOLS as readonly AssistantTool[]).filter((t) => !t.permission || permissions.includes(t.permission));
}

export function findTool(name: string, permissions: Permission[]) {
  return toolsFor(permissions).find((t) => t.name === name);
}

/** JSON Schema pentru parametrii unei unelte (folosit de OpenAI și de serverul MCP). */
export function toolJsonSchema(t: AssistantTool): Record<string, unknown> {
  const { $schema: _s, ...schema } = z.toJSONSchema(t.schema) as Record<string, unknown>;
  return schema;
}

/** Rulează o unealtă cu validare; erorile devin mesaje lizibile pentru model. */
export async function executeTool(ctx: ToolCtx, name: string, rawArgs: unknown) {
  const t = findTool(name, ctx.permissions);
  if (!t) return { ok: false as const, error: `Unealta „${name}” nu există sau nu ai permisiunea necesară.` };
  const parsed = t.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) return { ok: false as const, error: `Parametri invalizi: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
  try {
    return { ok: true as const, data: await t.run(ctx, parsed.data) };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}
