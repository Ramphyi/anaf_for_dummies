#!/bin/sh
# Pornire container: secrete, migrări, date demo la prima rulare (SEED_DEMO=true), apoi serverul Next.js.
set -e
FIRST_RUN=0
[ -f /app/data/anaf-for-dummies.db ] || FIRST_RUN=1

# Secretele lipsă (pornire simplă cu `docker compose up`, fără .env.docker) se generează o singură dată
# și se păstrează în volumul de date — sesiunile și datele criptate rămân valide după repornire.
secret_from_volume() {
  file="/app/data/.$1"
  [ -s "$file" ] || node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))" > "$file"
  cat "$file"
}
[ -n "$AUTH_SECRET" ] || export AUTH_SECRET="$(secret_from_volume auth-secret)"
[ -n "$CRON_SECRET" ] || export CRON_SECRET="$(secret_from_volume cron-secret)"

./node_modules/.bin/tsx src/lib/db/migrate.ts
if [ "$FIRST_RUN" = "1" ] && [ "${SEED_DEMO:-true}" = "true" ]; then
  echo "→ Prima pornire: încarc datele demo (demo@anaffordummies.ro / demo1234)"
  ./node_modules/.bin/tsx src/lib/db/seed.ts
fi

exec ./node_modules/.bin/next start -p "${PORT:-3000}" -H "${HOSTNAME:-0.0.0.0}"
