#!/usr/bin/env bash
# Pornește AND (ANAF for Dummies) în Docker ca instanță UNICĂ, pe un port liber, accesibil doar pe 127.0.0.1.
#   npm run docker:up                 → port implicit 3210 (sau următorul liber)
#   AFD_PORT=4500 npm run docker:up
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${AFD_PORT:-3210}"
port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

# 1) O singură instanță: oprim containerul existent și serverele `next` pornite din acest proiect.
if docker ps -a --format '{{.Names}}' | grep -qx anaf-for-dummies-app; then
  echo "→ Opresc instanța Docker existentă (anaf-for-dummies-app)"
  docker compose down --remove-orphans >/dev/null
fi
for pid in $(pgrep -f "next (dev|start)" 2>/dev/null || true); do
  cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)
  if [ "$cwd" = "$PWD" ]; then
    echo "→ Opresc serverul local Next.js din acest proiect (PID $pid) — rulează doar containerul"
    kill "$pid" 2>/dev/null || true
  fi
done
sleep 1

# 2) Port liber (nu atingem porturile altor aplicații)
while port_busy "$PORT"; do
  echo "  portul $PORT e ocupat de alt proces, încerc $((PORT + 1))"
  PORT=$((PORT + 1))
done
export AFD_PORT="$PORT"

# 3) Secrete pentru container (.env.docker, ignorat de git). Cheile OpenAI se preiau din .env.local.
if [ ! -f .env.docker ]; then
  echo "→ Generez .env.docker"
  {
    echo "AUTH_SECRET=$(openssl rand -base64 48 | tr -d '\n/+=')"
    echo "CRON_SECRET=$(openssl rand -hex 24)"
    grep -E '^(OPENAI_API_KEY|OPENAI_MODEL|OPENAI_FAST_MODEL|OPENAI_ORG_ID|OPENAI_PROJECT_ID|OPENAI_REASONING_SUMMARY)=' .env.local 2>/dev/null || true
  } > .env.docker
  chmod 600 .env.docker
fi

# 4) Build + pornire
echo "→ Construiesc și pornesc containerul pe http://localhost:$PORT"
APP_URL="http://localhost:$PORT" docker compose up -d --build

# 5) Aștept să devină sănătos
printf "→ Aștept pornirea"
for _ in $(seq 1 90); do
  if curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    echo
    echo "✓ AND (ANAF for Dummies) rulează: http://localhost:$PORT   (demo@anaffordummies.ro / demo1234)"
    echo "  Loguri: npm run docker:logs   ·   Oprire: npm run docker:down"
    exit 0
  fi
  printf "."
  sleep 2
done
echo
echo "✗ Containerul nu a răspuns la timp. Vezi: docker compose logs app"
exit 1
