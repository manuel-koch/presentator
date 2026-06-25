#!/usr/bin/env bash
# Count lines of user code — TypeScript, CSS, Rust, HTML, TOML, Makefile
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Counting lines of code in ${ROOT}..."
find "$ROOT" \
  -type f \
  \( -name "*.ts" -o -name "*.tsx" -o -name "*.css" -o -name "*.rs" -o -name "*.html" -o -name "*.toml" -o -name "Makefile" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/dist/*" \
  -not -path "*/coverage/*" \
  -not -path "*/test-results/*" \
  -not -path "*/.git/*" \
  -not -path "*/src-tauri/target/*" \
  | sort \
  | xargs wc -l \
  | tail -1
