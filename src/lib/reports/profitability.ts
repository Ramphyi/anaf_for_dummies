import "server-only";
import { and, eq, gte, lte, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { partners, projectMembers, projects, purchaseInvoices, teamMembers, timeEntries } from "@/lib/db/schema";
import { round2, sum } from "@/lib/utils";
import { docRon, latestRates, loadSalesInvoices, toRon } from "./common";
import { monthKey, monthsInPeriod } from "./period";

export type ProjectProfitRow = {
  id: string;
  name: string;
  code: string | null;
  color: string;
  clientId: string | null;
  clientName: string | null;
  billingType: string;
  status: string;
  currency: string;
  hours: number;
  billableHours: number;
  invoiced: number;
  estimated: number;
  laborCost: number;
  purchaseCost: number;
  cost: number;
};

export type ClientProfitRow = {
  key: string;
  name: string;
  projects: number;
  hours: number;
  invoiced: number;
  estimated: number;
  laborCost: number;
  purchaseCost: number;
  cost: number;
};

export type ProfitabilityReport = Awaited<ReturnType<typeof getProfitabilityReport>>;

export async function getProfitabilityReport(companyId: string, period: { from: string; to: string }) {
  const rates = await latestRates();
  const fx = (amount: number, currency: string) => (currency === "RON" ? amount : amount * (rates[currency] ?? rates.EUR ?? 5));

  const [projectRows, members, overrides, entries, docs, purchases, clientRows] = await Promise.all([
    db.query.projects.findMany({ where: eq(projects.companyId, companyId) }),
    db.query.teamMembers.findMany({ where: eq(teamMembers.companyId, companyId) }),
    db
      .select({ projectId: projectMembers.projectId, memberId: projectMembers.memberId, rate: projectMembers.hourlyRate })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(eq(projects.companyId, companyId)),
    db.query.timeEntries.findMany({
      where: and(eq(timeEntries.companyId, companyId), eq(timeEntries.status, "approved"), gte(timeEntries.date, period.from), lte(timeEntries.date, period.to)),
      columns: { memberId: true, projectId: true, date: true, hours: true, billable: true },
    }),
    loadSalesInvoices(companyId, period.from, period.to),
    db.query.purchaseInvoices.findMany({
      where: and(eq(purchaseInvoices.companyId, companyId), ne(purchaseInvoices.status, "cancelled"), gte(purchaseInvoices.issueDate, period.from), lte(purchaseInvoices.issueDate, period.to)),
      columns: { projectId: true, issueDate: true, subtotal: true, currency: true, exchangeRate: true, category: true },
    }),
    db.query.partners.findMany({ where: eq(partners.companyId, companyId), columns: { id: true, name: true } }),
  ]);

  const memberById = new Map(members.map((m) => [m.id, m]));
  const projectById = new Map(projectRows.map((p) => [p.id, p]));
  const clientName = new Map(clientRows.map((c) => [c.id, c.name]));
  const overrideRate = new Map(overrides.filter((o) => o.rate != null).map((o) => [`${o.projectId}|${o.memberId}`, o.rate!]));
  const monthsCount = monthsInPeriod(period.from, period.to).length;

  /* agregare per proiect */
  const acc = new Map<string, ProjectProfitRow>();
  const ensure = (projectId: string): ProjectProfitRow | null => {
    const p = projectById.get(projectId);
    if (!p) return null;
    let row = acc.get(projectId);
    if (!row) {
      row = {
        id: p.id,
        name: p.name,
        code: p.code,
        color: p.color,
        clientId: p.clientId,
        clientName: p.clientId ? (clientName.get(p.clientId) ?? null) : null,
        billingType: p.billingType,
        status: p.status,
        currency: p.currency,
        hours: 0,
        billableHours: 0,
        invoiced: 0,
        estimated: 0,
        laborCost: 0,
        purchaseCost: 0,
        cost: 0,
      };
      acc.set(projectId, row);
    }
    return row;
  };

  const laborByMonth = new Map<string, number>();
  for (const e of entries) {
    const row = ensure(e.projectId);
    const m = memberById.get(e.memberId);
    if (!row || !m) continue;
    const p = projectById.get(e.projectId)!;
    row.hours += e.hours;
    const cost = e.hours * m.hourlyCost; // costul intern e în RON
    row.laborCost += cost;
    laborByMonth.set(monthKey(e.date), (laborByMonth.get(monthKey(e.date)) ?? 0) + cost);
    if (e.billable && p.billingType !== "non_billable") {
      row.billableHours += e.hours;
      if (p.billingType !== "retainer") {
        const override = overrideRate.get(`${p.id}|${m.id}`);
        const rate = override ?? p.hourlyRate ?? m.hourlyRate;
        const currency = override != null || p.hourlyRate != null ? p.currency : m.rateCurrency;
        row.estimated += fx(e.hours * rate, currency);
      }
    }
  }
  // retainer: abonamentul lunar × lunile perioadei (dacă proiectul nu e anulat)
  for (const p of projectRows) {
    if (p.billingType === "retainer" && p.monthlyRetainer && p.status !== "cancelled") {
      const active = monthsInPeriod(period.from, period.to).filter(
        (m) => (!p.startDate || p.startDate.slice(0, 7) <= m.key) && (!p.endDate || p.endDate.slice(0, 7) >= m.key),
      ).length;
      if (active) ensure(p.id)!.estimated += fx(p.monthlyRetainer * active, p.currency);
    }
  }

  const revenueByMonth = new Map<string, number>();
  const revenueByClient = new Map<string, number>();
  for (const d of docs) {
    const { net } = docRon(d);
    revenueByMonth.set(monthKey(d.issueDate), (revenueByMonth.get(monthKey(d.issueDate)) ?? 0) + net);
    const ck = d.partnerId ?? `name:${d.clientName}`;
    revenueByClient.set(ck, (revenueByClient.get(ck) ?? 0) + net);
    if (d.projectId) {
      const row = ensure(d.projectId);
      if (row) row.invoiced += net;
    }
  }

  const purchasesByMonth = new Map<string, number>();
  for (const pi of purchases) {
    const v = toRon(pi.subtotal, pi.currency, pi.exchangeRate);
    purchasesByMonth.set(monthKey(pi.issueDate), (purchasesByMonth.get(monthKey(pi.issueDate)) ?? 0) + v);
    if (pi.projectId) {
      const row = ensure(pi.projectId);
      if (row) row.purchaseCost += v;
    }
  }

  const projectsOut = [...acc.values()]
    .map((r) => {
      const laborCost = round2(r.laborCost);
      const purchaseCost = round2(r.purchaseCost);
      return {
        ...r,
        hours: round2(r.hours),
        billableHours: round2(r.billableHours),
        invoiced: round2(r.invoiced),
        estimated: round2(r.estimated),
        laborCost,
        purchaseCost,
        cost: round2(laborCost + purchaseCost),
      };
    })
    .filter((r) => r.hours || r.invoiced || r.estimated || r.cost)
    .sort((a, b) => Math.max(b.invoiced, b.estimated) - Math.max(a.invoiced, a.estimated));

  /* per client: venit facturat total + costurile proiectelor clientului */
  const clientsAcc = new Map<string, ClientProfitRow>();
  const ensureClient = (key: string, name: string) => {
    let c = clientsAcc.get(key);
    if (!c) {
      c = { key, name, projects: 0, hours: 0, invoiced: 0, estimated: 0, laborCost: 0, purchaseCost: 0, cost: 0 };
      clientsAcc.set(key, c);
    }
    return c;
  };
  for (const [key, net] of revenueByClient) {
    const name = key.startsWith("name:") ? key.slice(5) : (clientName.get(key) ?? docs.find((d) => d.partnerId === key)?.clientName ?? "—");
    ensureClient(key, name).invoiced += net;
  }
  for (const p of projectsOut) {
    const key = p.clientId ?? "__internal__";
    const c = ensureClient(key, p.clientName ?? "Intern / fără client");
    c.projects++;
    c.hours += p.hours;
    c.estimated += p.estimated;
    c.laborCost += p.laborCost;
    c.purchaseCost += p.purchaseCost;
  }
  const clientsOut = [...clientsAcc.values()]
    .map((c) => ({
      ...c,
      hours: round2(c.hours),
      invoiced: round2(c.invoiced),
      estimated: round2(c.estimated),
      laborCost: round2(c.laborCost),
      purchaseCost: round2(c.purchaseCost),
      cost: round2(c.laborCost + c.purchaseCost),
    }))
    .sort((a, b) => b.invoiced - a.invoiced);

  /* P&L lunar */
  const pnl = monthsInPeriod(period.from, period.to).map((m) => {
    const revenue = round2(revenueByMonth.get(m.key) ?? 0);
    const purchasesM = round2(purchasesByMonth.get(m.key) ?? 0);
    const labor = round2(laborByMonth.get(m.key) ?? 0);
    return { key: m.key, label: m.label, long: m.long, revenue, purchases: purchasesM, labor, profit: round2(revenue - purchasesM - labor) };
  });

  const revenue = round2(sum(pnl, (m) => m.revenue));
  const purchasesTotal = round2(sum(pnl, (m) => m.purchases));
  const labor = round2(sum(pnl, (m) => m.labor));
  const profit = round2(revenue - purchasesTotal - labor);

  return {
    eurRate: rates.EUR ?? 5,
    monthsCount,
    projects: projectsOut,
    clients: clientsOut,
    pnl,
    kpis: {
      revenue,
      purchases: purchasesTotal,
      labor,
      costs: round2(purchasesTotal + labor),
      profit,
      margin: revenue ? (profit / revenue) * 100 : 0,
      estimated: round2(sum(projectsOut, (p) => p.estimated)),
      hours: round2(sum(projectsOut, (p) => p.hours)),
      sparkProfit: pnl.map((m) => m.profit),
      sparkRevenue: pnl.map((m) => m.revenue),
    },
  };
}
