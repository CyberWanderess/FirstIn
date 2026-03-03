#!/usr/bin/env bash
# Merge main into release and strip crawler files.
# Uses git worktree so the main working directory (and any running dev server) is unaffected.
# Feature flags (ENABLE_CRAWLER, ENABLE_CHINESE_AFFINITY) handle logic toggling,
# so this script only needs to delete crawler-specific files and dependencies.
# Usage: bash scripts/prepare-release.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Ensure clean working tree
if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: Working tree is not clean. Commit or stash changes first."
  exit 1
fi

WORKTREE_DIR=$(mktemp -d "/tmp/firstin-release-XXXXXX")

cleanup() {
  cd "$PROJECT_DIR"
  git worktree remove --force "$WORKTREE_DIR" 2>/dev/null || rm -rf "$WORKTREE_DIR"
}
trap cleanup EXIT

echo "=== Preparing release (worktree: $WORKTREE_DIR) ==="
git worktree add "$WORKTREE_DIR" release
cd "$WORKTREE_DIR"
git -c user.name="FirstIn Release Bot" -c user.email="noreply@firstin.dev" \
  merge main --allow-unrelated-histories --no-edit -X theirs

# --- Remove crawler-specific files ---
FILES_TO_REMOVE=(
  scripts/crawl-extract.ts
  scripts/fetch-jd.ts
  scripts/test-search.ts
  scripts/crawl.sh
  scripts/pull-data.sh
  scripts/push-data.sh
  scripts/prepare-release.sh
  src/lib/scraper/hiring-cafe-crawler.ts
  src/lib/scraper/hiring-cafe-extractor.ts
  src/lib/scraper/hiring-cafe-stealth.ts
  src/app/api/crawl/source/route.ts
  src/app/api/crawl/fetch-jd/route.ts
  src/app/api/import/parse/route.ts
  src/lib/parsers/hiring-cafe-parser.ts
)

REMOVED=0
for f in "${FILES_TO_REMOVE[@]}"; do
  if git ls-files --error-unmatch "$f" &>/dev/null 2>&1; then
    git rm -q -f "$f"
    REMOVED=$((REMOVED + 1))
  fi
done
echo "Removed $REMOVED crawler files"

# --- Remove playwright dependency ---
if grep -q '"playwright"' package.json; then
  sed -i '/"playwright"/d' package.json
  echo "Removed playwright dependency"
fi

# --- Ensure .env.local has feature flags disabled ---
ENV_FILE=".env.local"
if [ ! -f "$ENV_FILE" ]; then
  cp .env.example "$ENV_FILE" 2>/dev/null || touch "$ENV_FILE"
fi
# Add flags if not present, then force values to false
for KEY in ENABLE_CRAWLER ENABLE_CHINESE_AFFINITY NEXT_PUBLIC_ENABLE_CRAWLER; do
  grep -q "^${KEY}=" "$ENV_FILE" 2>/dev/null || echo "${KEY}=false" >> "$ENV_FILE"
  sed -i "s/^${KEY}=.*/${KEY}=false/" "$ENV_FILE"
done
echo "Feature flags set to false in $ENV_FILE"

# --- Install dependencies ---
npm install --silent 2>/dev/null || true

# --- PII scan before committing ---
echo "Scanning for PII leaks..."
PII_FOUND=0

# Check for Chinese characters (excluding node_modules, .next, data/)
if git diff --cached --name-only | xargs grep -Pl '[\x{4e00}-\x{9fff}]' 2>/dev/null; then
  echo "WARNING: Chinese characters found in staged files (potential PII)"
  PII_FOUND=1
fi

# Check for personal identifiers (emails, real names)
PII_PATTERNS='canliu|canl@|1002@|personal|私人'
if git diff --cached -U0 | grep -iP "$PII_PATTERNS" 2>/dev/null; then
  echo "WARNING: Potential personal identifiers found in diff"
  PII_FOUND=1
fi

if [ "$PII_FOUND" -eq 1 ]; then
  echo "PII scan found warnings above. Review before pushing."
fi

# --- Commit with sanitized author ---
RELEASE_AUTHOR="FirstIn Release Bot <noreply@firstin.dev>"
git add -A
if git diff --cached --quiet; then
  echo "No changes to commit (release is up to date)"
else
  git -c user.name="FirstIn Release Bot" -c user.email="noreply@firstin.dev" \
    commit -m "Update release from main"
  echo "Release branch updated (author: $RELEASE_AUTHOR)"
fi

# --- Verify build ---
echo "Verifying build..."
if npx next build >/dev/null 2>&1; then
  echo "Build passed!"
else
  echo "WARNING: Build failed. Check the release branch."
fi

# --- Cleanup (handled by trap) ---
cd "$PROJECT_DIR"
echo "=== Done. Main working directory was not touched. ==="
