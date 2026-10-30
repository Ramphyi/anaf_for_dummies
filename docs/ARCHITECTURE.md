# AND (ANAF for Dummies) — arhitectură și convenții

Platformă de facturare (tip SmartBill) + integrare ANAF (e-Factura/SPV, e-Transport) + management de echipă pentru firme de outsourcing digital (proiecte, pontaj, planificare).

## Stack

| Strat | Tehnologie |
| --- | --- |
| Framework | **Next.js 16.4** (App Router, Turbopack, Server Components, Server Actions), React 19.3 |
| Limbaj | TypeScript 5.9 strict |
| DB | SQLite prin **libsql** + **Drizzle ORM 0.45** (`src/lib/db/schema.ts`), migrări în `drizzle/` |
| UI | Tailwind CSS v4 (tokens în `src/app/globals.css`), primitive **radix-ui** (pachetul umbrelă), **motion** (`motion/react`), lucide-react, cmdk, sonner, recharts 3 |
| Validare | zod 4 |
| AI | OpenAI SDK (Responses API): function calling, web search, MCP la distanță |
| Auth | sesiune JWT (jose) în cookie httpOnly `afd_session`, parole scrypt |

### Particularități Next.js 16 (important!)

- `params` și `searchParams` sunt **Promise**: `export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; }`
- `cookies()` / `headers()` sunt async.
- Middleware se numește acum `src/proxy.ts` (exportă `proxy`).
- Nu există `next lint`. Verificare tipuri: `npx tsc --noEmit`.
- Documentația oficială a versiunii instalate: `node_modules/next/dist/docs/`.

## Structură

```
src/
  app/
    (auth)/            login, register (+ actions.ts)
    (app)/             aplicația autentificată (layout cu sidebar/topbar)
      layout.tsx       încarcă contextul + badge-uri, randează <AppShell>
      template.tsx     animația de tranziție între pagini
      dashboard/ facturi/ proforme/ avize/ incasari/ recurente/ cheltuieli/ stocuri/
      clienti/ furnizori/ produse/ efactura/ etransport/ instrumente/
      proiecte/ pontaj/ planificare/ echipa/ concedii/ rapoarte/ setari/
    print/             vizualizări pentru tipărire (fără shell)
    api/               route handlers (search, anaf callback, cron, descărcări)
  components/
    ui/                design system (vezi mai jos)
    motion/            FadeIn, Stagger, AnimatedNumber, AnimatedBar
    shell/             sidebar, topbar, command palette, nav.ts (sursa unică a meniului)
    partners/          PartnerDialog (client/furnizor + căutare ANAF)
    charts/            chart-kit (culori, tooltip, axe)
  hooks/use-action.ts  rulează server actions cu toast + pending
  lib/
    db/                schema, client, migrate, seed
    auth/              session (requireContext, requirePermission, can), password
    anaf/              client (OAuth2 + e-Factura + e-Transport), service (operații de nivel înalt),
                       ubl (generator CIUS-RO), ubl-parse, cui (registru TVA), bnr, simulator, etransport
    documents/         totals (calcul — client+server), server (creare/emitere/storno/încasări), status
    stock/server.ts    mișcări de stoc, niveluri, descărcare automată la vânzare
    partners/actions   savePartnerAction, deletePartnerAction, lookupPartnerCuiAction
    server/            action.ts (runAction, scheme zod), activity.ts (jurnal), email.ts (SMTP), onboarding.ts
    constants.ts       etichete RO, statusuri+tonuri, județe, UM UN/ECE, cote TVA 2026
    format.ts          formatMoney, formatDate, formatHours, todayIso…
    utils.ts           cn, round2, sum, groupBy, normalizeCui, isValidCui/Cnp/Iban, toCsv
```

## Multi-tenancy și permisiuni

Fiecare tabel are `companyId`. **Orice** interogare/mutație filtrează după `ctx.company.id`.

