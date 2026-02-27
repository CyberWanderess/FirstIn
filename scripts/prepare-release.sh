#!/usr/bin/env bash
# Merge main into release and strip crawler files.
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

CURRENT_BRANCH=$(git branch --show-current)

echo "=== Preparing release ==="
git checkout release
git merge main --no-edit

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
  src/app/api/crawl/hiring-cafe/route.ts
  src/app/api/crawl/fetch-jd/route.ts
  src/app/api/import/parse/route.ts
  src/components/crawl-trigger.tsx
  src/lib/parsers/hiring-cafe-parser.ts
)

REMOVED=0
for f in "${FILES_TO_REMOVE[@]}"; do
  if git ls-files --error-unmatch "$f" &>/dev/null 2>&1; then
    git rm -q "$f"
    ((REMOVED++))
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
  cp .env.example "$ENV_FILE" 2>/dev/null || true
fi
# Add flags if not present, then force values to false
for KEY in ENABLE_CRAWLER ENABLE_CHINESE_AFFINITY NEXT_PUBLIC_ENABLE_CRAWLER; do
  grep -q "^${KEY}=" "$ENV_FILE" 2>/dev/null || echo "${KEY}=false" >> "$ENV_FILE"
  sed -i "s/^${KEY}=.*/${KEY}=false/" "$ENV_FILE"
done
echo "Feature flags set to false in $ENV_FILE"

# --- Install dependencies ---
npm install --silent 2>/dev/null || true

# --- Commit ---
git add -A
if git diff --cached --quiet; then
  echo "No changes to commit (release is up to date)"
else
  git commit -m "Update release from main

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
  echo "Release branch updated!"
fi

# --- Verify build ---
echo "Verifying build..."
if npx next build >/dev/null 2>&1; then
  echo "Build passed!"
else
  echo "WARNING: Build failed. Check the release branch."
fi

# --- Return to original branch ---
git checkout "$CURRENT_BRANCH"
echo "=== Done. Back on $CURRENT_BRANCH ==="
