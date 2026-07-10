#!/usr/bin/env bash
# Cardware Crash — push til GitHub.
#
# Indeholder BEVIDST ingen hemmeligheder. Den leder efter tokenet her, i rækkefølge:
#   1. $GITHUB_TOKEN i miljøet
#   2. ./.secrets                       (gitignored, i repo-roden)
#   3. /mnt/user-data/uploads/.secrets  (hvis filen er vedhæftet i chatten)
#   4. ~/.secrets
#
# Brug:  bash tools/push.sh ["commit-besked"]
#        Uden besked pushes blot det der allerede er committet.
#
# Bemærk: tokenet mangler workflow-scope, så filer under .github/workflows/
# kan IKKE pushes. De holdes bevidst ude af commits her.

set -euo pipefail

REPO_DEFAULT="jxrgen/kortslutning"

# --- find token uden at printe det ---
if [ -z "${GITHUB_TOKEN:-}" ]; then
  for f in "./.secrets" "/mnt/user-data/uploads/.secrets" "$HOME/.secrets"; do
    if [ -f "$f" ]; then
      # shellcheck disable=SC1090
      set -a; . "$f"; set +a
      echo "→ token hentet fra $f"
      break
    fi
  done
fi

if [ -z "${GITHUB_TOKEN:-}" ]; then
  cat <<'EOF'
✗ Intet GitHub-token fundet.

Gør ét af følgende:
  export GITHUB_TOKEN="github_pat_..."
eller opret en .secrets-fil i repo-roden med:
  GITHUB_TOKEN="github_pat_..."
  GITHUB_REPO="jxrgen/kortslutning"

Tokenet ligger i dette projekts instruktioner.
EOF
  exit 1
fi

REPO="${GITHUB_REPO:-$REPO_DEFAULT}"
URL="https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO}.git"

# --- commit hvis der er ændringer og en besked er givet ---
if [ $# -ge 1 ] && [ -n "$1" ]; then
  git add -A
  # workflow-filer kan ikke pushes med dette token — hold dem ude
  git reset -q .github/workflows/ 2>/dev/null || true
  if git diff --cached --quiet; then
    echo "→ ingen ændringer at committe"
  else
    git commit -q -m "$1"
    echo "→ committed: $1"
  fi
fi

# --- push, og flet ind hvis remote er løbet foran ---
if git push -q "$URL" main 2>/dev/null; then
  echo "✓ PUSH OK → $REPO"
else
  echo "→ remote er divergeret, henter og fletter…"
  git config pull.rebase false
  git pull --no-edit -q "$URL" main
  git push -q "$URL" main
  echo "✓ PUSH OK efter merge → $REPO"
fi

git log --oneline -1
