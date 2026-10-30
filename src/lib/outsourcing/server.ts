import "server-only";
import { and, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { getExchangeRate } from "@/lib/anaf/bnr";
import { can, type AppContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { documents, exchangeRates, partners, projectMembers, projects, teamMembers, timeEntries, timeOff } from "@/lib/db/schema";
import { expandRanges } from "@/lib/outsourcing/dates";
import { capacityHours, convertAmount, pct, resolveRate, type FxRates } from "@/lib/outsourcing/metrics";
import type { ClientOption, MemberLite, ProjectLite } from "@/lib/outsourcing/types";
import { round2 } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Curs valutar (din cache-ul BNR, fără rețea dacă e posibil)          */
/* ------------------------------------------------------------------ */

/** Ultimul curs cunoscut pentru fiecare valută (RON = 1). Completează din BNR doar valutele lipsă. */
export async function getFxRates(needed: string[] = ["EUR"]): Promise<FxRates> {
  const rows = await db
    .select({ currency: exchangeRates.currency, rate: exchangeRates.rate })
    .from(exchangeRates)
    .orderBy(desc(exchangeRates.date))
    .limit(600);
  const fx: FxRates = { RON: 1 };
  for (const r of rows) if (!(r.currency in fx)) fx[r.currency] = r.rate;
  for (const c of needed) {
    if (fx[c]) continue;
    const r = await getExchangeRate(c).catch(() => null);
    if (r) fx[c] = r.rate;
  }
  return fx;
}

/* ------------------------------------------------------------------ */
/* Tarife                                                              */
/* ------------------------------------------------------------------ */

export type RateBook = {
  /** Tarif facturabil / oră în moneda proiectului. */
  rate: (projectId: string, memberId: string) => number;
  /** Cost intern / oră (RON). */
  cost: (memberId: string) => number;
  currency: (projectId: string) => string;
  fx: FxRates;
};

/** Încarcă tarifele firmei: override proiect → tarif membru (convertit în moneda proiectului) → tarif proiect. */
export async function loadRateBook(companyId: string, fx?: FxRates): Promise<RateBook> {
  const [members, projs, overrides] = await Promise.all([
    db
      .select({ id: teamMembers.id, rate: teamMembers.hourlyRate, currency: teamMembers.rateCurrency, cost: teamMembers.hourlyCost })
      .from(teamMembers)
      .where(eq(teamMembers.companyId, companyId)),
    db
      .select({ id: projects.id, rate: projects.hourlyRate, currency: projects.currency })
      .from(projects)
      .where(eq(projects.companyId, companyId)),
    db
      .select({ projectId: projectMembers.projectId, memberId: projectMembers.memberId, rate: projectMembers.hourlyRate })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(eq(projects.companyId, companyId)),
  ]);
  const rates = fx ?? (await getFxRates([...new Set([...members.map((m) => m.currency), ...projs.map((p) => p.currency)])]));
  const m = new Map(members.map((x) => [x.id, x]));
  const p = new Map(projs.map((x) => [x.id, x]));
  const o = new Map(overrides.map((x) => [`${x.projectId}:${x.memberId}`, x.rate]));
  const cache = new Map<string, number>();
  return {
    fx: rates,
    currency: (projectId) => p.get(projectId)?.currency ?? "EUR",
    cost: (memberId) => m.get(memberId)?.cost ?? 0,
    rate: (projectId, memberId) => {
      const key = `${projectId}:${memberId}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const proj = p.get(projectId);
      const mem = m.get(memberId);
      const currency = proj?.currency ?? "EUR";
      const memberRate = mem?.rate ? convertAmount(mem.rate, mem.currency, currency, rates) : null;
      const r = round2(resolveRate(o.get(key), memberRate, proj?.rate));
      cache.set(key, r);
      return r;
    },
  };
}

/** O intrare e facturată doar dacă factura asociată există și nu a fost anulată. */
export function isInvoiced(documentId: string | null, documentStatus: string | null | undefined): boolean {
  return !!documentId && !!documentStatus && documentStatus !== "cancelled";
}

/* ------------------------------------------------------------------ */
/* Statistici proiect                                                  */
/* ------------------------------------------------------------------ */

export type ProjectStats = {
  hours: number;
  billableHours: number;
  /** venit estimat în moneda proiectului */
  revenue: number;
  revenueRon: number;
  costRon: number;
  marginRon: number;
  marginPct: number;
  uninvoicedApprovedHours: number;
  byMember: Record<string, number>;
};

const emptyStats = (): ProjectStats => ({
  hours: 0,
  billableHours: 0,
  revenue: 0,
  revenueRon: 0,
  costRon: 0,
  marginRon: 0,
  marginPct: 0,
  uninvoicedApprovedHours: 0,
  byMember: {},
});

/**
 * Ore, venit estimat (ore facturabile × tarif), cost (ore × cost intern) și marjă pe proiect.
 * Proiectele retainer: venit = retainer × lunile cu activitate; nefacturabile: venit 0.
 */
export async function getProjectStats(
  companyId: string,
  opts: { projectIds?: string[]; from?: string; to?: string; rates?: RateBook } = {},
): Promise<Map<string, ProjectStats>> {
  const where: SQL[] = [eq(timeEntries.companyId, companyId)];
  if (opts.projectIds?.length) where.push(inArray(timeEntries.projectId, opts.projectIds));
  if (opts.from) where.push(gte(timeEntries.date, opts.from));
  if (opts.to) where.push(lte(timeEntries.date, opts.to));
  const [entries, projs, rates] = await Promise.all([
    db
      .select({
        projectId: timeEntries.projectId,
        memberId: timeEntries.memberId,
        date: timeEntries.date,
        hours: timeEntries.hours,
        billable: timeEntries.billable,
        status: timeEntries.status,
        invoiced: timeEntries.invoicedDocumentId,
        docStatus: documents.status,
      })
      .from(timeEntries)
      .leftJoin(documents, eq(documents.id, timeEntries.invoicedDocumentId))
      .where(and(...where)),
    db
      .select({ id: projects.id, billingType: projects.billingType, retainer: projects.monthlyRetainer, currency: projects.currency })
      .from(projects)
      .where(eq(projects.companyId, companyId)),
    opts.rates ?? loadRateBook(companyId),
  ]);
  const projMap = new Map(projs.map((p) => [p.id, p]));
  const out = new Map<string, ProjectStats>();
  const months = new Map<string, Set<string>>();
  for (const e of entries) {
    const p = projMap.get(e.projectId);
    if (!p) continue;
    let s = out.get(e.projectId);
    if (!s) out.set(e.projectId, (s = emptyStats()));
    s.hours += e.hours;
    s.byMember[e.memberId] = (s.byMember[e.memberId] ?? 0) + e.hours;
    s.costRon += e.hours * rates.cost(e.memberId);
    const billable = e.billable && p.billingType !== "non_billable";
    if (billable) {
      s.billableHours += e.hours;
      if (p.billingType !== "retainer") s.revenue += e.hours * rates.rate(e.projectId, e.memberId);
      if (e.status === "approved" && !isInvoiced(e.invoiced, e.docStatus)) s.uninvoicedApprovedHours += e.hours;
    }
    if (p.billingType === "retainer" && e.hours > 0) {
      let set = months.get(e.projectId);
      if (!set) months.set(e.projectId, (set = new Set()));
      set.add(e.date.slice(0, 7));
    }
  }
  for (const [id, s] of out) {
    const p = projMap.get(id)!;
    if (p.billingType === "retainer") s.revenue = (p.retainer ?? 0) * (months.get(id)?.size ?? 0);
    s.hours = round2(s.hours);
    s.billableHours = round2(s.billableHours);
    s.uninvoicedApprovedHours = round2(s.uninvoicedApprovedHours);
    s.revenue = round2(s.revenue);
    s.revenueRon = round2(convertAmount(s.revenue, p.currency, "RON", rates.fx));
    s.costRon = round2(s.costRon);
    s.marginRon = round2(s.revenueRon - s.costRon);
    s.marginPct = s.revenueRon > 0 ? (s.marginRon / s.revenueRon) * 100 : 0;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Utilizare membri                                                    */
/* ------------------------------------------------------------------ */

/** Zilele de concediu (implicit doar aprobate) pe membru, în intervalul dat. */
export async function getOffDaysByMember(
  companyId: string,
  from: string,
  to: string,
  statuses: ("approved" | "pending")[] = ["approved"],
): Promise<Map<string, Set<string>>> {
  const rows = await db
    .select({ memberId: timeOff.memberId, startDate: timeOff.startDate, endDate: timeOff.endDate })
    .from(timeOff)
    .where(and(eq(timeOff.companyId, companyId), inArray(timeOff.status, statuses), lte(timeOff.startDate, to), gte(timeOff.endDate, from)));
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = expandRanges([r], from, to);
    const cur = map.get(r.memberId);
    if (cur) set.forEach((d) => cur.add(d));
    else map.set(r.memberId, set);
  }
  return map;
}

export type MemberUtilization = {
  hours: number;
  billableHours: number;
  capacity: number;
  /** ore pontate / capacitate (%) */
  utilization: number;
  /** ore facturabile / ore pontate (%) */
  billablePct: number;
};

/** Utilizarea fiecărui membru activ în interval, din pontaj (capacitate fără weekend, sărbători, concedii aprobate). */
export async function getMemberUtilization(companyId: string, from: string, to: string): Promise<Map<string, MemberUtilization>> {
  const [members, entries, off] = await Promise.all([
    db
      .select({ id: teamMembers.id, weeklyCapacity: teamMembers.weeklyCapacity })
      .from(teamMembers)
      .where(eq(teamMembers.companyId, companyId)),
    db
      .select({ memberId: timeEntries.memberId, hours: timeEntries.hours, billable: timeEntries.billable, billingType: projects.billingType })
      .from(timeEntries)
      .innerJoin(projects, eq(projects.id, timeEntries.projectId))
      .where(and(eq(timeEntries.companyId, companyId), gte(timeEntries.date, from), lte(timeEntries.date, to))),
    getOffDaysByMember(companyId, from, to),
  ]);
  const out = new Map<string, MemberUtilization>();
  for (const m of members) {
    out.set(m.id, { hours: 0, billableHours: 0, capacity: capacityHours(m.weeklyCapacity, from, to, off.get(m.id)), utilization: 0, billablePct: 0 });
  }
  for (const e of entries) {
    const u = out.get(e.memberId);
    if (!u) continue;
    u.hours += e.hours;
    if (e.billable && e.billingType !== "non_billable") u.billableHours += e.hours;
  }
  for (const u of out.values()) {
    u.hours = round2(u.hours);
    u.billableHours = round2(u.billableHours);
    u.utilization = pct(u.hours, u.capacity);
    u.billablePct = pct(u.billableHours, u.hours);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Acces                                                               */
/* ------------------------------------------------------------------ */

/** Poate utilizatorul curent să modifice pontajul membrului? (propriul pontaj sau aprobator) */
export async function assertTimesheetAccess(ctx: AppContext, memberId: string) {
  const member = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.id, memberId), eq(teamMembers.companyId, ctx.company.id)),
  });
  if (!member) throw new Error("Membrul echipei nu există.");
  const own = memberId === ctx.teamMemberId && can(ctx, "timesheet.own");
  if (!own && !can(ctx, "timesheet.approve")) throw new Error("Nu poți modifica pontajul altui coleg.");
  return member;
}

export async function getCompanyProject(companyId: string, projectId: string) {
  const p = await db.query.projects.findFirst({ where: and(eq(projects.id, projectId), eq(projects.companyId, companyId)) });
  if (!p) throw new Error("Proiectul nu există.");
  return p;
}

export async function getCompanyMember(companyId: string, memberId: string) {
  const m = await db.query.teamMembers.findFirst({ where: and(eq(teamMembers.id, memberId), eq(teamMembers.companyId, companyId)) });
  if (!m) throw new Error("Membrul echipei nu există.");
  return m;
}

/** Poate vedea sume (tarife, venituri, costuri)? */
export function canSeeMoney(ctx: AppContext): boolean {
  return can(ctx, "projects.manage") || can(ctx, "billing");
}

/* ------------------------------------------------------------------ */
/* Liste pentru formulare (serializabile)                              */
/* ------------------------------------------------------------------ */

export async function loadMembersLite(companyId: string): Promise<MemberLite[]> {
  const rows = await db.query.teamMembers.findMany({ where: eq(teamMembers.companyId, companyId), orderBy: (t, { asc }) => [asc(t.name)] });
  return rows.map((m) => ({
    id: m.id,
    name: m.name,
    color: m.color,
    position: m.position,
    department: m.department,
    weeklyCapacity: m.weeklyCapacity,
    active: m.active,
  }));
}

export async function loadProjectsLite(companyId: string): Promise<ProjectLite[]> {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      code: projects.code,
      color: projects.color,
      status: projects.status,
      billingType: projects.billingType,
      currency: projects.currency,
      clientName: partners.name,
    })
    .from(projects)
    .leftJoin(partners, eq(partners.id, projects.clientId))
    .where(eq(projects.companyId, companyId))
    .orderBy(projects.name);
  return rows;
}

export async function loadClientOptions(companyId: string): Promise<ClientOption[]> {
  const rows = await db
    .select({ id: partners.id, name: partners.name, currency: partners.defaultCurrency })
    .from(partners)
    .where(and(eq(partners.companyId, companyId), inArray(partners.kind, ["client", "both"]), eq(partners.active, true)))
    .orderBy(partners.name);
  return rows;
}
