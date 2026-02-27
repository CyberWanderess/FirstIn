#!/usr/bin/env bash
# Merge main into release and strip crawler / personal files.
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

# --- Remove crawler / personal files ---
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
  if git ls-files --error-unmatch "$f" &>/dev/null; then
    git rm -q "$f"
    ((REMOVED++))
  fi
done
echo "Removed $REMOVED files"

# --- Patch page.tsx: remove CrawlTrigger ---
PAGE_FILE="src/app/page.tsx"
if grep -q "CrawlTrigger" "$PAGE_FILE" 2>/dev/null; then
  sed -i "/import.*CrawlTrigger/d" "$PAGE_FILE"
  sed -i "s/const lastCrawl = recentOps.find((op) => op.operation === 'crawl');/const lastImport = recentOps.find((op) => op.operation === 'import');/" "$PAGE_FILE"
  sed -i "s/Last crawl: {lastCrawl/Last import: {lastImport/g" "$PAGE_FILE"
  sed -i "/<CrawlTrigger/d" "$PAGE_FILE"
  sed -i 's/className="flex items-center justify-between flex-wrap gap-4"/className="flex items-center gap-6 text-sm text-zinc-600"/' "$PAGE_FILE"
  echo "Patched page.tsx"
fi

# --- Patch package.json: remove playwright ---
if grep -q '"playwright"' package.json; then
  sed -i '/"playwright"/d' package.json
  npm install --silent 2>/dev/null
  echo "Removed playwright dependency"
fi

# --- Patch default platform ---
sed -i "s/'hiring_cafe'/'general'/g" src/lib/repositories/search-config-repository.ts 2>/dev/null || true
sed -i "s/'hiring_cafe'/'general'/g" src/lib/migrations/001_initial_schema.ts 2>/dev/null || true

# --- Patch settings-client.tsx: remove crawler section ---
SETTINGS_FILE="src/app/settings/settings-client.tsx"
if grep -q "CRAWLER_SECTION_START" "$SETTINGS_FILE" 2>/dev/null; then
  sed -i '/CRAWLER_SECTION_START/,/CRAWLER_SECTION_END/d' "$SETTINGS_FILE"
  echo "Patched settings-client.tsx: removed crawler section"
fi

# --- Patch import page.tsx: remove Paste Text tab ---
IMPORT_FILE="src/app/import/page.tsx"
if grep -q "Paste Text" "$IMPORT_FILE" 2>/dev/null; then
  sed -i "s/useState<'text' | 'json'>('json')/useState<'json'>('json')/" "$IMPORT_FILE"
  echo "Patched import page: JSON-only mode"
fi

# --- Strip chinese_affinity feature ---
echo "Stripping chinese_affinity..."

# Delete migration file
if git ls-files --error-unmatch src/lib/migrations/002_chinese_affinity.ts &>/dev/null; then
  git rm -q src/lib/migrations/002_chinese_affinity.ts
fi

# runner.ts: remove migration002 import and registration
sed -i "/import.*migration002.*002_chinese_affinity/d" src/lib/migrations/runner.ts
sed -i "/002_chinese_affinity/d" src/lib/migrations/runner.ts

# types/company.ts: remove chinese_affinity fields
sed -i "/chinese_affinity/d" src/types/company.ts

# types/job.ts: remove chinese_affinity field
sed -i "/chinese_affinity/d" src/types/job.ts

# job-repository.ts: remove c.chinese_affinity from SQL
sed -i "s/, c\.chinese_affinity//g" src/lib/repositories/job-repository.ts

# rule-engine.ts: remove chinese_affinity from Pick type and protect block
sed -i "s/ | 'chinese_affinity'//g" src/lib/rule-engine.ts
sed -i "/Chinese-affinity company/d" src/lib/rule-engine.ts
sed -i "/company?.chinese_affinity/,+2d" src/lib/rule-engine.ts

# company-exporter.ts: remove chinese_affinity from prompt
sed -i 's/, "chinese_affinity": true\/null//' src/lib/export/company-exporter.ts
sed -i "/chinese_affinity/d" src/lib/export/company-exporter.ts

# company-importer.ts: remove chinese_affinity handling
sed -i "/chinese_affinity/d" src/lib/export/company-importer.ts
sed -i "/Handle chinese_affinity/,/^$/d" src/lib/export/company-importer.ts

# jobs/page.tsx: remove 中 tag
sed -i '/chinese_affinity/,/) : null}/d' src/app/jobs/page.tsx

# Verify no remaining references
REMAINING=$(grep -r "chinese_affinity" src/ --include="*.ts" --include="*.tsx" -l 2>/dev/null || true)
if [ -n "$REMAINING" ]; then
  echo "WARNING: chinese_affinity still found in: $REMAINING"
else
  echo "chinese_affinity stripped successfully"
fi

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