```ts
const ctx = await requireContext();              // redirect la /login dacă nu e sesiune
const ctx = await requirePermission("billing");  // aruncă eroare dacă rolul nu are dreptul
can(ctx, "projects.manage")                      // boolean
```

Permisiuni: `billing`, `anaf`, `reports`, `settings`, `users`, `projects.manage`, `timesheet.approve`, `timesheet.own`.
Roluri: owner/admin (tot), accountant (billing, anaf, reports), manager (proiecte, aprobări, rapoarte), employee (doar pontajul propriu + vizualizare proiecte).
`ctx.teamMemberId` = membrul de echipă asociat utilizatorului (pentru pontajul propriu).

## Tipare de cod

### Pagini (Server Components)

```tsx
// src/app/(app)/facturi/page.tsx
export const metadata = { title: "Facturi" };
export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requirePermission("billing");
  const rows = await db.query.documents.findMany({ where: and(eq(documents.companyId, ctx.company.id), ...) });
  return (
    <>
      <PageHeader title="Facturi" description="…" icon={<FileText />} actions={<Button asChild><Link href="/facturi/nou"><Plus /> Factură nouă</Link></Button>} />
      <InvoicesTable rows={rows} />   {/* client component */}
    </>
  );
}
```

- Server Components citesc direct din DB cu Drizzle; trimit **doar date serializabile** către client components (fără funcții!). Coloanele `DataTable` se definesc într-un client component (`*-table.tsx`).
- Datele (Date/ISO) — câmpurile de tip „zi” sunt string `YYYY-MM-DD`; timestamp-urile sunt `Date` (se serializează automat).

### Server Actions

Fișier `actions.ts` lângă pagină, cu `"use server"`. Mereu prin `runAction` (normalizează erorile, validarea zod):

```ts
"use server";
export async function saveProductAction(input: ProductInput) {
  return runAction(async () => {
    const ctx = await requirePermission("billing");
    const d = productSchema.parse(input);
    ...
    revalidatePath("/produse");
    return saved;
  }, "Produs salvat");   // mesaj de succes (toast)
}
```

Client:

```tsx
const { run, pending } = useAction();
run(() => saveProductAction(form), { onSuccess: (p) => setOpen(false) });   // toast automat succes/eroare
```

Pentru acțiuni care schimbă numărătoarele din sidebar (scadențe, SPV, aprobări): `revalidatePath("/", "layout")`.

### Logică de business partajată (folosește-o, nu o duplica)

| Funcție | Fișier |
| --- | --- |
| `computeTotals(lines)`, `computeLine`, `priceWithoutVat` | `lib/documents/totals.ts` (client+server) |
| `createDocument`, `updateDocument`, `issueDocument`, `deleteDraft`, `cancelDocument`, `createCreditNote`, `convertToInvoice`, `duplicateDocument`, `getDocument`, `recordPayment`, `deletePayment`, `recalcDocumentPayments`, `allocateNumber`, `getSeries` | `lib/documents/server.ts` |
| `displayStatus(doc)` (calculează „overdue”), `remaining`, `isEditable` | `lib/documents/status.ts` |
| `createStockDocument`, `getStockLevels`, `getDefaultWarehouse`, `applySaleStock`, `revertSaleStock` | `lib/stock/server.ts` |
| `sendInvoiceToSpv`, `refreshInvoiceStatus`, `refreshPendingInvoices`, `syncSpvMessages`, `downloadSpvMessage`, `spvMessageZip`, `importSpvMessage`, `generateInvoiceXml`, `companyAsParty` | `lib/anaf/service.ts` |
| `getConnection`, `connectionState`, `buildAuthorizeUrl`, `exchangeCode`, `refreshAccessToken`, `validateXml`, `xmlToPdf`, `etransportUpload`, `etransportStatus`, `ENV_LABELS` | `lib/anaf/client.ts` |
| `buildUblInvoice`, `prevalidateUbl` | `lib/anaf/ubl.ts` |
| `parseUbl` | `lib/anaf/ubl-parse.ts` |
| `lookupCompany(cui)` | `lib/anaf/cui.ts` |
| `getExchangeRate(currency, date)`, `fetchBnrRates()` | `lib/anaf/bnr.ts` |
| `buildEtransportXml`, `ETRANSPORT_*` | `lib/anaf/etransport.ts` |
| `logActivity(actorFrom(ctx), {...})` | `lib/server/activity.ts` |
| `sendMail(company, {...})`, `emailLayout`, `isSmtpConfigured` | `lib/server/email.ts` |
| `createCompanyWithDefaults` | `lib/server/onboarding.ts` |
| `encryptSecret`, `decryptSecret` (AES-256-GCM pentru token-uri ANAF, client secret, parolă SMTP — nu trimite niciodată secretele în browser) | `lib/server/crypto.ts` |
| `<PartnerDialog kind="client" onSaved={(p)=>…} />` | `components/partners/partner-dialog.tsx` |

