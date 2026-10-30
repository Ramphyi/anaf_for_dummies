/**
 * Date demo: o firmă de outsourcing digital cu 12 luni de activitate.
 * Rulare: npm run db:seed  (după npm run db:migrate). Idempotent: șterge datele existente.
 * Cont: demo@anaffordummies.ro / demo1234 (plus contabil@, manager@, ana@ — aceeași parolă).
 */
import { createClient } from "@libsql/client";
import { addDays, eachDayOfInterval, format, isWeekend, startOfWeek, subDays, subMonths } from "date-fns";
import { drizzle } from "drizzle-orm/libsql";
import { scryptSync, randomBytes } from "node:crypto";
import * as s from "./schema";
import { computeTotals } from "../documents/totals";
import { RO_PUBLIC_HOLIDAYS } from "../constants";

const client = createClient({ url: process.env.DATABASE_URL ?? "file:./data/anaf-for-dummies.db", authToken: process.env.DATABASE_AUTH_TOKEN });
const db = drizzle({ client, schema: s });

/* ---------------------------- utilitare ---------------------------- */
let seed = 20261027;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => min + rand() * (max - min);
const int = (min: number, max: number) => Math.floor(between(min, max + 1));
const r2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const iso = (d: Date) => format(d, "yyyy-MM-dd");
const uuid = () => crypto.randomUUID();
const TODAY = new Date();
const today = iso(TODAY);

