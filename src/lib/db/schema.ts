import { relations, sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const companyId = () => text("company_id").notNull();
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
    .$onUpdate(() => new Date());
const bool = (name: string) => integer(name, { mode: "boolean" });

/* ------------------------------------------------------------------ */
/* Identity & tenancy                                                  */
/* ------------------------------------------------------------------ */

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  avatarColor: text("avatar_color").notNull().default("#6d5dfc"),
  lastCompanyId: text("last_company_id"),
  createdAt: createdAt(),
});

export const companies = sqliteTable("companies", {
  id: id(),
  name: text("name").notNull(),
  cui: text("cui").notNull(), // fără prefix RO
  regCom: text("reg_com"),
  vatPayer: bool("vat_payer").notNull().default(true),
  vatOnCollection: bool("vat_on_collection").notNull().default(false),
  address: text("address"),
  city: text("city"),
  county: text("county"), // cod ISO: B, CJ, IS...
  country: text("country").notNull().default("RO"),
  postalCode: text("postal_code"),
  iban: text("iban"),
  bank: text("bank"),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  shareCapital: text("share_capital"),
  logoDataUrl: text("logo_data_url"),
  defaultCurrency: text("default_currency").notNull().default("RON"),
  defaultVatRate: real("default_vat_rate").notNull().default(21),
  defaultDueDays: integer("default_due_days").notNull().default(15),
  invoiceFooter: text("invoice_footer"),
  brandColor: text("brand_color").notNull().default("#6d5dfc"),
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpUser: text("smtp_user"),
  smtpPass: text("smtp_pass"),
  smtpFrom: text("smtp_from"),
  smtpSecure: bool("smtp_secure").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const ROLES = ["owner", "admin", "accountant", "manager", "employee"] as const;
export type Role = (typeof ROLES)[number];

export const memberships = sqliteTable(
  "memberships",
  {
    id: id(),
    userId: text("user_id").notNull(),
    companyId: companyId(),
    role: text("role", { enum: ROLES }).notNull().default("employee"),
    teamMemberId: text("team_member_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_user_company").on(t.userId, t.companyId)],
);

/* ------------------------------------------------------------------ */
/* Nomenclatoare                                                       */
/* ------------------------------------------------------------------ */

export const DOCUMENT_TYPES = ["invoice", "proforma", "notice", "receipt"] as const;
export type DocumentSeriesType = (typeof DOCUMENT_TYPES)[number];

export const documentSeries = sqliteTable("document_series", {
  id: id(),
  companyId: companyId(),
  type: text("type", { enum: DOCUMENT_TYPES }).notNull(),
  prefix: text("prefix").notNull(),
  nextNumber: integer("next_number").notNull().default(1),
  padding: integer("padding").notNull().default(4),
  isDefault: bool("is_default").notNull().default(false),
  active: bool("active").notNull().default(true),
  createdAt: createdAt(),
});

export const PARTNER_KINDS = ["client", "supplier", "both"] as const;
export const partners = sqliteTable(
  "partners",
  {
    id: id(),
    companyId: companyId(),
    kind: text("kind", { enum: PARTNER_KINDS }).notNull().default("client"),
    entityType: text("entity_type", { enum: ["pj", "pf"] }).notNull().default("pj"),
    name: text("name").notNull(),
    cui: text("cui"), // CUI fără RO sau CNP pentru PF
    regCom: text("reg_com"),
    vatPayer: bool("vat_payer").notNull().default(false),
    address: text("address"),
    city: text("city"),
    county: text("county"),
    country: text("country").notNull().default("RO"),
    postalCode: text("postal_code"),
    email: text("email"),
    phone: text("phone"),
    iban: text("iban"),
    bank: text("bank"),
    contactPerson: text("contact_person"),
    paymentTermDays: integer("payment_term_days"),
    defaultCurrency: text("default_currency"),
    notes: text("notes"),
    eInvoiceRegistered: bool("e_invoice_registered").notNull().default(false),
    active: bool("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("partners_company").on(t.companyId)],
);

export const VAT_CATEGORIES = ["S", "Z", "E", "AE", "K", "G", "O"] as const;
export type VatCategory = (typeof VAT_CATEGORIES)[number];

export const products = sqliteTable(
  "products",
  {
    id: id(),
    companyId: companyId(),
    code: text("code"),
    name: text("name").notNull(),
    description: text("description"),
    type: text("type", { enum: ["product", "service"] }).notNull().default("service"),
    unit: text("unit").notNull().default("buc"),
    price: real("price").notNull().default(0),
    currency: text("currency").notNull().default("RON"),
    vatRate: real("vat_rate").notNull().default(21),
    vatCategory: text("vat_category", { enum: VAT_CATEGORIES }).notNull().default("S"),
    priceIncludesVat: bool("price_includes_vat").notNull().default(false),
    trackStock: bool("track_stock").notNull().default(false),
    purchasePrice: real("purchase_price"),
    ncCode: text("nc_code"), // cod tarifar (NC) pentru e-Transport
    barcode: text("barcode"),
    category: text("category"),
    active: bool("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("products_company").on(t.companyId)],
);

export const warehouses = sqliteTable("warehouses", {
  id: id(),
  companyId: companyId(),
  name: text("name").notNull(),
  code: text("code"),
  address: text("address"),
  isDefault: bool("is_default").notNull().default(false),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Documente emise: facturi, proforme, avize, storno                   */
/* ------------------------------------------------------------------ */

export const DOC_KINDS = ["invoice", "proforma", "notice"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const DOC_STATUSES = [
  "draft", // ciornă
  "issued", // emisă / neîncasată
  "partially_paid",
  "paid",
  "overdue", // calculat la afișare; nu se persistă de regulă
  "cancelled", // anulată
  "storned", // stornată integral
  "converted", // proformă/aviz transformat în factură
] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export const EFACTURA_STATUSES = ["none", "pending", "processing", "ok", "nok", "error"] as const;
export type EfacturaStatus = (typeof EFACTURA_STATUSES)[number];
export const ANAF_ENVIRONMENTS = ["simulation", "test", "prod"] as const;
export type AnafEnvironment = (typeof ANAF_ENVIRONMENTS)[number];

export const documents = sqliteTable(
  "documents",
  {
    id: id(),
    companyId: companyId(),
    kind: text("kind", { enum: DOC_KINDS }).notNull(),
    isCreditNote: bool("is_credit_note").notNull().default(false), // factură storno
    seriesId: text("series_id"),
    series: text("series").notNull(),
    number: integer("number").notNull(),
    fullNumber: text("full_number").notNull(),
    status: text("status", { enum: DOC_STATUSES }).notNull().default("draft"),
    partnerId: text("partner_id"),
    // instantaneu date client la emitere
    clientName: text("client_name").notNull(),
    clientCui: text("client_cui"),
    clientRegCom: text("client_reg_com"),
    clientVatPayer: bool("client_vat_payer").notNull().default(false),
    clientEntityType: text("client_entity_type", { enum: ["pj", "pf"] }).notNull().default("pj"),
    clientAddress: text("client_address"),
    clientCity: text("client_city"),
    clientCounty: text("client_county"),
    clientCountry: text("client_country").notNull().default("RO"),
    clientEmail: text("client_email"),
    issueDate: text("issue_date").notNull(), // YYYY-MM-DD
    dueDate: text("due_date"),
    deliveryDate: text("delivery_date"),
    currency: text("currency").notNull().default("RON"),
    exchangeRate: real("exchange_rate").notNull().default(1),
    subtotal: real("subtotal").notNull().default(0),
    discountTotal: real("discount_total").notNull().default(0),
    vatTotal: real("vat_total").notNull().default(0),
    total: real("total").notNull().default(0),
    paidAmount: real("paid_amount").notNull().default(0),
    notes: text("notes"),
    internalNotes: text("internal_notes"),
    issuedBy: text("issued_by"),
    issuerCnp: text("issuer_cnp"),
    delegateName: text("delegate_name"),
    delegateIdCard: text("delegate_id_card"),
    transportMeans: text("transport_means"),
    warehouseId: text("warehouse_id"),
    relatedDocumentId: text("related_document_id"), // storno → original, proformă → factura rezultată etc.
    projectId: text("project_id"),
    recurringId: text("recurring_id"),
    vatOnCollection: bool("vat_on_collection").notNull().default(false),
    // e-Factura
    efacturaStatus: text("efactura_status", { enum: EFACTURA_STATUSES }).notNull().default("none"),
    efacturaUploadId: text("efactura_upload_id"),
    efacturaDownloadId: text("efactura_download_id"),
    efacturaMessage: text("efactura_message"),
    efacturaSentAt: integer("efactura_sent_at", { mode: "timestamp_ms" }),
    efacturaXml: text("efactura_xml"),
    // mediul în care a fost transmisă: „simulation” = nu a ajuns la ANAF (se poate retrage/retrimite)
    efacturaEnvironment: text("efactura_environment", { enum: ANAF_ENVIRONMENTS }),
    sentByEmailAt: integer("sent_by_email_at", { mode: "timestamp_ms" }),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("documents_company_kind").on(t.companyId, t.kind),
    index("documents_partner").on(t.partnerId),
    uniqueIndex("documents_number_unique").on(t.companyId, t.kind, t.series, t.number),
  ],
);

export const documentLines = sqliteTable(
  "document_lines",
  {
    id: id(),
    documentId: text("document_id").notNull(),
    position: integer("position").notNull().default(0),
    productId: text("product_id"),
    name: text("name").notNull(),
    description: text("description"),
    unit: text("unit").notNull().default("buc"),
    quantity: real("quantity").notNull().default(1),
    unitPrice: real("unit_price").notNull().default(0), // fără TVA
    discountPercent: real("discount_percent").notNull().default(0),
    vatRate: real("vat_rate").notNull().default(21),
    vatCategory: text("vat_category", { enum: VAT_CATEGORIES }).notNull().default("S"),
    netAmount: real("net_amount").notNull().default(0), // după discount, fără TVA
    discountAmount: real("discount_amount").notNull().default(0),
    vatAmount: real("vat_amount").notNull().default(0),
    totalAmount: real("total_amount").notNull().default(0),
  },
  (t) => [index("document_lines_doc").on(t.documentId)],
);

/* ------------------------------------------------------------------ */
/* Încasări / plăți / chitanțe                                         */
/* ------------------------------------------------------------------ */

export const PAYMENT_METHODS = ["bank", "cash", "card", "op", "compensation", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const payments = sqliteTable(
  "payments",
  {
    id: id(),
    companyId: companyId(),
    direction: text("direction", { enum: ["in", "out"] }).notNull().default("in"),
    documentId: text("document_id"), // factură emisă (direction=in)
    purchaseInvoiceId: text("purchase_invoice_id"), // factură primită (direction=out)
    partnerId: text("partner_id"),
    partnerName: text("partner_name"),
    date: text("date").notNull(),
    amount: real("amount").notNull(),
    currency: text("currency").notNull().default("RON"),
    method: text("method", { enum: PAYMENT_METHODS }).notNull().default("bank"),
    reference: text("reference"),
    // chitanță (doar pentru numerar încasat)
    receiptSeries: text("receipt_series"),
    receiptNumber: integer("receipt_number"),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("payments_company").on(t.companyId), index("payments_doc").on(t.documentId)],
);

/* ------------------------------------------------------------------ */
/* Facturi recurente                                                   */
/* ------------------------------------------------------------------ */

export type RecurringLine = {
  productId?: string | null;
  name: string;
  description?: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatRate: number;
  vatCategory: VatCategory;
};

export const recurringInvoices = sqliteTable("recurring_invoices", {
  id: id(),
  companyId: companyId(),
  name: text("name").notNull(),
  partnerId: text("partner_id").notNull(),
  seriesId: text("series_id"),
  frequency: text("frequency", { enum: ["weekly", "monthly", "quarterly", "yearly"] }).notNull().default("monthly"),
  intervalCount: integer("interval_count").notNull().default(1),
  startDate: text("start_date").notNull(),
  nextRunDate: text("next_run_date").notNull(),
  endDate: text("end_date"),
  dueDays: integer("due_days").notNull().default(15),
  currency: text("currency").notNull().default("RON"),
  lines: text("lines", { mode: "json" }).$type<RecurringLine[]>().notNull(),
  notes: text("notes"),
  autoIssue: bool("auto_issue").notNull().default(true),
  autoSendEmail: bool("auto_send_email").notNull().default(false),
  autoSendEfactura: bool("auto_send_efactura").notNull().default(false),
  active: bool("active").notNull().default(true),
  lastRunAt: integer("last_run_at", { mode: "timestamp_ms" }),
  generatedCount: integer("generated_count").notNull().default(0),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Achiziții / cheltuieli                                              */
/* ------------------------------------------------------------------ */

export const EXPENSE_CATEGORIES = [
  "marfa",
  "servicii",
  "utilitati",
  "chirie",
  "software",
  "hardware",
  "transport",
  "marketing",
  "salarii",
  "taxe",
  "altele",
] as const;

export const purchaseInvoices = sqliteTable(
  "purchase_invoices",
  {
    id: id(),
    companyId: companyId(),
    supplierId: text("supplier_id"),
    supplierName: text("supplier_name").notNull(),
    supplierCui: text("supplier_cui"),
    number: text("number").notNull(),
    issueDate: text("issue_date").notNull(),
    dueDate: text("due_date"),
    currency: text("currency").notNull().default("RON"),
    exchangeRate: real("exchange_rate").notNull().default(1),
    subtotal: real("subtotal").notNull().default(0),
    vatTotal: real("vat_total").notNull().default(0),
    total: real("total").notNull().default(0),
    paidAmount: real("paid_amount").notNull().default(0),
    status: text("status", { enum: ["unpaid", "partially_paid", "paid", "cancelled"] }).notNull().default("unpaid"),
    category: text("category").notNull().default("altele"),
    notes: text("notes"),
    source: text("source", { enum: ["manual", "spv"] }).notNull().default("manual"),
    spvMessageId: text("spv_message_id"),
    xml: text("xml"),
    stockReceived: bool("stock_received").notNull().default(false),
    projectId: text("project_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("purchase_company").on(t.companyId)],
);

export const purchaseLines = sqliteTable("purchase_lines", {
  id: id(),
  purchaseInvoiceId: text("purchase_invoice_id").notNull(),
  position: integer("position").notNull().default(0),
  productId: text("product_id"),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("buc"),
  quantity: real("quantity").notNull().default(1),
  unitPrice: real("unit_price").notNull().default(0),
  vatRate: real("vat_rate").notNull().default(21),
  netAmount: real("net_amount").notNull().default(0),
  vatAmount: real("vat_amount").notNull().default(0),
  totalAmount: real("total_amount").notNull().default(0),
});

/* ------------------------------------------------------------------ */
/* Stocuri                                                             */
/* ------------------------------------------------------------------ */

export const STOCK_DOC_TYPES = ["nir", "consumption", "transfer", "inventory", "sale", "sale_return", "opening"] as const;
export type StockDocType = (typeof STOCK_DOC_TYPES)[number];

export const stockDocuments = sqliteTable("stock_documents", {
  id: id(),
  companyId: companyId(),
  type: text("type", { enum: STOCK_DOC_TYPES }).notNull(),
  number: text("number").notNull(),
  date: text("date").notNull(),
  warehouseId: text("warehouse_id").notNull(),
  targetWarehouseId: text("target_warehouse_id"),
  partnerId: text("partner_id"),
  purchaseInvoiceId: text("purchase_invoice_id"),
  documentId: text("document_id"),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: createdAt(),
});

export const stockMovements = sqliteTable(
  "stock_movements",
  {
    id: id(),
    companyId: companyId(),
    stockDocumentId: text("stock_document_id").notNull(),
    productId: text("product_id").notNull(),
    warehouseId: text("warehouse_id").notNull(),
    quantity: real("quantity").notNull(), // pozitiv = intrare, negativ = ieșire
    unitCost: real("unit_cost").notNull().default(0),
    date: text("date").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("stock_mov_product").on(t.companyId, t.productId, t.warehouseId)],
);

/* ------------------------------------------------------------------ */
/* ANAF: conexiune OAuth, mesaje SPV, e-Transport, jurnal              */
/* ------------------------------------------------------------------ */


export const anafConnections = sqliteTable("anaf_connections", {
  id: id(),
  companyId: text("company_id").notNull().unique(),
  environment: text("environment", { enum: ANAF_ENVIRONMENTS }).notNull().default("simulation"),
  clientId: text("client_id"),
  clientSecret: text("client_secret"),
  redirectUri: text("redirect_uri"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  connectedAt: integer("connected_at", { mode: "timestamp_ms" }),
  oauthState: text("oauth_state"),
  lastSyncAt: integer("last_sync_at", { mode: "timestamp_ms" }),
  autoSync: bool("auto_sync").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const SPV_MESSAGE_TYPES = ["FACTURA TRIMISA", "FACTURA PRIMITA", "ERORI FACTURA", "MESAJ CUMPARATOR"] as const;

export const spvMessages = sqliteTable(
  "spv_messages",
  {
    id: id(),
    companyId: companyId(),
    anafId: text("anaf_id").notNull(), // id descărcare
    requestId: text("request_id"), // id_solicitare (= id_incarcare pentru cele trimise)
    type: text("type").notNull(),
    cif: text("cif"),
    details: text("details"),
    anafCreatedAt: text("anaf_created_at"), // YYYYMMDDHHmm
    issuerCui: text("issuer_cui"),
    receiverCui: text("receiver_cui"),
    downloaded: bool("downloaded").notNull().default(false),
    xml: text("xml"),
    signatureXml: text("signature_xml"),
    purchaseInvoiceId: text("purchase_invoice_id"),
    documentId: text("document_id"),
    read: bool("read").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("spv_unique").on(t.companyId, t.anafId)],
);

export const etransportDeclarations = sqliteTable("etransport_declarations", {
  id: id(),
  companyId: companyId(),
  status: text("status", { enum: ["draft", "pending", "ok", "nok", "error"] }).notNull().default("draft"),
  operationType: text("operation_type").notNull().default("30"), // 30 = transport pe teritoriul național
  uit: text("uit"),
  uploadId: text("upload_id"),
  partnerId: text("partner_id"),
  partnerName: text("partner_name"),
  vehicleNumber: text("vehicle_number"),
  trailer1: text("trailer1"),
  carrierName: text("carrier_name"),
  carrierCui: text("carrier_cui"),
  transportDate: text("transport_date").notNull(),
  startCounty: text("start_county"),
  startCity: text("start_city"),
  startAddress: text("start_address"),
  endCounty: text("end_county"),
  endCity: text("end_city"),
  endAddress: text("end_address"),
  documentId: text("document_id"),
  documentNumber: text("document_number"),
  items: text("items", { mode: "json" })
    .$type<
      {
        name: string;
        ncCode: string;
        quantity: number;
        unitCode: string;
        netWeight: number;
        grossWeight: number;
        valueRon: number;
        purposeCode: string;
      }[]
    >()
    .notNull(),
  xml: text("xml"),
  message: text("message"),
  createdBy: text("created_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const anafLogs = sqliteTable(
  "anaf_logs",
  {
    id: id(),
    companyId: companyId(),
    action: text("action").notNull(), // upload, status, list, download, token, validate, cui...
    environment: text("environment").notNull(),
    success: bool("success").notNull().default(true),
    request: text("request"),
    response: text("response"),
    durationMs: integer("duration_ms"),
    createdAt: createdAt(),
  },
  (t) => [index("anaf_logs_company").on(t.companyId)],
);

export const exchangeRates = sqliteTable(
  "exchange_rates",
  {
    id: id(),
    date: text("date").notNull(),
    currency: text("currency").notNull(),
    rate: real("rate").notNull(),
  },
  (t) => [uniqueIndex("fx_unique").on(t.date, t.currency)],
);

/* ------------------------------------------------------------------ */
/* Outsourcing: echipă, proiecte, task-uri, pontaj, planificare        */
/* ------------------------------------------------------------------ */

export const teamMembers = sqliteTable("team_members", {
  id: id(),
  companyId: companyId(),
  userId: text("user_id"),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  position: text("position"), // ex: Senior Frontend Developer
  department: text("department"), // ex: Engineering, Design, QA
  seniority: text("seniority", { enum: ["intern", "junior", "mid", "senior", "lead", "principal"] }).notNull().default("mid"),
  employmentType: text("employment_type", { enum: ["cim", "pfa", "srl", "freelancer"] }).notNull().default("cim"),
  hourlyCost: real("hourly_cost").notNull().default(0), // cost intern / oră (RON)
  hourlyRate: real("hourly_rate").notNull().default(0), // tarif facturabil / oră
  rateCurrency: text("rate_currency").notNull().default("EUR"),
  weeklyCapacity: real("weekly_capacity").notNull().default(40),
  color: text("color").notNull().default("#6d5dfc"),
  skills: text("skills", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  startDate: text("start_date"),
  active: bool("active").notNull().default(true),
  createdAt: createdAt(),
});

export const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed", "cancelled"] as const;
export const BILLING_TYPES = ["time_materials", "fixed", "retainer", "non_billable"] as const;

export const projects = sqliteTable("projects", {
  id: id(),
  companyId: companyId(),
  clientId: text("client_id"),
  name: text("name").notNull(),
  code: text("code"),
  description: text("description"),
  status: text("status", { enum: PROJECT_STATUSES }).notNull().default("active"),
  billingType: text("billing_type", { enum: BILLING_TYPES }).notNull().default("time_materials"),
  hourlyRate: real("hourly_rate"), // tarif implicit proiect
  currency: text("currency").notNull().default("EUR"),
  budgetHours: real("budget_hours"),
  budgetAmount: real("budget_amount"),
  monthlyRetainer: real("monthly_retainer"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  color: text("color").notNull().default("#6d5dfc"),
  managerId: text("manager_id"), // team member
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const projectMembers = sqliteTable(
  "project_members",
  {
    id: id(),
    projectId: text("project_id").notNull(),
    memberId: text("member_id").notNull(),
    role: text("role"),
    hourlyRate: real("hourly_rate"), // override tarif facturabil
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("project_member_unique").on(t.projectId, t.memberId)],
);

export const TASK_STATUSES = ["backlog", "todo", "in_progress", "review", "done"] as const;
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export const tasks = sqliteTable(
  "tasks",
  {
    id: id(),
    companyId: companyId(),
    projectId: text("project_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", { enum: TASK_STATUSES }).notNull().default("todo"),
    priority: text("priority", { enum: TASK_PRIORITIES }).notNull().default("medium"),
    assigneeId: text("assignee_id"),
    estimateHours: real("estimate_hours"),
    dueDate: text("due_date"),
    position: real("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("tasks_project").on(t.projectId)],
);

export const TIME_ENTRY_STATUSES = ["draft", "submitted", "approved", "rejected"] as const;

export const timeEntries = sqliteTable(
  "time_entries",
  {
    id: id(),
    companyId: companyId(),
    memberId: text("member_id").notNull(),
    projectId: text("project_id").notNull(),
    taskId: text("task_id"),
    date: text("date").notNull(),
    hours: real("hours").notNull().default(0),
    description: text("description"),
    billable: bool("billable").notNull().default(true),
    status: text("status", { enum: TIME_ENTRY_STATUSES }).notNull().default("draft"),
    rejectionReason: text("rejection_reason"),
    approvedBy: text("approved_by"),
    approvedAt: integer("approved_at", { mode: "timestamp_ms" }),
    invoicedDocumentId: text("invoiced_document_id"),
    timerStartedAt: integer("timer_started_at", { mode: "timestamp_ms" }), // cronometru activ
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("time_member_date").on(t.companyId, t.memberId, t.date), index("time_project").on(t.projectId)],
);

export const allocations = sqliteTable(
  "allocations",
  {
    id: id(),
    companyId: companyId(),
    memberId: text("member_id").notNull(),
    projectId: text("project_id").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    hoursPerDay: real("hours_per_day").notNull().default(8),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("alloc_member").on(t.companyId, t.memberId)],
);

export const TIME_OFF_TYPES = ["vacation", "sick", "unpaid", "holiday", "other"] as const;

export const timeOff = sqliteTable("time_off", {
  id: id(),
  companyId: companyId(),
  memberId: text("member_id").notNull(),
  type: text("type", { enum: TIME_OFF_TYPES }).notNull().default("vacation"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  notes: text("notes"),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Jurnal de activitate                                                */
/* ------------------------------------------------------------------ */

export const activityLog = sqliteTable(
  "activity_log",
  {
    id: id(),
    companyId: companyId(),
    userId: text("user_id"),
    userName: text("user_name"),
    entity: text("entity").notNull(), // document, payment, partner, project...
    entityId: text("entity_id"),
    action: text("action").notNull(), // created, issued, paid, sent_efactura...
    message: text("message").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("activity_company").on(t.companyId)],
);

/* ------------------------------------------------------------------ */
/* Asistent AI: conversații, setări, conectori MCP, chei API           */
/* ------------------------------------------------------------------ */

export const assistantConversations = sqliteTable(
  "assistant_conversations",
  {
    id: id(),
    companyId: companyId(),
    userId: text("user_id").notNull(),
    title: text("title").notNull().default("Conversație nouă"),
    pinned: bool("pinned").notNull().default(false),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("assistant_conv_user").on(t.companyId, t.userId)],
);

/** Mesajele în format Messages API (inclusiv tool_use / tool_result / thinking), redate neschimbate la fiecare tură. */
export const assistantMessages = sqliteTable(
  "assistant_messages",
  {
    id: id(),
    conversationId: text("conversation_id").notNull(),
    seq: integer("seq").notNull(),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content", { mode: "json" }).$type<unknown>().notNull(),
    feedback: integer("feedback"), // 1 / -1
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("assistant_msg_seq").on(t.conversationId, t.seq)],
);

export const assistantSettings = sqliteTable("assistant_settings", {
  companyId: text("company_id").primaryKey(),
  model: text("model"), // null = OPENAI_MODEL / implicit
  webSearch: bool("web_search").notNull().default(true),
  effort: text("effort", { enum: ["low", "medium", "high"] }).notNull().default("medium"),
  instructions: text("instructions"),
  updatedAt: updatedAt(),
});

export const mcpServers = sqliteTable("mcp_servers", {
  id: id(),
  companyId: companyId(),
  name: text("name").notNull(), // slug unic per firmă
  url: text("url").notNull(),
  authorizationToken: text("authorization_token"), // criptat
  enabled: bool("enabled").notNull().default(true),
  createdAt: createdAt(),
});

/** Chei pentru serverul MCP al platformei (/api/mcp). Se păstrează doar hash-ul SHA-256. */
export const apiTokens = sqliteTable(
  "api_tokens",
  {
    id: id(),
    companyId: companyId(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    prefix: text("prefix").notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("api_tokens_company").on(t.companyId)],
);

/* ------------------------------------------------------------------ */
/* Relații (pentru db.query.*)                                         */
/* ------------------------------------------------------------------ */

export const usersRelations = relations(users, ({ many }) => ({ memberships: many(memberships) }));
export const companiesRelations = relations(companies, ({ many, one }) => ({
  memberships: many(memberships),
  anafConnection: one(anafConnections, { fields: [companies.id], references: [anafConnections.companyId] }),
}));
export const membershipsRelations = relations(memberships, ({ one }) => ({
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
  company: one(companies, { fields: [memberships.companyId], references: [companies.id] }),
}));
export const partnersRelations = relations(partners, ({ many }) => ({
  documents: many(documents),
  projects: many(projects),
}));
export const documentsRelations = relations(documents, ({ one, many }) => ({
  partner: one(partners, { fields: [documents.partnerId], references: [partners.id] }),
  lines: many(documentLines),
  payments: many(payments),
  project: one(projects, { fields: [documents.projectId], references: [projects.id] }),
}));
export const documentLinesRelations = relations(documentLines, ({ one }) => ({
  document: one(documents, { fields: [documentLines.documentId], references: [documents.id] }),
  product: one(products, { fields: [documentLines.productId], references: [products.id] }),
}));
export const paymentsRelations = relations(payments, ({ one }) => ({
  document: one(documents, { fields: [payments.documentId], references: [documents.id] }),
  purchaseInvoice: one(purchaseInvoices, { fields: [payments.purchaseInvoiceId], references: [purchaseInvoices.id] }),
  partner: one(partners, { fields: [payments.partnerId], references: [partners.id] }),
}));
export const recurringRelations = relations(recurringInvoices, ({ one }) => ({
  partner: one(partners, { fields: [recurringInvoices.partnerId], references: [partners.id] }),
}));
export const purchaseInvoicesRelations = relations(purchaseInvoices, ({ one, many }) => ({
  supplier: one(partners, { fields: [purchaseInvoices.supplierId], references: [partners.id] }),
  lines: many(purchaseLines),
  payments: many(payments),
}));
export const purchaseLinesRelations = relations(purchaseLines, ({ one }) => ({
  purchaseInvoice: one(purchaseInvoices, { fields: [purchaseLines.purchaseInvoiceId], references: [purchaseInvoices.id] }),
  product: one(products, { fields: [purchaseLines.productId], references: [products.id] }),
}));
export const stockDocumentsRelations = relations(stockDocuments, ({ one, many }) => ({
  warehouse: one(warehouses, { fields: [stockDocuments.warehouseId], references: [warehouses.id] }),
  movements: many(stockMovements),
}));
export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  stockDocument: one(stockDocuments, { fields: [stockMovements.stockDocumentId], references: [stockDocuments.id] }),
  product: one(products, { fields: [stockMovements.productId], references: [products.id] }),
  warehouse: one(warehouses, { fields: [stockMovements.warehouseId], references: [warehouses.id] }),
}));
export const teamMembersRelations = relations(teamMembers, ({ many }) => ({
  timeEntries: many(timeEntries),
  allocations: many(allocations),
  projectMembers: many(projectMembers),
}));
export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(partners, { fields: [projects.clientId], references: [partners.id] }),
  manager: one(teamMembers, { fields: [projects.managerId], references: [teamMembers.id] }),
  members: many(projectMembers),
  tasks: many(tasks),
  timeEntries: many(timeEntries),
  allocations: many(allocations),
}));
export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
  member: one(teamMembers, { fields: [projectMembers.memberId], references: [teamMembers.id] }),
}));
export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  assignee: one(teamMembers, { fields: [tasks.assigneeId], references: [teamMembers.id] }),
  timeEntries: many(timeEntries),
}));
export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  member: one(teamMembers, { fields: [timeEntries.memberId], references: [teamMembers.id] }),
  project: one(projects, { fields: [timeEntries.projectId], references: [projects.id] }),
  task: one(tasks, { fields: [timeEntries.taskId], references: [tasks.id] }),
}));
export const allocationsRelations = relations(allocations, ({ one }) => ({
  member: one(teamMembers, { fields: [allocations.memberId], references: [teamMembers.id] }),
  project: one(projects, { fields: [allocations.projectId], references: [projects.id] }),
}));
export const timeOffRelations = relations(timeOff, ({ one }) => ({
  member: one(teamMembers, { fields: [timeOff.memberId], references: [teamMembers.id] }),
}));

/* ------------------------------------------------------------------ */
/* Tipuri inferate                                                     */
/* ------------------------------------------------------------------ */

export type User = typeof users.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type DocumentSeries = typeof documentSeries.$inferSelect;
export type Partner = typeof partners.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Warehouse = typeof warehouses.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DocumentLine = typeof documentLines.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type RecurringInvoice = typeof recurringInvoices.$inferSelect;
export type PurchaseInvoice = typeof purchaseInvoices.$inferSelect;
export type PurchaseLine = typeof purchaseLines.$inferSelect;
export type StockDocument = typeof stockDocuments.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type AnafConnection = typeof anafConnections.$inferSelect;
export type SpvMessage = typeof spvMessages.$inferSelect;
export type EtransportDeclaration = typeof etransportDeclarations.$inferSelect;
export type AnafLog = typeof anafLogs.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type Allocation = typeof allocations.$inferSelect;
export type TimeOff = typeof timeOff.$inferSelect;
export type ActivityLog = typeof activityLog.$inferSelect;
export type AssistantConversation = typeof assistantConversations.$inferSelect;
export type AssistantMessage = typeof assistantMessages.$inferSelect;
export type AssistantSettings = typeof assistantSettings.$inferSelect;
export type McpServer = typeof mcpServers.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
