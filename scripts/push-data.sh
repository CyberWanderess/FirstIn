#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DB_PATH="$PROJECT_DIR/data/jobhq.db"
BACKUP_PATH="$PROJECT_DIR/data/firstin-backup.db"
R2_REMOTE="r2:firstin-data/db"

if [ ! -f "$DB_PATH" ]; then
  echo "Database not found at $DB_PATH"
  exit 1
fi

# Create safe backup copy (avoids pushing a file being written to)
sqlite3 "$DB_PATH" ".backup '$BACKUP_PATH'"
echo "Backup created at $BACKUP_PATH"

# Push to R2
rclone copy "$BACKUP_PATH" "$R2_REMOTE/"
echo "Pushed to $R2_REMOTE/"

# Optional daily snapshot
if [ "${1:-}" = "--snapshot" ]; then
  SNAPSHOT_NAME="firstin-$(date +%Y%m%d).db"
  rclone copyto "$BACKUP_PATH" "$R2_REMOTE/snapshots/$SNAPSHOT_NAME"
  echo "Snapshot: $R2_REMOTE/snapshots/$SNAPSHOT_NAME"
fi

rm -f "$BACKUP_PATH"
echo "Done: $(date)"
