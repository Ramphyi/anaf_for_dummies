#!/usr/bin/env bash
# Creează o arhivă a aplicației pentru altcineva — FĂRĂ chei/secrete (.env*), FĂRĂ baza de date (data/)
# și fără folderele generate (node_modules, .next). Destinatarul urmează PORNIRE.md.
#   npm run share   → ../AND-AAAA-LL-ZZ.zip
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="$(cd .. && pwd)/AND-$(date +%Y-%m-%d).zip"
rm -f "$OUT"
zip -qr "$OUT" . \
  -x 'node_modules/*' '.next/*' '.git/*' 'data/*' '*.tsbuildinfo' '*.DS_Store' \
  -x '.env' '.env.local' '.env.docker' '.env.*.local'

# Plasă de siguranță: arhiva nu are voie să conțină chei sau baze de date.
if unzip -Z1 "$OUT" | grep -E '(^|/)\.env($|\.local$|\.docker$)|\.db($|-)' >/dev/null; then
  echo "✗ Arhiva conține fișiere cu secrete sau date — o șterg." >&2
  rm -f "$OUT"
  exit 1
fi
if unzip -p "$OUT" | grep -aqE 'sk-(proj-)?[A-Za-z0-9_-]{20,}'; then
  echo "✗ Arhiva conține ceva ce arată a cheie OpenAI — o șterg." >&2
  rm -f "$OUT"
  exit 1
fi

echo "✓ Arhivă creată: $OUT ($(du -h "$OUT" | cut -f1))"
echo "  Fără .env*, fără data/ și fără node_modules. Destinatarul citește PORNIRE.md."