function hash(password: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 64).toString("hex")}`;
}
function cui(base: string) {
  const key = "753217532";
  const digits = base.padStart(9, "0");
  let total = 0;
  for (let i = 0; i < 9; i++) total += Number(digits[i]) * Number(key[i]);
  let c = (total * 10) % 11;
  if (c === 10) c = 0;
  return `${base}${c}`;
}
async function chunked<T>(rows: T[], fn: (batch: T[]) => Promise<unknown>, size = 200) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

async function wipe() {
  const tables = [
    s.assistantMessages, s.assistantConversations, s.assistantSettings, s.mcpServers, s.apiTokens,
    s.activityLog, s.timeOff, s.allocations, s.timeEntries, s.tasks, s.projectMembers, s.projects, s.teamMembers,
    s.exchangeRates, s.anafLogs, s.etransportDeclarations, s.spvMessages, s.anafConnections, s.stockMovements,
    s.stockDocuments, s.purchaseLines, s.purchaseInvoices, s.recurringInvoices, s.payments, s.documentLines,
    s.documents, s.warehouses, s.products, s.partners, s.documentSeries, s.memberships, s.companies, s.users,
  ];
  for (const t of tables) await db.delete(t);
}

async function main() {
  console.log("→ Șterg datele existente…");
  await wipe();

  /* ------------------------------ utilizatori ------------------------------ */
  const pw = hash("demo1234");
  const [demo, accountant, manager, ana] = await db
    .insert(s.users)
    .values([
      { email: "demo@anaffordummies.ro", name: "Andrei Popescu", passwordHash: pw, avatarColor: "#6d5dfc" },
      { email: "contabil@anaffordummies.ro", name: "Elena Marinescu", passwordHash: pw, avatarColor: "#14b8a6" },
      { email: "manager@anaffordummies.ro", name: "Radu Ionescu", passwordHash: pw, avatarColor: "#f59e0b" },
      { email: "ana@anaffordummies.ro", name: "Ana Dumitrescu", passwordHash: pw, avatarColor: "#ec4899" },
    ])
    .returning();

  /* -------------------------------- firme -------------------------------- */
  const [company, labs] = await db
    .insert(s.companies)
    .values([
      {
        name: "Pixelcraft Digital SRL",
        cui: cui("4318265"),
        regCom: "J12/4521/2019",
        vatPayer: true,
        address: "Str. Calea Dorobanților nr. 14, et. 3",
        city: "Cluj-Napoca",
        county: "CJ",
        postalCode: "400117",
        iban: "RO49AAAA1B31007593840000",
        bank: "Banca Demo SA",
        email: "facturare@pixelcraft.ro",
        phone: "+40 264 555 120",
        website: "pixelcraft.ro",
        shareCapital: "200 RON",
        defaultVatRate: 21,
        defaultDueDays: 15,
        invoiceFooter: "Vă mulțumim pentru colaborare!",
        brandColor: "#6d5dfc",
      },
      {
        name: "Pixelcraft Labs SRL",
        cui: cui("4790112"),
        regCom: "J40/880/2023",
        vatPayer: false,
        address: "Bd. Unirii nr. 27",
        city: "Sector 3",
        county: "B",
        email: "labs@pixelcraft.ro",
      },
    ])
    .returning();
  const C = company.id;

  await db.insert(s.anafConnections).values([
    { companyId: C, environment: "simulation", lastSyncAt: subDays(TODAY, 1) },
    { companyId: labs.id, environment: "simulation" },
  ]);

  const series = await db
    .insert(s.documentSeries)
    .values([
      { companyId: C, type: "invoice", prefix: "PXD", isDefault: true },
      { companyId: C, type: "invoice", prefix: "PXDEX", isDefault: false },
      { companyId: C, type: "proforma", prefix: "PRF", isDefault: true },
      { companyId: C, type: "notice", prefix: "AVZ", isDefault: true },
      { companyId: C, type: "receipt", prefix: "CHT", isDefault: true },
      { companyId: labs.id, type: "invoice", prefix: "LAB", isDefault: true },
      { companyId: labs.id, type: "proforma", prefix: "LPF", isDefault: true },
      { companyId: labs.id, type: "notice", prefix: "LAV", isDefault: true },
      { companyId: labs.id, type: "receipt", prefix: "LCH", isDefault: true },
    ])
    .returning();
  const invSeries = series.find((x) => x.prefix === "PXD")!;
  const prfSeries = series.find((x) => x.prefix === "PRF")!;
  const avzSeries = series.find((x) => x.prefix === "AVZ")!;
  const chtSeries = series.find((x) => x.prefix === "CHT")!;

  const [mainWh, bucWh] = await db
    .insert(s.warehouses)
    .values([
      { companyId: C, name: "Depozit Cluj", code: "CJ1", isDefault: true, address: "Cluj-Napoca" },
      { companyId: C, name: "Birou București", code: "B1", address: "București, Sector 1" },
      { companyId: labs.id, name: "Depozit principal", code: "DEP1", isDefault: true },
    ])
    .returning();

  /* -------------------------------- echipă -------------------------------- */
  const teamSeed = [
    { name: "Andrei Popescu", position: "CEO & Solution Architect", department: "Management", seniority: "principal", cost: 160, rate: 75, color: "#6d5dfc", skills: ["Arhitectură", "AWS", "Strategie"], userId: demo.id },
    { name: "Radu Ionescu", position: "Delivery Manager", department: "Management", seniority: "lead", cost: 120, rate: 55, color: "#f59e0b", skills: ["Scrum", "Jira", "Client relations"], userId: manager.id },
    { name: "Ana Dumitrescu", position: "Senior Frontend Developer", department: "Engineering", seniority: "senior", cost: 110, rate: 50, color: "#ec4899", skills: ["React", "Next.js", "TypeScript"], userId: ana.id },
    { name: "Mihai Stan", position: "Senior Backend Developer", department: "Engineering", seniority: "senior", cost: 115, rate: 52, color: "#3b82f6", skills: ["Node.js", "PostgreSQL", "Go"] },
    { name: "Ioana Pop", position: "Mid Fullstack Developer", department: "Engineering", seniority: "mid", cost: 80, rate: 38, color: "#22c55e", skills: ["Vue", "Laravel", "MySQL"] },
    { name: "Vlad Georgescu", position: "Mobile Developer", department: "Engineering", seniority: "mid", cost: 85, rate: 40, color: "#06b6d4", skills: ["React Native", "Swift", "Kotlin"] },
    { name: "Bianca Rusu", position: "UI/UX Designer", department: "Design", seniority: "senior", cost: 95, rate: 45, color: "#8b5cf6", skills: ["Figma", "Design systems", "User research"] },
    { name: "Cristian Matei", position: "QA Automation Engineer", department: "QA", seniority: "mid", cost: 70, rate: 32, color: "#f97316", skills: ["Playwright", "Cypress", "k6"] },
    { name: "Daria Nistor", position: "DevOps Engineer", department: "DevOps", seniority: "senior", cost: 120, rate: 55, color: "#14b8a6", skills: ["Kubernetes", "Terraform", "GCP"] },
    { name: "Tudor Enache", position: "Junior Frontend Developer", department: "Engineering", seniority: "junior", cost: 50, rate: 25, color: "#84cc16", skills: ["React", "CSS"] },
    { name: "Elena Marinescu", position: "Contabil", department: "Management", seniority: "senior", cost: 90, rate: 0, color: "#e11d48", skills: ["Contabilitate", "Fiscalitate"], userId: accountant.id },
  ] as const;
  const team = await db
    .insert(s.teamMembers)
    .values(
      teamSeed.map((t, i) => ({
        companyId: C,
        userId: "userId" in t ? t.userId : null,
        name: t.name,
        email: `${t.name.split(" ")[0].toLowerCase()}@pixelcraft.ro`,
        position: t.position,
        department: t.department,
        seniority: t.seniority,
        employmentType: i === 5 ? ("pfa" as const) : i === 9 ? ("freelancer" as const) : ("cim" as const),
        hourlyCost: t.cost,
        hourlyRate: t.rate,
        rateCurrency: "EUR",
        weeklyCapacity: i === 9 ? 30 : 40,
        color: t.color,
        skills: [...t.skills],
        startDate: iso(subMonths(TODAY, 30 - i * 2)),
      })),
    )
    .returning();
  const tm = (name: string) => team.find((t) => t.name === name)!;
  const billable = team.filter((t) => t.department !== "Management" || t.name === "Andrei Popescu");

  await db.insert(s.memberships).values([
    { userId: demo.id, companyId: C, role: "owner", teamMemberId: tm("Andrei Popescu").id },
    { userId: accountant.id, companyId: C, role: "accountant", teamMemberId: tm("Elena Marinescu").id },
    { userId: manager.id, companyId: C, role: "manager", teamMemberId: tm("Radu Ionescu").id },
    { userId: ana.id, companyId: C, role: "employee", teamMemberId: tm("Ana Dumitrescu").id },
    { userId: demo.id, companyId: labs.id, role: "owner" },
  ]);
  await db.update(s.users).set({ lastCompanyId: C });

  /* ------------------------------- parteneri ------------------------------- */
  const clientSeed = [
    { name: "Nimbus Retail SRL", cui: cui("3561012"), regCom: "J40/2210/2015", city: "Sector 2", county: "B", address: "Șos. Pipera nr. 42", vat: true, email: "ap@nimbus-retail.ro", term: 30 },
    { name: "Atlas Logistic SA", cui: cui("1844377"), regCom: "J23/118/2004", city: "Otopeni", county: "IF", address: "Str. Aeroportului nr. 3", vat: true, email: "facturi@atlaslogistic.ro", term: 45 },
    { name: "Brightwave Media SRL", cui: cui("4022871"), regCom: "J12/990/2018", city: "Cluj-Napoca", county: "CJ", address: "Str. Memorandumului nr. 28", vat: true, email: "office@brightwave.ro", term: 15 },
    { name: "Delta Health Clinics SRL", cui: cui("3389456"), regCom: "J22/451/2014", city: "Iași", county: "IS", address: "Bd. Independenței nr. 9", vat: true, email: "contabilitate@deltahealth.ro", term: 30 },
    { name: "Evergreen Foods SRL", cui: cui("2977310"), regCom: "J08/77/2011", city: "Brașov", county: "BV", address: "Str. Lungă nr. 120", vat: true, email: "ap@evergreenfoods.ro", term: 30 },
    { name: "FinTrack Romania SRL", cui: cui("4410276"), regCom: "J40/7712/2021", city: "Sector 1", county: "B", address: "Calea Victoriei nr. 155", vat: true, email: "finance@fintrack.ro", term: 15 },
    { name: "Helios Energy SA", cui: cui("1600235"), regCom: "J35/301/2003", city: "Timișoara", county: "TM", address: "Calea Aradului nr. 61", vat: true, email: "achizitii@helios-energy.ro", term: 60 },
    { name: "Orbit Travel SRL", cui: cui("3812790"), regCom: "J13/1402/2017", city: "Constanța", county: "CT", address: "Bd. Mamaia nr. 255", vat: true, email: "office@orbittravel.ro", term: 15 },
    { name: "Kronos Manufacturing SRL", cui: cui("2235118"), regCom: "J05/660/2008", city: "Oradea", county: "BH", address: "Str. Universității nr. 1", vat: true, email: "plati@kronos-mfg.ro", term: 30 },
    { name: "Startup Lab Cluj SRL", cui: cui("4688903"), regCom: "J12/3301/2022", city: "Cluj-Napoca", county: "CJ", address: "Str. Republicii nr. 107", vat: false, email: "hello@startuplab.ro", term: 7 },
  ];
  const foreignSeed = [
    { name: "Müller Software GmbH", cui: "DE298765432", city: "München", country: "DE", address: "Leopoldstraße 21", email: "billing@mueller-software.de", term: 30 },
    { name: "Tulip Commerce B.V.", cui: "NL859123456B01", city: "Amsterdam", country: "NL", address: "Keizersgracht 300", email: "invoices@tulipcommerce.nl", term: 30 },
  ];
  const clients = await db
    .insert(s.partners)
    .values([
      ...clientSeed.map((c) => ({
        companyId: C,
        kind: "client" as const,
        entityType: "pj" as const,
        name: c.name,
        cui: c.cui,
        regCom: c.regCom,
        vatPayer: c.vat,
        address: c.address,
        city: c.city,
        county: c.county,
        email: c.email,
        paymentTermDays: c.term,
        eInvoiceRegistered: true,
        contactPerson: pick(["Maria Stoica", "George Vasile", "Irina Lungu", "Paul Constantin", "Raluca Dinu"]),
        phone: `+40 7${int(20, 79)} ${int(100, 999)} ${int(100, 999)}`,
      })),
      ...foreignSeed.map((c) => ({
        companyId: C,
        kind: "client" as const,
        entityType: "pj" as const,
        name: c.name,
        cui: c.cui,
        vatPayer: true,
        address: c.address,
        city: c.city,
        country: c.country,
        email: c.email,
        paymentTermDays: c.term,
        defaultCurrency: "EUR",
      })),
      {
        companyId: C,
        kind: "client" as const,
        entityType: "pf" as const,
        name: "Ionescu Maria",
        address: "Str. Florilor nr. 5, ap. 12",
        city: "Sibiu",
        county: "SB",
        email: "maria.ionescu@email.ro",
      },
    ])
    .returning();

  const supplierSeed = [
    { name: "Nimbus Datacenter SRL", cui: cui("4120731"), city: "Sector 6", county: "B", address: "Bd. Iuliu Maniu nr. 7", cat: "software" },
    { name: "Papetăria Nordică SRL", cui: cui("3317762"), city: "Cluj-Napoca", county: "CJ", address: "Str. Fabricii nr. 21", cat: "altele" },
    { name: "Flux Utilități Urbane SA", cui: cui("1588201"), city: "Sector 1", county: "B", address: "Calea Victoriei nr. 155", cat: "utilitati" },
    { name: "Pixel Hardware Distribution SRL", cui: cui("2766019"), city: "Sector 2", county: "B", address: "Str. Fabrica de Glucoză nr. 11", cat: "hardware" },
    { name: "Imobiliare Centrum SRL", cui: cui("2510446"), city: "Cluj-Napoca", county: "CJ", address: "Piața Unirii nr. 1", cat: "chirie" },
    { name: "CloudSuite Licensing SRL", cui: cui("3990117"), city: "Sector 3", county: "B", address: "Str. Ion Câmpineanu nr. 11", cat: "software" },
    { name: "Velocity Curierat Express SRL", cui: cui("3901457"), city: "Iași", county: "IS", address: "Șos. Păcurari nr. 88", cat: "transport" },
    { name: "Georgescu Vlad PFA", cui: cui("4512036"), city: "Cluj-Napoca", county: "CJ", address: "Str. Observatorului nr. 34", cat: "salarii" },
    { name: "Expert Conta Cluj SRL", cui: cui("3077815"), city: "Cluj-Napoca", county: "CJ", address: "Str. Horea nr. 12", cat: "servicii" },
  ];
  const suppliers = await db
    .insert(s.partners)
    .values(
      supplierSeed.map((x) => ({
        companyId: C,
        kind: "supplier" as const,
        name: x.name,
        cui: x.cui,
        vatPayer: true,
        address: x.address,
        city: x.city,
        county: x.county,
        eInvoiceRegistered: true,
      })),
    )
    .returning();

  /* -------------------------------- produse -------------------------------- */
  const productSeed = [
    { code: "SRV-DEV-SR", name: "Dezvoltare software — Senior", unit: "ora", price: 245, type: "service" },
    { code: "SRV-DEV-MID", name: "Dezvoltare software — Mid", unit: "ora", price: 185, type: "service" },
    { code: "SRV-DEV-JR", name: "Dezvoltare software — Junior", unit: "ora", price: 120, type: "service" },
    { code: "SRV-UX", name: "UI/UX Design", unit: "ora", price: 210, type: "service" },
    { code: "SRV-QA", name: "QA & testare automată", unit: "ora", price: 155, type: "service" },
    { code: "SRV-OPS", name: "DevOps & infrastructură cloud", unit: "ora", price: 260, type: "service" },
    { code: "SRV-MNT", name: "Mentenanță aplicație — abonament", unit: "luna", price: 3500, type: "service" },
    { code: "SRV-HOST", name: "Hosting gestionat & monitorizare", unit: "luna", price: 890, type: "service" },
    { code: "SRV-AUDIT", name: "Audit tehnic & securitate", unit: "serviciu", price: 7800, type: "service" },
    { code: "SRV-CONS", name: "Consultanță arhitectură software", unit: "ora", price: 320, type: "service" },
    { code: "LIC-SAAS", name: "Licență platformă SaaS — anuală", unit: "an", price: 4800, type: "product" },
    { code: "HW-LAPTOP", name: "Laptop dezvoltare 32GB/1TB", unit: "buc", price: 8490, type: "product", stock: true, cost: 6290 },
    { code: "HW-MON27", name: 'Monitor 27" 4K IPS', unit: "buc", price: 1890, type: "product", stock: true, cost: 1499 },
    { code: "HW-DOCK", name: "Docking station USB-C", unit: "buc", price: 890, type: "product", stock: true, cost: 689 },
    { code: "HW-KIT", name: "Kit periferice (tastatură + mouse)", unit: "set", price: 420, type: "product", stock: true, cost: 290 },
  ] as const;
  const products = await db
    .insert(s.products)
    .values(
      productSeed.map((p) => ({
        companyId: C,
        code: p.code,
        name: p.name,
        unit: p.unit,
        price: p.price,
        type: p.type,
        vatRate: 21,
        trackStock: "stock" in p,
        purchasePrice: "cost" in p ? p.cost : null,
        ncCode: "stock" in p ? (p.code === "HW-LAPTOP" ? "84713000" : p.code === "HW-MON27" ? "85285210" : "84733020") : null,
        category: p.type === "service" ? "Servicii IT" : p.code.startsWith("HW") ? "Hardware" : "Licențe",
      })),
    )
    .returning();
  const prod = (code: string) => products.find((p) => p.code === code)!;
  const services = products.filter((p) => p.type === "service");

  /* ------------------------------ stoc inițial ------------------------------ */
  const stockProducts = products.filter((p) => p.trackStock);
  const stockDocs: (typeof s.stockDocuments.$inferInsert)[] = [];
  const stockMoves: (typeof s.stockMovements.$inferInsert)[] = [];
  const openingDate = iso(subMonths(TODAY, 11));
  const openingId = uuid();
  stockDocs.push({ id: openingId, companyId: C, type: "opening", number: "SI-00001", date: openingDate, warehouseId: mainWh.id, notes: "Sold inițial la preluare" });
  for (const p of stockProducts) stockMoves.push({ companyId: C, stockDocumentId: openingId, productId: p.id, warehouseId: mainWh.id, quantity: int(6, 14), unitCost: p.purchasePrice ?? 0, date: openingDate });
  for (let m = 9; m >= 1; m -= 3) {
    const id = uuid();
    const date = iso(subMonths(TODAY, m));
    stockDocs.push({ id, companyId: C, type: "nir", number: `NIR-${String(stockDocs.length).padStart(5, "0")}`, date, warehouseId: mainWh.id, partnerId: suppliers[3].id, notes: "Recepție marfă Pixel Hardware" });
    for (const p of stockProducts) stockMoves.push({ companyId: C, stockDocumentId: id, productId: p.id, warehouseId: mainWh.id, quantity: int(3, 8), unitCost: r2((p.purchasePrice ?? 0) * between(0.95, 1.05)), date });
  }
  const trId = uuid();
  stockDocs.push({ id: trId, companyId: C, type: "transfer", number: "TR-00001", date: iso(subMonths(TODAY, 2)), warehouseId: mainWh.id, targetWarehouseId: bucWh.id, notes: "Echipare birou București" });
  for (const p of stockProducts.slice(0, 3)) {
    stockMoves.push({ companyId: C, stockDocumentId: trId, productId: p.id, warehouseId: mainWh.id, quantity: -2, unitCost: p.purchasePrice ?? 0, date: iso(subMonths(TODAY, 2)) });
    stockMoves.push({ companyId: C, stockDocumentId: trId, productId: p.id, warehouseId: bucWh.id, quantity: 2, unitCost: p.purchasePrice ?? 0, date: iso(subMonths(TODAY, 2)) });
  }

  /* ------------------------------- proiecte ------------------------------- */
  const projectSeed = [
    { name: "Atlas — platformă de tracking flote", code: "ATL", client: "Atlas Logistic SA", billing: "time_materials", rate: 48, budgetHours: 2400, color: "#3b82f6", status: "active", months: 9, members: ["Mihai Stan", "Ana Dumitrescu", "Daria Nistor", "Cristian Matei", "Bianca Rusu"] },
    { name: "Nimbus — e-commerce headless", code: "NMB", client: "Nimbus Retail SRL", billing: "fixed", rate: 45, budgetAmount: 68000, budgetHours: 1500, color: "#ec4899", status: "active", months: 6, members: ["Ana Dumitrescu", "Ioana Pop", "Tudor Enache", "Bianca Rusu"] },
    { name: "Delta Health — aplicație pacienți", code: "DHC", client: "Delta Health Clinics SRL", billing: "time_materials", rate: 42, budgetHours: 1200, color: "#22c55e", status: "active", months: 5, members: ["Vlad Georgescu", "Mihai Stan", "Cristian Matei"] },
    { name: "FinTrack — mentenanță & suport", code: "FTR", client: "FinTrack Romania SRL", billing: "retainer", rate: 40, retainer: 4500, color: "#f59e0b", status: "active", months: 12, members: ["Ioana Pop", "Daria Nistor"] },
    { name: "Müller — modul raportare", code: "MUL", client: "Müller Software GmbH", billing: "time_materials", rate: 55, budgetHours: 640, color: "#8b5cf6", status: "active", months: 4, members: ["Mihai Stan", "Andrei Popescu", "Tudor Enache"] },
    { name: "Brightwave — redesign site", code: "BRW", client: "Brightwave Media SRL", billing: "fixed", rate: 40, budgetAmount: 24000, budgetHours: 520, color: "#06b6d4", status: "completed", months: 3, members: ["Bianca Rusu", "Tudor Enache"] },
    { name: "Helios — audit cloud", code: "HEL", client: "Helios Energy SA", billing: "time_materials", rate: 58, budgetHours: 160, color: "#ef4444", status: "planning", months: 0, members: ["Daria Nistor", "Andrei Popescu"] },
    { name: "Intern — R&D & training", code: "INT", client: null, billing: "non_billable", rate: 0, color: "#94a3b8", status: "active", months: 12, members: billable.map((b) => b.name) },
  ] as const;
  const projects = await db
    .insert(s.projects)
    .values(
      projectSeed.map((p) => ({
        companyId: C,
        clientId: p.client ? clients.find((c) => c.name === p.client)!.id : null,
        name: p.name,
        code: p.code,
        description: `Proiect ${p.name.split(" — ")[1] ?? p.name} pentru ${p.client ?? "uz intern"}.`,
        status: p.status,
        billingType: p.billing,
        hourlyRate: p.rate || null,
        currency: "EUR",
        budgetHours: "budgetHours" in p ? p.budgetHours : null,
        budgetAmount: "budgetAmount" in p ? p.budgetAmount : null,
        monthlyRetainer: "retainer" in p ? p.retainer : null,
        startDate: iso(subMonths(TODAY, p.months || 0)),
        endDate: p.status === "completed" ? iso(subMonths(TODAY, 1)) : p.status === "planning" ? iso(addDays(TODAY, 75)) : iso(addDays(TODAY, int(30, 180))),
        color: p.color,
        managerId: tm("Radu Ionescu").id,
      })),
    )
    .returning();
  const projByCode = (code: string) => projects.find((p) => p.code === code)!;

  await db.insert(s.projectMembers).values(
    projectSeed.flatMap((p) =>
      p.members.map((m) => ({
        projectId: projByCode(p.code).id,
        memberId: tm(m).id,
        role: tm(m).position,
      })),
    ),
  );

  /* -------------------------------- task-uri -------------------------------- */
  const taskTitles: Record<string, string[]> = {
    ATL: ["Hartă live cu poziția vehiculelor", "Integrare GPS provider (WebSocket)", "Rapoarte consum combustibil", "Alerte geofencing", "Optimizare query-uri rute", "Dashboard dispecer", "Teste E2E flux comenzi", "Migrare la Kubernetes"],
    NMB: ["Catalog produse cu filtre", "Checkout în 3 pași", "Integrare procesator plăți", "Pagini promoții CMS", "Optimizare Core Web Vitals", "Coș persistent cross-device", "Feed produse marketplace"],
    DHC: ["Programări online", "Notificări push", "Istoric consultații", "Autentificare biometrică", "Integrare laborator rezultate", "Accesibilitate WCAG 2.2"],
    FTR: ["Fix export CSV tranzacții", "Upgrade Node 24", "Monitorizare alerte Grafana", "Patch securitate dependențe", "Backup automat DB"],
    MUL: ["Generator rapoarte PDF", "Pivot table interactiv", "Export Excel cu formule", "Programare rapoarte recurente"],
    BRW: ["Design system nou", "Pagini studii de caz", "Animații hero", "Migrare blog"],
    HEL: ["Inventar resurse cloud", "Analiză costuri", "Recomandări securitate"],
    INT: ["Workshop Next.js 16", "POC agent AI intern", "Documentație onboarding"],
  };
  const statuses = ["backlog", "todo", "in_progress", "review", "done"] as const;
  const taskRows: (typeof s.tasks.$inferInsert)[] = [];
  for (const p of projectSeed) {
    const proj = projByCode(p.code);
    taskTitles[p.code].forEach((title, i) => {
      const st = p.status === "completed" ? "done" : p.status === "planning" ? pick(["backlog", "todo"] as const) : statuses[(i + int(0, 2)) % 5];
      taskRows.push({
        companyId: C,
        projectId: proj.id,
        title,
        description: `${title} — conform specificațiilor agreate cu clientul.`,
        status: st,
        priority: pick(["low", "medium", "medium", "high", "urgent"] as const),
        assigneeId: tm(pick(p.members)).id,
        estimateHours: pick([4, 8, 12, 16, 24, 40]),
        dueDate: iso(addDays(TODAY, int(-20, 45))),
        position: i,
      });
    });
  }
  const tasks = await db.insert(s.tasks).values(taskRows).returning();

  /* ------------------------------ alocări & concedii ------------------------------ */
  const allocRows: (typeof s.allocations.$inferInsert)[] = [];
  for (const p of projectSeed) {
    if (p.code === "INT") continue;
    const proj = projByCode(p.code);
    for (const m of p.members) {
      const start = p.status === "planning" ? addDays(TODAY, 14) : subMonths(TODAY, Math.min(p.months, 3));
      const end = p.status === "completed" ? subMonths(TODAY, 1) : addDays(TODAY, int(30, 90));
      allocRows.push({ companyId: C, memberId: tm(m).id, projectId: proj.id, startDate: iso(start), endDate: iso(end), hoursPerDay: p.members.length > 3 ? pick([4, 6, 8]) : pick([4, 8]) });
    }
  }
  // Ziua fiecărui om se împarte între proiecte (~8h); Mihai e supraalocat intenționat, Tudor are capacitate liberă.
  const dailyTarget: Record<string, number> = { "Mihai Stan": 10, "Tudor Enache": 5, "Andrei Popescu": 6 };
  const shares = [[1], [0.75, 0.25], [0.5, 0.25, 0.25], [0.4, 0.2, 0.2, 0.2]];
  for (const member of team) {
    const mine = allocRows.filter((a) => a.memberId === member.id);
    if (!mine.length) continue;
    const target = dailyTarget[member.name] ?? (member.weeklyCapacity / 5);
    const split = shares[Math.min(mine.length, 4) - 1];
    mine.forEach((a, i) => (a.hoursPerDay = Math.max(1, Math.round(target * (split[i] ?? 0.2) * 2) / 2)));
  }
  await db.insert(s.allocations).values(allocRows);
  await db.insert(s.timeOff).values([
    { companyId: C, memberId: tm("Ana Dumitrescu").id, type: "vacation", startDate: iso(addDays(TODAY, 10)), endDate: iso(addDays(TODAY, 16)), status: "approved", notes: "Concediu de toamnă" },
    { companyId: C, memberId: tm("Mihai Stan").id, type: "vacation", startDate: iso(addDays(TODAY, 24)), endDate: iso(addDays(TODAY, 30)), status: "pending" },
    { companyId: C, memberId: tm("Vlad Georgescu").id, type: "sick", startDate: iso(subDays(TODAY, 9)), endDate: iso(subDays(TODAY, 7)), status: "approved" },
    { companyId: C, memberId: tm("Bianca Rusu").id, type: "vacation", startDate: iso(subDays(TODAY, 40)), endDate: iso(subDays(TODAY, 33)), status: "approved" },
    { companyId: C, memberId: tm("Tudor Enache").id, type: "unpaid", startDate: iso(addDays(TODAY, 3)), endDate: iso(addDays(TODAY, 4)), status: "pending", notes: "Examen facultate" },
  ]);

  /* -------------------------------- pontaj -------------------------------- */
  const weekStart = startOfWeek(TODAY, { weekStartsOn: 1 });
  const entryRows: (typeof s.timeEntries.$inferInsert)[] = [];
  const days = eachDayOfInterval({ start: subDays(weekStart, 7 * 10), end: TODAY }).filter((d) => !isWeekend(d) && !RO_PUBLIC_HOLIDAYS[iso(d)]);
  for (const member of billable) {
    const memberProjects = projectSeed.filter((p) => (p.members as readonly string[]).includes(member.name) && p.status !== "planning");
    if (!memberProjects.length) continue;
    for (const d of days) {
      if (rand() < 0.04) continue; // zile lipsă
      const date = iso(d);
      const weekOf = startOfWeek(d, { weekStartsOn: 1 });
      const status = weekOf >= weekStart ? "draft" : weekOf >= subDays(weekStart, 7) ? (rand() < 0.6 ? "submitted" : "approved") : "approved";
      const active = memberProjects.filter((p) => p.code !== "BRW" || d < subMonths(TODAY, 1));
      const main = pick(active.filter((p) => p.code !== "INT").length ? active.filter((p) => p.code !== "INT") : active);
      const split = rand() < 0.45 && active.length > 1;
      const parts = split ? [{ p: main, h: pick([4, 5, 6]) }, { p: pick(active.filter((x) => x !== main)), h: 0 }] : [{ p: main, h: pick([7, 7.5, 8, 8]) }];
      if (split) parts[1].h = pick([2, 2.5, 3, 4]);
      for (const part of parts) {
        const proj = projByCode(part.p.code);
        const projTasks = tasks.filter((t) => t.projectId === proj.id);
        const task = rand() < 0.75 ? pick(projTasks) : null;
        entryRows.push({
          companyId: C,
          memberId: member.id,
          projectId: proj.id,
          taskId: task?.id ?? null,
          date,
          hours: part.h,
          description: task ? `Lucru la: ${task.title}` : pick(["Ședință sprint & planificare", "Code review", "Suport client", "Documentație tehnică", "Refactorizare"]),
          billable: part.p.billing !== "non_billable",
          status,
          approvedBy: status === "approved" ? manager.id : null,
          approvedAt: status === "approved" ? addDays(weekOf, 7) : null,
        });
      }
    }
  }
  // cronometru pornit pentru Ana (demonstrativ)
  entryRows.push({
    companyId: C,
    memberId: tm("Ana Dumitrescu").id,
    projectId: projByCode("NMB").id,
    taskId: tasks.find((t) => t.title === "Checkout în 3 pași")?.id,
    date: today,
    hours: 0,
    description: "Checkout — validări formular",
    status: "draft",
    timerStartedAt: new Date(Date.now() - 47 * 60 * 1000),
  });
  await chunked(entryRows, (b) => db.insert(s.timeEntries).values(b));

  /* ------------------------------ facturi emise ------------------------------ */
  const docs: (typeof s.documents.$inferInsert)[] = [];
  const lines: (typeof s.documentLines.$inferInsert)[] = [];
  const pays: (typeof s.payments.$inferInsert)[] = [];
  let invNo = 1;
  let rcpNo = 1;
  const roClients = clients.filter((c) => c.country === "RO");
  const foreignClients = clients.filter((c) => c.country !== "RO");
  // Curs EUR/RON aproximativ: de la ~5,08 acum un an la ~5,33 azi, cu mici oscilații.
  const eurRate = (d: Date) => {
    const progress = Math.min(1, Math.max(0, 1 - (TODAY.getTime() - d.getTime()) / (365 * 86_400_000)));
    return round4(5.08 + progress * 0.27 + Math.sin(d.getTime() / 2.6e9) * 0.015);
  };

  const invoiceDates: Date[] = [];
  for (let m = 12; m >= 0; m--) {
    const monthStart = new Date(TODAY.getFullYear(), TODAY.getMonth() - m, 1);
    const count = m === 0 ? Math.min(int(6, 9), Math.ceil(TODAY.getDate() / 3.3)) : int(8, 13) + Math.floor((12 - m) / 4);
    for (let i = 0; i < count; i++) {
      const d = addDays(monthStart, int(0, 27));
      if (d <= TODAY) invoiceDates.push(d);
    }
  }
  invoiceDates.sort((a, b) => a.getTime() - b.getTime());

  for (const [idx, d] of invoiceDates.entries()) {
    const foreign = rand() < 0.14;
    const client = foreign ? pick(foreignClients) : pick(roClients.filter((c) => c.entityType === "pj"));
    const currency = foreign ? "EUR" : "RON";
    const rate = foreign ? eurRate(d) : 1;
    const dueDate = addDays(d, client.paymentTermDays ?? 30);
    const lineItems: { p: (typeof products)[number]; q: number; disc: number }[] = [];
    const roll = rand();
    if (roll < 0.55) {
      const svcCount = int(1, 3);
      for (let k = 0; k < svcCount; k++) lineItems.push({ p: pick(services.filter((x) => x.unit === "ora")), q: pick([16, 24, 32, 40, 60, 80, 120, 160]), disc: rand() < 0.15 ? 5 : 0 });
    } else if (roll < 0.75) {
      lineItems.push({ p: prod("SRV-MNT"), q: 1, disc: 0 });
      if (rand() < 0.6) lineItems.push({ p: prod("SRV-HOST"), q: 1, disc: 0 });
    } else if (roll < 0.88) {
      lineItems.push({ p: pick([prod("SRV-AUDIT"), prod("LIC-SAAS")]), q: 1, disc: rand() < 0.3 ? 10 : 0 });
      lineItems.push({ p: prod("SRV-CONS"), q: pick([4, 8, 12]), disc: 0 });
    } else {
      lineItems.push({ p: pick(stockProducts), q: int(1, 3), disc: 0 });
      lineItems.push({ p: prod("HW-KIT"), q: int(1, 3), disc: 0 });
    }
    const vatCat = foreign ? "AE" : "S";
    const draftLines = lineItems.map((li) => ({
      quantity: li.q,
      unitPrice: foreign ? r2(li.p.price / 5.1) : li.p.price,
      discountPercent: li.disc,
      vatRate: foreign ? 0 : 21,
      vatCategory: vatCat,
    }));
    const totals = computeTotals(draftLines);
    const age = (TODAY.getTime() - d.getTime()) / 86_400_000;
    const docId = uuid();
    const number = invNo++;
    const fullNumber = `${invSeries.prefix}${String(number).padStart(4, "0")}`;

    // stare încasare
    let paid = 0;
    let status: "issued" | "partially_paid" | "paid" = "issued";
    const r = rand();
    const overdueDays = (TODAY.getTime() - dueDate.getTime()) / 86_400_000;
    // facturile vechi sunt încasate; restanțele apar doar în ultimele ~2 luni
    const paidChance = overdueDays > 60 ? 1 : overdueDays > 0 ? 0.7 : 0.3;
    if (r < paidChance) {
      paid = totals.total;
      status = "paid";
    } else if (r < paidChance + 0.12) {
      paid = r2(totals.total * pick([0.3, 0.5]));
      status = "partially_paid";
    }
    if (paid > 0) {
      const payDate = addDays(d, Math.min(Math.max(2, int(3, (client.paymentTermDays ?? 30) + 10)), Math.max(1, Math.floor(age))));
      const cash = !foreign && totals.total < 3000 && rand() < 0.4;
      pays.push({
        companyId: C,
        direction: "in",
        documentId: docId,
        partnerId: client.id,
        partnerName: client.name,
        date: iso(payDate > TODAY ? TODAY : payDate),
        amount: paid,
        currency,
        method: cash ? "cash" : "bank",
        reference: cash ? null : `OP ${int(1000, 9999)}`,
        receiptSeries: cash ? chtSeries.prefix : null,
        receiptNumber: cash ? rcpNo++ : null,
        createdBy: accountant.id,
      });
    }
    const efStatus = age < 1 ? "none" : idx === invoiceDates.length - 4 ? "nok" : idx === invoiceDates.length - 2 && age < 4 ? "processing" : "ok";
    const uploadId = efStatus === "none" ? null : String(5000000000 + idx * 7919);
    docs.push({
      id: docId,
      companyId: C,
      kind: "invoice",
      seriesId: invSeries.id,
      series: invSeries.prefix,
      number,
      fullNumber,
      status,
      partnerId: client.id,
      clientName: client.name,
      clientCui: client.cui,
      clientRegCom: client.regCom,
      clientVatPayer: client.vatPayer,
      clientEntityType: client.entityType,
      clientAddress: client.address,
      clientCity: client.city,
      clientCounty: client.county,
      clientCountry: client.country,
      clientEmail: client.email,
      issueDate: iso(d),
      dueDate: iso(dueDate),
      currency,
      exchangeRate: rate,
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      vatTotal: totals.vatTotal,
      total: totals.total,
      paidAmount: paid,
      notes: foreign ? "Taxare inversă — art. 278 alin. (2) Cod fiscal" : null,
      issuedBy: "Andrei Popescu",
      projectId: lineItems[0].p.unit === "ora" ? pick(projects.filter((p) => p.clientId === client.id).map((p) => p.id).concat([null as unknown as string])) ?? null : null,
      efacturaStatus: efStatus,
      efacturaUploadId: uploadId,
      efacturaDownloadId: efStatus === "ok" ? `3${uploadId!.slice(1)}` : null,
      efacturaMessage:
        efStatus === "nok"
          ? "E: [BR-RO-100] Dacă codul țării din adresa cumpărătorului este RO și subdiviziunea este RO-B, localitatea trebuie să fie SECTOR1–SECTOR6."
          : null,
      efacturaSentAt: uploadId ? addDays(d, 1) : null,
      createdBy: demo.id,
      createdAt: d,
    });
    draftLines.forEach((dl, i) => {
      const t = totals.lines[i];
      lines.push({
        documentId: docId,
        position: i,
        productId: lineItems[i].p.id,
        name: lineItems[i].p.name,
        unit: lineItems[i].p.unit,
        quantity: dl.quantity,
        unitPrice: dl.unitPrice,
        discountPercent: dl.discountPercent,
        vatRate: dl.vatRate,
        vatCategory: dl.vatCategory as s.VatCategory,
        netAmount: t.netAmount,
        discountAmount: t.discountAmount,
        vatAmount: t.vatAmount,
        totalAmount: t.totalAmount,
      });
    });
    // descărcare stoc pentru produse
    const stockLines = lineItems.filter((li) => li.p.trackStock);
    if (stockLines.length) {
      const sid = uuid();
      stockDocs.push({ id: sid, companyId: C, type: "sale", number: `VZ-${String(stockDocs.length).padStart(5, "0")}`, date: iso(d), warehouseId: mainWh.id, partnerId: client.id, documentId: docId, notes: `Descărcare automată ${fullNumber}` });
      for (const li of stockLines) stockMoves.push({ companyId: C, stockDocumentId: sid, productId: li.p.id, warehouseId: mainWh.id, quantity: -li.q, unitCost: li.p.purchasePrice ?? 0, date: iso(d) });
    }
  }

  // factură storno pentru una din facturile din luna trecută
  const toStorno = docs.find((x) => x.issueDate! > iso(subMonths(TODAY, 2)) && x.status === "paid" && x.currency === "RON")!;
  {
    const stornoId = uuid();
    const origLines = lines.filter((l) => l.documentId === toStorno.id);
    const neg = origLines.map((l) => ({ quantity: -l.quantity!, unitPrice: l.unitPrice!, discountPercent: l.discountPercent!, vatRate: l.vatRate!, vatCategory: l.vatCategory! }));
    const t = computeTotals(neg);
    const date = addDays(new Date(toStorno.issueDate!), 6);
    const number = invNo++;
    docs.push({
      ...toStorno,
      id: stornoId,
      isCreditNote: true,
      number,
      fullNumber: `${invSeries.prefix}${String(number).padStart(4, "0")}`,
      status: "issued",
      issueDate: iso(date),
      dueDate: iso(date),
      subtotal: t.subtotal,
      discountTotal: t.discountTotal,
      vatTotal: t.vatTotal,
      total: t.total,
      paidAmount: 0,
      relatedDocumentId: toStorno.id,
      notes: `Stornare factura ${toStorno.fullNumber} din ${toStorno.issueDate} — servicii refacturate`,
      efacturaStatus: "ok",
      efacturaUploadId: "5099911234",
      efacturaDownloadId: "3099911234",
      createdAt: date,
    });
    origLines.forEach((l, i) => lines.push({ ...l, id: undefined, documentId: stornoId, quantity: -l.quantity!, netAmount: t.lines[i].netAmount, vatAmount: t.lines[i].vatAmount, totalAmount: t.lines[i].totalAmount, discountAmount: t.lines[i].discountAmount }));
    toStorno.status = "storned";
  }

  // ciorne
  for (let i = 0; i < 2; i++) {
    const client = pick(roClients);
    const id = uuid();
    const dl = [{ quantity: 40, unitPrice: 245, discountPercent: 0, vatRate: 21, vatCategory: "S" }];
    const t = computeTotals(dl);
    docs.push({
      id,
      companyId: C,
      kind: "invoice",
      seriesId: invSeries.id,
      series: "CIORNA",
      number: i + 1,
      fullNumber: `CIORNĂ #${i + 1}`,
      status: "draft",
      partnerId: client.id,
      clientName: client.name,
      clientCui: client.cui,
      clientVatPayer: client.vatPayer,
      clientAddress: client.address,
      clientCity: client.city,
      clientCounty: client.county,
      issueDate: today,
      dueDate: iso(addDays(TODAY, 15)),
      subtotal: t.subtotal,
      vatTotal: t.vatTotal,
      total: t.total,
      createdBy: demo.id,
    });
    lines.push({ documentId: id, position: 0, productId: prod("SRV-DEV-SR").id, name: prod("SRV-DEV-SR").name, unit: "ora", quantity: 40, unitPrice: 245, vatRate: 21, netAmount: t.lines[0].netAmount, vatAmount: t.lines[0].vatAmount, totalAmount: t.lines[0].totalAmount });
  }

  // proforme & avize
  let prfNo = 1;
  let avzNo = 1;
  for (let i = 0; i < 7; i++) {
    const client = pick(roClients);
    const d = subDays(TODAY, int(2, 120));
    const id = uuid();
    const items = [{ p: prod("SRV-AUDIT"), q: 1 }, { p: prod("SRV-CONS"), q: pick([8, 16, 24]) }];
    const dl = items.map((it) => ({ quantity: it.q, unitPrice: it.p.price, discountPercent: 0, vatRate: 21, vatCategory: "S" }));
    const t = computeTotals(dl);
    const number = prfNo++;
    docs.push({
      id,
      companyId: C,
      kind: "proforma",
      seriesId: prfSeries.id,
      series: prfSeries.prefix,
      number,
      fullNumber: `${prfSeries.prefix}${String(number).padStart(4, "0")}`,
      status: i < 3 ? "converted" : i === 6 ? "cancelled" : "issued",
      partnerId: client.id,
      clientName: client.name,
      clientCui: client.cui,
      clientVatPayer: client.vatPayer,
      clientAddress: client.address,
      clientCity: client.city,
      clientCounty: client.county,
      issueDate: iso(d),
      dueDate: iso(addDays(d, 10)),
      subtotal: t.subtotal,
      vatTotal: t.vatTotal,
      total: t.total,
      notes: "Ofertă valabilă 30 de zile.",
      createdBy: demo.id,
      createdAt: d,
    });
    items.forEach((it, k) => lines.push({ documentId: id, position: k, productId: it.p.id, name: it.p.name, unit: it.p.unit, quantity: it.q, unitPrice: it.p.price, vatRate: 21, netAmount: t.lines[k].netAmount, vatAmount: t.lines[k].vatAmount, totalAmount: t.lines[k].totalAmount }));
  }
  for (let i = 0; i < 3; i++) {
    const client = pick(roClients);
    const d = subDays(TODAY, int(1, 40));
    const id = uuid();
    const p = pick(stockProducts);
    const q = int(1, 2);
    const t = computeTotals([{ quantity: q, unitPrice: p.price, vatRate: 21, vatCategory: "S" }]);
    const number = avzNo++;
    docs.push({
      id,
      companyId: C,
      kind: "notice",
      seriesId: avzSeries.id,
      series: avzSeries.prefix,
      number,
      fullNumber: `${avzSeries.prefix}${String(number).padStart(4, "0")}`,
      status: i === 0 ? "converted" : "issued",
      partnerId: client.id,
      clientName: client.name,
      clientCui: client.cui,
      clientVatPayer: client.vatPayer,
      clientAddress: client.address,
      clientCity: client.city,
      clientCounty: client.county,
      issueDate: iso(d),
      subtotal: t.subtotal,
      vatTotal: t.vatTotal,
      total: t.total,
      delegateName: "Ion Vasilescu",
      delegateIdCard: "CJ 123456",
      transportMeans: "CJ 12 PXD",
      warehouseId: mainWh.id,
      createdBy: demo.id,
      createdAt: d,
    });
    lines.push({ documentId: id, position: 0, productId: p.id, name: p.name, unit: p.unit, quantity: q, unitPrice: p.price, vatRate: 21, netAmount: t.lines[0].netAmount, vatAmount: t.lines[0].vatAmount, totalAmount: t.lines[0].totalAmount });
  }

  await chunked(docs, (b) => db.insert(s.documents).values(b), 100);
  await chunked(lines, (b) => db.insert(s.documentLines).values(b));
  await chunked(pays, (b) => db.insert(s.payments).values(b));
  await db.update(s.documentSeries).set({ nextNumber: invNo }).where(eqId(invSeries.id));
  await db.update(s.documentSeries).set({ nextNumber: prfNo }).where(eqId(prfSeries.id));
  await db.update(s.documentSeries).set({ nextNumber: avzNo }).where(eqId(avzSeries.id));
  await db.update(s.documentSeries).set({ nextNumber: rcpNo }).where(eqId(chtSeries.id));

  /* ------------------------------ facturi recurente ------------------------------ */
  const nextMonth1 = iso(new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 1));
  await db.insert(s.recurringInvoices).values([
    {
      companyId: C,
      name: "FinTrack — retainer mentenanță",
      partnerId: clients.find((c) => c.name.startsWith("FinTrack"))!.id,
      seriesId: invSeries.id,
      frequency: "monthly",
      startDate: iso(subMonths(TODAY, 11)),
      nextRunDate: nextMonth1,
      dueDays: 15,
      lines: [{ productId: prod("SRV-MNT").id, name: prod("SRV-MNT").name, unit: "luna", quantity: 1, unitPrice: 3500, discountPercent: 0, vatRate: 21, vatCategory: "S" }],
      autoIssue: true,
      autoSendEfactura: true,
      generatedCount: 11,
      lastRunAt: new Date(TODAY.getFullYear(), TODAY.getMonth(), 1),
    },
    {
      companyId: C,
      name: "Nimbus — hosting gestionat",
      partnerId: clients.find((c) => c.name.startsWith("Nimbus"))!.id,
      seriesId: invSeries.id,
      frequency: "monthly",
      startDate: iso(subMonths(TODAY, 6)),
      nextRunDate: nextMonth1,
      dueDays: 30,
      lines: [{ productId: prod("SRV-HOST").id, name: prod("SRV-HOST").name, unit: "luna", quantity: 1, unitPrice: 890, discountPercent: 0, vatRate: 21, vatCategory: "S" }],
      autoIssue: true,
      autoSendEmail: true,
      generatedCount: 6,
    },
    {
      companyId: C,
      name: "Orbit Travel — licență SaaS anuală",
      partnerId: clients.find((c) => c.name.startsWith("Orbit"))!.id,
      frequency: "yearly",
      startDate: iso(subMonths(TODAY, 10)),
      nextRunDate: iso(addDays(subMonths(TODAY, 10), 365)),
      dueDays: 15,
      lines: [{ productId: prod("LIC-SAAS").id, name: prod("LIC-SAAS").name, unit: "an", quantity: 1, unitPrice: 4800, discountPercent: 10, vatRate: 21, vatCategory: "S" }],
      autoIssue: false,
      generatedCount: 1,
    },
  ]);

  /* ------------------------------ cheltuieli ------------------------------ */
  const purchases: (typeof s.purchaseInvoices.$inferInsert)[] = [];
  const pLines: (typeof s.purchaseLines.$inferInsert)[] = [];
  const outPays: (typeof s.payments.$inferInsert)[] = [];
  for (let m = 12; m >= 0; m--) {
    const monthStart = new Date(TODAY.getFullYear(), TODAY.getMonth() - m, 1);
    const recurring = [
      { sup: suppliers[4], name: "Chirie birou Cluj — 180 mp", net: 14500, cat: "chirie", day: 1 },
      { sup: suppliers[2], name: "Energie electrică & internet", net: between(900, 1600), cat: "utilitati", day: 12 },
      { sup: suppliers[0], name: "Servere dedicate & backup", net: between(1800, 2400), cat: "software", day: 5 },
      { sup: suppliers[5], name: "Licențe JetBrains, Figma, Google Workspace", net: between(2200, 3100), cat: "software", day: 8 },
    ];
    if (rand() < 0.5) recurring.push({ sup: suppliers[1], name: "Rechizite & consumabile birou", net: between(250, 900), cat: "altele", day: 18 });
    if (rand() < 0.35) recurring.push({ sup: suppliers[6], name: "Servicii curierat", net: between(150, 600), cat: "transport", day: 22 });
    if (m % 3 === 0) recurring.push({ sup: suppliers[3], name: "Echipamente IT", net: between(6000, 18000), cat: "hardware", day: 15 });
    recurring.push({ sup: suppliers[7], name: "Servicii dezvoltare mobile (contract colaborare)", net: between(14500, 17500), cat: "salarii", day: 3 });
    recurring.push({ sup: suppliers[8], name: "Servicii contabilitate & salarizare", net: 2400, cat: "servicii", day: 6 });
    for (const rc of recurring) {
      const d = addDays(monthStart, rc.day - 1);
      if (d > TODAY) continue;
      const net = r2(rc.net);
      const vat = r2(net * 0.21);
      const id = uuid();
      const due = addDays(d, 20);
      const paid = due < TODAY || rand() < 0.4;
      purchases.push({
        id,
        companyId: C,
        supplierId: rc.sup.id,
        supplierName: rc.sup.name,
        supplierCui: rc.sup.cui,
        number: `${rc.sup.name.slice(0, 3).toUpperCase()}-${int(10000, 99999)}`,
        issueDate: iso(d),
        dueDate: iso(due),
        subtotal: net,
        vatTotal: vat,
        total: r2(net + vat),
        paidAmount: paid ? r2(net + vat) : 0,
        status: paid ? "paid" : "unpaid",
        category: rc.cat,
        source: m < 4 && rand() < 0.7 ? "spv" : "manual",
        createdAt: d,
      });
      pLines.push({ purchaseInvoiceId: id, name: rc.name, unit: "buc", quantity: 1, unitPrice: net, vatRate: 21, netAmount: net, vatAmount: vat, totalAmount: r2(net + vat) });
      if (paid) outPays.push({ companyId: C, direction: "out", purchaseInvoiceId: id, partnerId: rc.sup.id, partnerName: rc.sup.name, date: iso(addDays(d, int(3, 18)) > TODAY ? TODAY : addDays(d, int(3, 18))), amount: r2(net + vat), method: "bank", reference: `OP ${int(1000, 9999)}` });
    }
  }
  // stat de plată lunar (salarii + contribuții) — fără TVA, pentru un P&L realist
  for (let m = 12; m >= 1; m--) {
    const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - m + 1, 10);
    if (d > TODAY) continue;
    const net = r2(between(148000, 156000));
    const id = uuid();
    purchases.push({
      id,
      companyId: C,
      supplierName: "Stat de plată salarii",
      number: `SAL-${format(subMonths(d, 1), "yyyy-MM")}`,
      issueDate: iso(d),
      dueDate: iso(d),
      subtotal: net,
      vatTotal: 0,
      total: net,
      paidAmount: net,
      status: "paid",
      category: "salarii",
      notes: "Salarii nete, CAS, CASS, impozit și CAM aferente lunii anterioare",
      createdAt: d,
    });
    pLines.push({ purchaseInvoiceId: id, name: "Salarii și contribuții", unit: "luna", quantity: 1, unitPrice: net, vatRate: 0, netAmount: net, vatAmount: 0, totalAmount: net });
    outPays.push({ companyId: C, direction: "out", purchaseInvoiceId: id, partnerName: "Stat de plată salarii", date: iso(d), amount: net, method: "bank", reference: "Plată salarii" });
  }
  await chunked(purchases, (b) => db.insert(s.purchaseInvoices).values(b), 100);
  await chunked(pLines, (b) => db.insert(s.purchaseLines).values(b));
  await chunked(outPays, (b) => db.insert(s.payments).values(b));

  await chunked(stockDocs, (b) => db.insert(s.stockDocuments).values(b), 100);
  await chunked(stockMoves, (b) => db.insert(s.stockMovements).values(b));

  /* ------------------------------ mesaje SPV ------------------------------ */
  const spv: (typeof s.spvMessages.$inferInsert)[] = [];
  for (const d of docs.filter((x) => x.efacturaStatus === "ok").slice(-25)) {
    spv.push({
      companyId: C,
      anafId: d.efacturaDownloadId!,
      requestId: d.efacturaUploadId,
      type: "FACTURA TRIMISA",
      cif: company.cui,
      details: `Factura cu id_incarcare=${d.efacturaUploadId} emisa de cif_emitent=${company.cui} pentru cif_beneficiar=${d.clientCui ?? ""}`,
      anafCreatedAt: format(addDays(new Date(d.issueDate!), 1), "yyyyMMddHHmm"),
      issuerCui: company.cui,
      receiverCui: d.clientCui,
      documentId: d.id,
      read: true,
    });
  }
  const nokDoc = docs.find((x) => x.efacturaStatus === "nok");
  if (nokDoc) {
    spv.push({
      companyId: C,
      anafId: `3${nokDoc.efacturaUploadId!.slice(1)}`,
      requestId: nokDoc.efacturaUploadId,
      type: "ERORI FACTURA",
      cif: company.cui,
      details: `Erori de validare identificate la factura primita cu id_incarcare=${nokDoc.efacturaUploadId}`,
      anafCreatedAt: format(subDays(TODAY, 2), "yyyyMMddHHmm"),
      documentId: nokDoc.id,
      read: false,
    });
  }
  await db.insert(s.spvMessages).values(spv);

  /* ------------------------------ e-Transport ------------------------------ */
  await db.insert(s.etransportDeclarations).values({
    companyId: C,
    status: "ok",
    operationType: "30",
    uit: "8K3M9QX2T7PLWN4R",
    uploadId: "17614321901",
    partnerId: clients[0].id,
    partnerName: clients[0].name,
    vehicleNumber: "CJ12PXD",
    carrierName: "Pixelcraft Digital SRL",
    carrierCui: company.cui,
    transportDate: iso(subDays(TODAY, 12)),
    startCounty: "CJ",
    startCity: "Cluj-Napoca",
    startAddress: "Str. Calea Dorobanților nr. 14",
    endCounty: "B",
    endCity: "București",
    endAddress: clients[0].address,
    documentNumber: docs.find((x) => x.kind === "notice")?.fullNumber ?? null,
    items: [{ name: "Laptop dezvoltare 32GB/1TB", ncCode: "84713000", quantity: 6, unitCode: "H87", netWeight: 12, grossWeight: 15, valueRon: 50940, purposeCode: "101" }],
    createdBy: demo.id,
  });

  /* ------------------------------ curs valutar ------------------------------ */
  const fx: (typeof s.exchangeRates.$inferInsert)[] = [];
  for (let i = 0; i < 30; i++) {
    const d = subDays(TODAY, i);
    if (isWeekend(d)) continue;
    fx.push({ date: iso(d), currency: "EUR", rate: eurRate(d) }, { date: iso(d), currency: "USD", rate: round4(eurRate(d) / 1.115) }, { date: iso(d), currency: "GBP", rate: round4(eurRate(d) * 1.155) });
  }
  await db.insert(s.exchangeRates).values(fx);

  /* ------------------------------ jurnal activitate ------------------------------ */
  const recentDocs = docs.filter((x) => x.kind === "invoice" && x.status !== "draft").slice(-8);
  await db.insert(s.activityLog).values([
    ...recentDocs.map((d, i) => ({
      companyId: C,
      userId: demo.id,
      userName: "Andrei Popescu",
      entity: "document",
      entityId: d.id,
      action: "issued",
      message: `Factura ${d.fullNumber} emisă pentru ${d.clientName}`,
      createdAt: new Date(Date.now() - (recentDocs.length - i) * 5.3 * 3600_000),
    })),
    { companyId: C, userId: accountant.id, userName: "Elena Marinescu", entity: "spv", action: "synced", message: "3 mesaje noi descărcate din SPV", createdAt: new Date(Date.now() - 3 * 3600_000) },
    { companyId: C, userId: manager.id, userName: "Radu Ionescu", entity: "timesheet", action: "approved", message: "Pontajele săptămânii trecute au fost aprobate (312 h)", createdAt: new Date(Date.now() - 26 * 3600_000) },
    { companyId: C, userId: ana.id, userName: "Ana Dumitrescu", entity: "task", action: "updated", message: "Task „Checkout în 3 pași” mutat în Review", createdAt: new Date(Date.now() - 50 * 60_000) },
  ]);

  console.log(`✓ Seed complet: ${docs.length} documente, ${pays.length} încasări, ${purchases.length} cheltuieli, ${entryRows.length} pontaje, ${tasks.length} task-uri`);
  console.log("  Cont demo: demo@anaffordummies.ro / demo1234");
}

import { eq } from "drizzle-orm";
function eqId(id: string) {
  return eq(s.documentSeries.id, id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => client.close());
