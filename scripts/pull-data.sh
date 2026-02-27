#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_DIR/data"
R2_REMOTE="r2:jobhq-data/db"

mkdir -p "$DATA_DIR"

rclone copy "$R2_REMOTE/jobhq.db" "$DATA_DIR/"

if [ -f "$DATA_DIR/jobhq.db" ]; then
  # Verify integrity
  RESULT=$(sqlite3 "$DATA_DIR/jobhq.db" "PRAGMA integrity_check;" 2>&1)
  if [ "$RESULT" = "ok" ]; then
    echo "Pulled and verified: $DATA_DIR/jobhq.db"
  else
    echo "WARNING: integrity check failed: $RESULT"
    exit 1
  fi
else
  echo "No database found on R2"
  exit 1
fi
