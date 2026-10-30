# Cum pornești AND (ANAF for Dummies)

Aplicația rulează pe calculatorul tău, în Docker. Datele rămân doar la tine.

## Prima pornire

1. Instalează **Docker Desktop** de pe [docker.com](https://www.docker.com/products/docker-desktop/) și pornește-l (iconița cu balena trebuie să fie activă).
2. Dezarhivează `AND-….zip` într-un folder.
3. Deschide un terminal **în acel folder**:
   - Mac: Terminal → scrie `cd ` (cu spațiu), trage folderul în fereastră, apasă Enter.
   - Windows: click dreapta în folder → „Open in Terminal”.
4. Rulează:

   ```bash
   docker compose up -d --build
   ```

   Prima dată durează câteva minute (descarcă și construiește aplicația).
5. Deschide **http://localhost:3210** în browser.
   - Cont demo, cu date de test: `demo@anaffordummies.ro` / `demo1234`
   - Sau „Creează unul gratuit” pentru contul și firma ta.

## Folosire zilnică

| Ce vrei | Comanda (în folderul aplicației) |
| --- | --- |
| Oprești aplicația | `docker compose down` |
| O pornești din nou | `docker compose up -d` |
| Instalezi o versiune nouă | dezarhivezi peste cea veche, apoi `docker compose up -d --build` |

Datele (firme, facturi, conturi) se păstrează între opriri și actualizări.

## Opțional

**Fără datele demo** — doar la prima pornire:

```bash
SEED_DEMO=false docker compose up -d --build              # Mac / Linux
$env:SEED_DEMO="false"; docker compose up -d --build      # Windows (PowerShell)
```

**Asistentul AI** — creează în folder un fișier `.env.docker` cu cheia ta OpenAI, apoi `docker compose up -d`:

```
OPENAI_API_KEY=sk-...
```

**Portul 3210 e ocupat** — alege altul, de exemplu `AFD_PORT=4500 docker compose up -d` și deschizi http://localhost:4500.

## e-Factura

Aplicația pornește în modul **Simulare**: nimic nu ajunge la ANAF. Pentru facturare reală, din *e-Factura · SPV → Setări conexiune* conectezi certificatul digital al firmei (pașii sunt explicați acolo).
