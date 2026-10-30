# Cum pornești AND (ANAF for Dummies)

Aplicația rulează pe calculatorul tău, în Docker. Datele rămân doar la tine.

## De ce ai nevoie

- **Docker Desktop** — [docker.com](https://www.docker.com/products/docker-desktop/). Pornește-l după instalare (iconița cu balena trebuie să fie activă).
- **Git** — [git-scm.com](https://git-scm.com/downloads). Pe Mac îl ai deja sau ți-l instalează sistemul la prima comandă `git`.
- **Acces la repository** — e privat: proprietarul te adaugă pe GitHub (Settings → Collaborators), iar tu accepți invitația primită pe email.

## Prima pornire

1. Deschide un terminal (Mac: aplicația Terminal · Windows: PowerShell) și rulează:

   ```bash
   git clone https://github.com/Ramphyi/anaf_for_dummies.git
   cd anaf_for_dummies
   docker compose up -d --build
   ```

   La `git clone` ți se cere autentificarea GitHub (se deschide browserul). Prima pornire durează câteva minute — se descarcă și se construiește aplicația.
2. Deschide **http://localhost:3210** în browser.
   - Cont demo, cu date de test: `demo@anaffordummies.ro` / `demo1234`
   - Sau „Creează unul gratuit” pentru contul și firma ta.

## Folosire zilnică

| Ce vrei | Comanda (în folderul aplicației) |
| --- | --- |
| Oprești aplicația | `docker compose down` |
| O pornești din nou | `docker compose up -d` |
| Instalezi o versiune nouă | `git pull`, apoi `docker compose up -d --build` |

Datele (firme, facturi, conturi) se păstrează între opriri și actualizări — stau în Docker, nu în folderul clonat.

Ai primit o arhivă `.zip` în loc de link? Dezarhiveaz-o, deschide terminalul în folderul ei și rulează doar `docker compose up -d --build`.

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
