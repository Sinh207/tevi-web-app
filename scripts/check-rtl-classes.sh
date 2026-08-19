#!/usr/bin/env bash
# Guards against physical (LTR-only) Tailwind spacing/position classes that break RTL.
# Use logical properties instead: ps/pe (padding-start/end), ms/me (margin-start/end),
# start/end (positioning). See docs/DEFINITION_OF_DONE.md.
set -euo pipefail

cd "$(dirname "$0")/.."

matches=$(grep -rnE '\b(pl|pr|ml|mr)-[0-9]+\b|\b(left|right)-[0-9]+\b' \
    src --include='*.tsx' --include='*.ts' 2>/dev/null | grep -v '/shared/ui/' || true)

if [ -n "$matches" ]; then
    echo "Physical Tailwind classes found — use logical properties (ps/pe, ms/me, start/end):"
    echo "$matches"
    exit 1
fi

echo "OK — no physical Tailwind spacing/position classes found."
