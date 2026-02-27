#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

API_URL="${API_URL:-http://localhost:3000/api/crawl/hiring-cafe}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

log "Starting crawl: $API_URL"

HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL" \
  -H "Content-Type: application/json" 2>&1) || {
  log "ERROR: curl failed (is the server running?)"
  exit 1
}

HTTP_BODY=$(echo "$HTTP_RESPONSE" | head -n -1)
HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -n 1)

if [[ "$HTTP_CODE" -ge 200 && "$HTTP_CODE" -lt 300 ]]; then
  log "Crawl succeeded (HTTP $HTTP_CODE)"
  echo "$HTTP_BODY"
else
  log "ERROR: Crawl failed (HTTP $HTTP_CODE)"
  echo "$HTTP_BODY" >&2
  exit 1
fi

log "Done"
