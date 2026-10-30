# AND

<sub>ANAF for Dummies</sub>

Platformă completă de **facturare și conformitate fiscală** pentru firme din România (alternativă la SmartBill), cu **integrare directă ANAF** (e-Factura/SPV, e-Transport), **asistent AI** care răspunde din datele firmei și module dedicate **firmelor de outsourcing digital** (proiecte, pontaj, planificarea echipei).

## Funcționalități

**Facturare**
- Facturi, proforme, avize de însoțire, chitanțe, facturi storno (totale/parțiale), facturi recurente
- Serii multiple cu numerotare automată și continuă, ciorne fără consum de număr
- Multi-valută cu curs BNR automat, discount pe linie, cotele TVA 2026 (21% / 11% / 0%) și categoriile e-Factura (S, Z, E, AE, K, G, O)
- Încasări parțiale, chitanțe pentru numerar, trimitere pe email, tipărire / PDF
- Transformare proformă/aviz → factură, duplicare

**ANAF**
- Conectare OAuth2 la SPV cu certificatul digital (token reîmprospătat automat)
- Trimitere facturi în e-Factura (UBL 2.1 / CIUS-RO 1.0.1, B2B și B2C), urmărirea statusului, descărcare recipise — XML-ul generat trece validatorul oficial ANAF (`npx tsx scripts/validate-ubl.ts`)
- Inbox SPV: facturi primite → import automat ca cheltuieli (cu furnizor creat din XML)
- Validare XML și conversie XML → PDF prin serviciile oficiale ANAF
- e-Transport: declarare UIT direct din aviz/factură
- Verificare CUI în registrul ANAF (TVA, TVA la încasare, split TVA, inactivi, RO e-Factura)
- Mod **Simulare** — totul funcționează fără certificat, pentru demo și dezvoltare

**Asistent AI (OpenAI)**
- Bulă flotantă în colțul ecranului (⌘J) și pagină dedicată `/asistent`, cu streaming, efect de typing și cipuri animate pentru fiecare unealtă folosită
- 19 unelte pe datele firmei: indicatori financiari, facturi, restanțe, parteneri, cheltuieli, stocuri, e-Factura, CUI ANAF, curs BNR, proiecte, pontaje, încărcarea echipei; poate crea facturi și pontaje **ciornă**
- Istoric persistent (căutare, fixare, redenumire, ștergere), feedback, consum de tokeni, căutare web pentru legislație fiscală
- **Conectori MCP externi** (Notion, GitHub, CRM…) și **server MCP propriu** (`/api/mcp`) pentru Claude Desktop/Code, Cursor, ChatGPT — cu chei API per utilizator
- Respectă rolul utilizatorului (un angajat nu vede datele financiare)

**Achiziții și stocuri**
- Cheltuieli / facturi primite cu plăți, categorii și alocare pe proiect
- Gestiuni multiple, NIR, bon de consum, transfer, inventar, fișa magaziei, cost mediu ponderat
- Descărcare automată din gestiune la facturare

**Outsourcing digital**
- Proiecte (T&M, preț fix, retainer, intern) cu buget de ore/sumă, echipă și tarife
- Kanban de task-uri cu drag & drop
- Pontaj săptămânal cu cronometru, trimitere spre aprobare și aprobări
- Planificare echipă (timetable pe fiecare om: ce proiect, câte ore/zi), concedii, sărbători legale
- Facturarea orelor aprobate direct din proiect

**Rapoarte și administrare**
- Dashboard, vânzări, jurnale TVA și decont estimat, cash-flow, restanțe (aging), registru de casă, profitabilitate pe proiect/client, pontaj, stocuri — toate exportabile CSV
- Multi-firmă, utilizatori cu roluri (proprietar, admin, contabil, manager, angajat), jurnal de activitate
- Temă luminoasă/întunecată, căutare globală ⌘K, interfață responsive

## Rulare în Docker (recomandat)

```bash
npm run docker:up        # build + pornire → http://localhost:3210
npm run docker:logs      # loguri
npm run docker:down      # oprire
```

