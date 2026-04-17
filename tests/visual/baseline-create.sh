#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# tests/visual/baseline-create.sh
#
# Creates or updates the Playwright visual regression baseline screenshots.
#
# Baseline source: designs/design-2-aurora.html (CLA-10 Aurora Dark Mockups)
# Snapshot output: tests/visual/visual.spec.ts-snapshots/
#
# Usage:
#   ./tests/visual/baseline-create.sh                    # Chromium only (default)
#   ./tests/visual/baseline-create.sh --browser firefox  # Firefox only
#   ./tests/visual/baseline-create.sh --browser webkit   # WebKit / Safari only
#   ./tests/visual/baseline-create.sh --browser all      # All three browsers
#
# After running, commit the generated snapshots:
#   git add tests/visual/visual.spec.ts-snapshots/
#   git commit -m "chore(visual): update Aurora Dark baseline [TR-06]"
#
# To update only when the design or a specific component changes, pass a grep
# pattern via VISUAL_GREP:
#   VISUAL_GREP="kpi" ./tests/visual/baseline-create.sh
#
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

# ── Argument parsing ──────────────────────────────────────────────────────────
BROWSER="chromium"  # chromium produces the canonical committed baseline

while [[ $# -gt 0 ]]; do
  case "$1" in
    --browser)
      BROWSER="$2"
      shift 2
      ;;
    --help|-h)
      sed -n '/^# Usage/,/^# ─/p' "$0" | grep -v "^# ─" | sed 's/^# //'
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Run with --help for usage." >&2
      exit 1
      ;;
  esac
done

# Validate browser argument
case "$BROWSER" in
  chromium|firefox|webkit|all) ;;
  *)
    echo "✗  Invalid browser: '$BROWSER'. Must be chromium, firefox, webkit, or all." >&2
    exit 1
    ;;
esac

# ── Pre-flight checks ─────────────────────────────────────────────────────────
echo "▶  Checking dependencies..."

if ! command -v node &>/dev/null; then
  echo "✗  node not found. Install Node.js >= 18." >&2
  exit 1
fi

if ! command -v npx &>/dev/null; then
  echo "✗  npx not found. Install Node.js >= 18." >&2
  exit 1
fi

if [ ! -d "$REPO_ROOT/node_modules" ]; then
  echo "   node_modules not found — running npm install..."
  npm install
fi

if [ ! -f "$REPO_ROOT/designs/design-2-aurora.html" ]; then
  echo "✗  designs/design-2-aurora.html not found." >&2
  echo "   The Aurora Dark design mockup (CLA-10) must exist before creating the baseline." >&2
  exit 1
fi

# ── Install Playwright browser binaries ──────────────────────────────────────
echo "▶  Ensuring Playwright browser binaries are installed..."
if [ "$BROWSER" = "all" ]; then
  npx playwright install chromium firefox webkit
else
  npx playwright install "$BROWSER"
fi

# ── Build project list ────────────────────────────────────────────────────────
if [ "$BROWSER" = "all" ]; then
  PROJECT_FLAGS=""  # run all projects defined in config
else
  PROJECT_FLAGS="--project ${BROWSER}-visual"
fi

# Optional grep pattern (passed via env var)
GREP_FLAG=""
if [ -n "${VISUAL_GREP:-}" ]; then
  GREP_FLAG="--grep ${VISUAL_GREP}"
fi

# ── Generate / update baseline ────────────────────────────────────────────────
echo ""
echo "▶  Generating baseline screenshots"
echo "   Browser  : ${BROWSER}"
echo "   Source   : designs/design-2-aurora.html (CLA-10 Aurora Dark)"
echo "   Output   : tests/visual/visual.spec.ts-snapshots/"
echo ""

# shellcheck disable=SC2086
npx playwright test \
  --config playwright.visual.config.ts \
  --update-snapshots \
  --reporter=list \
  ${PROJECT_FLAGS} \
  ${GREP_FLAG}

echo ""
echo "✓  Baseline screenshots updated."
echo ""
echo "   Review what changed:"
echo "     git diff --stat tests/visual/visual.spec.ts-snapshots/"
echo ""
echo "   Commit the baseline:"
echo "     git add tests/visual/visual.spec.ts-snapshots/"
echo "     git commit -m 'chore(visual): update Aurora Dark baseline [TR-06]'"
echo ""
echo "   Run comparison tests (no --update-snapshots) anytime with:"
echo "     npx playwright test --config playwright.visual.config.ts"