Toate funcțiile de business primesc un `Actor` (`actorFrom(ctx)`) și sunt sigure pentru multi-tenancy.

### Bani și TVA

- Sume `real`, rotunjite cu `round2`. Prețurile unitare din linii sunt **fără TVA**.
- TVA documentului se calculează pe categorie (`computeTotals().breakdown`) — necesar pentru validarea e-Factura (BR-S-09).
- Cote 2026: 21% standard, 11% redusă (`VAT_RATES`). Categorii: S, Z, E, AE (taxare inversă), K (intracomunitar), G (export), O (neplătitor).
- Storno = factură cu cantități negative + `isCreditNote` + `relatedDocumentId`.
- Valută: `currency` + `exchangeRate` (curs BNR), totaluri în moneda documentului; în RON = total × curs.

## Design system (`src/components/ui`)

| Componentă | Import |
| --- | --- |
| `Button` (variant: default, gradient, secondary, outline, ghost, soft, destructive, destructive-soft, success, link; size: xs, sm, default, lg, icon, icon-sm, icon-xs; `loading`, `asChild`) | `ui/button` |
| `Input`, `Textarea`, `NativeSelect`, `Label`, `Field` (label+hint+error), `InputGroup` (prefix/suffix) | `ui/input` |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `CardHeaderRow` (titlu+icon+acțiuni) | `ui/card` |
| `Badge` (tone: neutral/info/success/warning/danger/brand, `dot`, `pulse`), `StatusBadge status map={DOC_STATUS}` | `ui/badge` |
| `Dialog*`, `Sheet`, `SheetContent side="right"` | `ui/dialog` |
| `DropdownMenu*` | `ui/dropdown-menu` |
| `Popover*`, `Tooltip content=…` | `ui/popover` |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` (indicator animat), `Segmented` | `ui/tabs` |
| `Switch`, `Checkbox`, `Avatar`, `AvatarStack`, `Skeleton`, `Separator`, `Kbd`, `Progress`, `ColorDot` | `ui/misc` |
| `Table, THead, TBody, TFoot, TR, TH, TD` (primitive) | `ui/table` |
| `DataTable` (căutare, filtre-pastile, sortare, paginare, CSV, rând clickabil, footer) | `ui/data-table` |
| `PageHeader`, `EmptyState`, `DetailRow` | `ui/page` |
| `StatCard` (KPI cu număr animat, delta, sparkline) | `ui/stat-card` |
| `Combobox` (select cu căutare, opțional creare) | `ui/combobox` |
| `ConfirmDialog` | `ui/confirm` |
| `FadeIn`, `Stagger`/`StaggerItem`, `AnimatedNumber`, `AnimatedBar`, `motion`, `AnimatePresence` | `components/motion` |
| `CHART_COLORS`, `ChartTooltip`, `AreaGradient`, `axisProps`, `gridProps`, `ChartLegend`, `compactMoney` | `components/charts/chart-kit` |

Reguli vizuale:
- Folosește **doar token-uri** (`bg-card`, `bg-muted`, `text-muted-foreground`, `border-border`, `text-primary`, `bg-primary-soft`, `bg-success-soft`, …) — tema dark/light funcționează automat. Culori hardcodate doar pentru date (culoarea unui proiect/membru).
- Pagina începe cu `PageHeader` (cu `icon`), apoi KPI-uri (`StatCard` într-un `Stagger` grid `gap-4 sm:grid-cols-2 xl:grid-cols-4`), apoi conținut (`Card`, `DataTable`). Spațiere verticală `space-y-6`.
- Animații: `Stagger` pentru grile de carduri, `AnimatedBar`/`Progress` pentru progres, `layout`/`layoutId` din motion pentru reordonări (kanban), `AnimatePresence` pentru elemente care apar/dispar. Discret și rapid (≤ 500 ms), easing `[0.16, 1, 0.3, 1]`.
- Responsive: mobil întâi (`sm:`, `lg:`), tabelele au scroll orizontal, coloane secundare cu `hideOnMobile`.
- Texte UI în **română cu diacritice**; identificatori în engleză; comentarii scurte în română.
- Stări goale cu `EmptyState` (icon + titlu + descriere + acțiune). Loading: `loading.tsx` global există deja.

## ANAF

- Mediu per firmă în `anaf_connections.environment`: `simulation` (implicit, fără certificat — răspunsuri realiste generate local), `test` (api.anaf.ro/test), `prod`.
- OAuth2: utilizatorul înregistrează aplicația în SPV (logincert.anaf.ro) cu certificatul digital, primește Client ID/Secret, setează redirect `${APP_URL}/api/anaf/callback`. Token-ul (90 zile) se reîmprospătează automat cu refresh token-ul (365 zile).
- e-Factura: `upload` / `uploadb2c` → `stareMesaj` → `descarcare` (ZIP: factură + semnătură); `listaMesajeFactura` pentru inbox SPV. Validare și XML→PDF prin serviciile publice ANAF.
- Toate apelurile se jurnalizează în `anaf_logs`.

## Asistentul AI

| Piesă | Fișier |
| --- | --- |
| Provider OpenAI (client, model implicit, erori lizibile) — **orice funcție AI trece pe aici** | `lib/ai/openai.ts` |
| Registrul de unelte (zod + permisiune + `run(ctx, input)`), comun pentru chat și MCP | `lib/assistant/tools.ts` |
| Bucla de conversație cu streaming, istoric, titluri | `lib/assistant/engine.ts` |
| Context (sesiune sau cheie API), setări, generare chei | `lib/assistant/context.ts` |
| Acțiuni: istoric, setări, conectori MCP, chei API | `lib/assistant/actions.ts` |
| Endpoint chat (NDJSON) / server MCP (JSON-RPC, Streamable HTTP) | `app/api/assistant/chat`, `app/api/mcp` |
| UI: widget flotant + provider, chat, istoric, markdown, orb | `components/assistant/*` |

Pentru o unealtă nouă: adaug-o în `ASSISTANT_TOOLS` (nume, etichetă RO, descriere pentru model, schemă zod, permisiune, `run`). Devine automat disponibilă în chat și prin MCP. Uneltele care modifică date setează `mutates: true` și creează doar ciorne.

Conversațiile sunt stateless la OpenAI (`store: false`): itemii Responses API se salvează în `assistant_messages` și se redau neschimbați (raționamentul criptat prin `include: ["reasoning.encrypted_content"]`).

## Rulare locală

```bash
npm install
npm run setup     # migrări + date demo
npm run dev       # http://localhost:3000 — demo@anaffordummies.ro / demo1234
npm run docker:up # sau în Docker → http://localhost:3210
```