`docker:up`:
- rulează o **singură instanță** (`anaf-for-dummies-app`): oprește containerul anterior și serverele `next` pornite din acest proiect;
- folosește portul **3210** legat doar pe `127.0.0.1`; dacă e ocupat de alt proces, alege automat următorul port liber (sau `AFD_PORT=4500 npm run docker:up`);
- generează `.env.docker` (ignorat de git) cu secretele aplicației și preia cheile OpenAI din `.env.local` — secretele nu intră în imagine;
- la prima pornire aplică migrările și încarcă datele demo (dezactivabil cu `SEED_DEMO=false`); baza SQLite stă în volumul `anaf-for-dummies-data`.

## Dai aplicația altcuiva

```bash
npm run share    # → ../AND-AAAA-LL-ZZ.zip, fără .env*, fără data/ și fără node_modules
```

Destinatarul are nevoie doar de Docker Desktop și urmează [PORNIRE.md](PORNIRE.md) (`docker compose up -d --build`). La prima pornire, containerul generează singur secretele aplicației și le păstrează în volumul de date; cheia OpenAI și-o pune fiecare în `.env.docker`.

## Dezvoltare locală

Cerințe: Node.js ≥ 20.9 (recomandat 24).

```bash
npm install
cp .env.example .env.local      # completează AUTH_SECRET și OPENAI_API_KEY
npm run setup                    # migrări + date demo
npm run dev                      # http://localhost:3000
```

Conturi demo (parola `demo1234`):

| Email | Rol |
| --- | --- |
| demo@anaffordummies.ro | Proprietar (acces complet) |
| contabil@anaffordummies.ro | Contabil |
| manager@anaffordummies.ro | Manager proiecte |
| ana@anaffordummies.ro | Angajat (doar pontaj/proiecte) |

**Conturi proprii:** pe `/register` îți creezi contul și firma (CUI, adresă, județ — se pot prelua de la ANAF). Colegii îi adaugi din *Setări → Utilizatori* (cont nou cu parolă temporară, pe care și-o schimbă din *Profil*).

Comenzi utile: `npm run db:reset` (reface baza de date demo), `npm run typecheck`, `npm run build && npm start`.

## Asistentul AI

Setează în `.env.local` (sau `.env.docker`):

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.5            # modelul principal (se poate schimba și din Asistent → Setări)
OPENAI_FAST_MODEL=gpt-5.4-mini  # pentru titlurile conversațiilor
```

Folosește OpenAI Responses API cu function calling, web search și MCP la distanță; conversațiile sunt stocate în baza de date a aplicației (`store: false` la OpenAI, raționamentul se reia criptat).

**Serverul MCP al platformei:** creează o cheie în *Asistent AI → Setări, MCP & chei API*, apoi de exemplu:

```bash
claude mcp add --transport http anaf-for-dummies http://localhost:3210/api/mcp \
  --header "Authorization: Bearer afd_..."
```

## Conectarea la ANAF (producție)

1. Înregistrează aplicația în SPV: [anaf.ro/InregOauth](https://www.anaf.ro/InregOauth), autentificat cu certificatul digital calificat al reprezentantului (care are drepturi pe CIF-ul firmei în SPV).
2. La **Callback URL** pune exact `${APP_URL}/api/anaf/callback`. Bifează serviciile *E-Factura* și *E-Transport*.
3. În aplicație: **e-Factura · SPV → Setări conexiune**: alege mediul (*Test* sau *Producție*), completează Client ID și Client Secret, salvează și apasă **Conectează cu certificatul digital**.
4. Token-ul de acces e valabil 90 de zile și se reîmprospătează automat (refresh token valabil 365 de zile).

Pentru sincronizarea automată a SPV-ului și generarea facturilor recurente, programează un cron zilnic:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3210/api/cron
```

## Securitate

- Sesiuni JWT în cookie httpOnly, parole scrypt, permisiuni pe roluri, toate datele izolate pe firmă.
- Token-urile ANAF, Client Secret-ul, parola SMTP și token-urile conectorilor MCP sunt criptate în baza de date (AES-256-GCM, cheie derivată din `AUTH_SECRET`); cheile API pentru MCP se păstrează doar ca hash SHA-256.
- Containerul rulează ca utilizator non-root și e expus doar pe `127.0.0.1`. Pentru acces din rețea, pune-l în spatele unui reverse proxy HTTPS și setează `APP_URL`.

## Arhitectură

Next.js 16 (App Router, Server Actions) · TypeScript · Drizzle ORM + SQLite/libSQL · Tailwind CSS v4 · Radix UI · Motion · Recharts · OpenAI SDK.
Detalii, convenții și catalogul componentelor: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
