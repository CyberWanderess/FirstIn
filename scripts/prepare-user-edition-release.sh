#!/usr/bin/env bash
# Prepare user-edition for public GitHub release.
# Creates an orphan branch with squashed history, removes personal files,
# sanitizes PII, and uses anonymous author.
# Usage: bash scripts/prepare-user-edition-release.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

RELEASE_BRANCH="user-edition-release"
RELEASE_AUTHOR="FirstIn Release Bot <noreply@firstin.dev>"

echo "=== Preparing user-edition release ==="

# Work in a temporary worktree to avoid touching the current directory
WORKTREE_DIR=$(mktemp -d "/tmp/firstin-ue-release-XXXXXX")

cleanup() {
  cd "$PROJECT_DIR"
  git worktree remove --force "$WORKTREE_DIR" 2>/dev/null || rm -rf "$WORKTREE_DIR"
}
trap cleanup EXIT

# Create or reset the release branch as orphan
if git show-ref --verify --quiet "refs/heads/$RELEASE_BRANCH"; then
  echo "Removing existing $RELEASE_BRANCH branch..."
  git branch -D "$RELEASE_BRANCH"
fi

# Create orphan branch in worktree
git worktree add --detach "$WORKTREE_DIR"
cd "$WORKTREE_DIR"
git checkout --orphan "$RELEASE_BRANCH"

# Copy all tracked files from user-edition
# Copy working directory (includes uncommitted changes, respects .gitignore via rsync exclude)
rsync -a --exclude='.git' --exclude='node_modules' --exclude='.next' --exclude='data/' \
  --exclude='.env.local' --exclude='.env' \
  "$PROJECT_DIR/" "$WORKTREE_DIR/"

# --- Remove personal scripts and configs ---
PERSONAL_FILES=(
  scripts/pull-data.sh
  scripts/push-data.sh
  scripts/deploy-to-prod.sh
  scripts/deploy.sh
  scripts/import-email-alerts.ts
  scripts/fetch-jsearch.ts
  scripts/fetch-all-sources.ts
  scripts/fetch-ashby.ts
  scripts/fetch-greenhouse.ts
  scripts/fetch-lever.ts
  scripts/crawl.sh
  scripts/crawl-extract.ts
  scripts/refresh-cf-cookies.ts
  scripts/check-coverage.ts
  scripts/research-company-policies.ts
  scripts/test-search.ts
  config/job-sources.json
  # Also remove this script itself (not needed in release)
  scripts/prepare-user-edition-release.sh
  # Remove main-branch release script (contains PII patterns)
  scripts/prepare-release.sh
)

REMOVED=0
for f in "${PERSONAL_FILES[@]}"; do
  if [ -f "$f" ]; then
    rm -f "$f"
    REMOVED=$((REMOVED + 1))
  fi
done
echo "Removed $REMOVED personal files"

# Remove empty config dir if it exists
rmdir config 2>/dev/null || true

# --- Remove scraper library and crawl API routes (depend on scraper) ---
rm -rf src/lib/scraper 2>/dev/null && echo "Removed scraper library" || true
rm -rf src/app/api/crawl 2>/dev/null && echo "Removed crawl API routes" || true

# --- Sanitize README.md ---
if [ -f README.md ]; then
  sed -i 's|github\.com/CyberWanderess/FirstIn|github.com/your-username/FirstIn|g' README.md
  echo "Sanitized README.md"
fi

# --- Sanitize .env.example ---
if [ -f .env.example ]; then
  sed -i '/ENABLE_CHINESE_AFFINITY/d' .env.example
  echo "Sanitized .env.example"
fi

# --- Set feature flags ---
ENV_FILE=".env.local"
cat > "$ENV_FILE" <<'ENVEOF'
ENABLE_CRAWLER=false
ENABLE_CHINESE_AFFINITY=false
NEXT_PUBLIC_ENABLE_CRAWLER=false
ENVEOF
echo "Feature flags set in $ENV_FILE"

# --- PII scan before committing ---
echo ""
echo "=== PII Scan ==="
PII_FOUND=0

# Check for personal identifiers
PII_PATTERNS='canliu|canl@|1002@|yuedixupmlead|CyberWanderess'
if grep -rn --include='*.ts' --include='*.tsx' --include='*.json' --include='*.md' --include='*.sh' -iP "$PII_PATTERNS" . 2>/dev/null | grep -v node_modules | grep -v .next; then
  echo "WARNING: Personal identifiers found!"
  PII_FOUND=1
else
  echo "No personal identifiers found in source files"
fi

# Check for email addresses (excluding noreply@ and example@)
if grep -rn --include='*.ts' --include='*.tsx' --include='*.json' --include='*.md' --include='*.sh' -P '[a-zA-Z0-9._%+-]+@(gmail|yahoo|hotmail|outlook)\.' . 2>/dev/null | grep -v node_modules | grep -v .next; then
  echo "WARNING: Personal email addresses found!"
  PII_FOUND=1
else
  echo "No personal email addresses found"
fi

# Check for Chinese characters
if grep -rn --include='*.ts' --include='*.tsx' --include='*.json' --include='*.md' -P '[\x{4e00}-\x{9fff}]' . 2>/dev/null | grep -v node_modules | grep -v .next; then
  echo "WARNING: Chinese characters found!"
  PII_FOUND=1
else
  echo "No Chinese characters found"
fi

if [ "$PII_FOUND" -eq 1 ]; then
  echo ""
  echo "PII scan found warnings. Review above before pushing."
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
else
  echo "PII scan passed!"
fi

# --- Stage and commit ---
echo ""
echo "=== Committing ==="
git add -A
git -c user.name="FirstIn Release Bot" -c user.email="noreply@firstin.dev" \
  commit --author="$RELEASE_AUTHOR" -m "FirstIn User Edition — multi-tenant with auth, admin, and Chrome extension"

# --- Verify build ---
echo ""
echo "=== Verifying build ==="
npm install --prefer-offline 2>&1 | tail -5
if npx next build 2>&1 | tail -20; then
  echo "Build passed!"
else
  echo "WARNING: Build failed. Check the release branch before pushing."
fi

cd "$PROJECT_DIR"
echo ""
echo "=== Done ==="
echo "Release branch '$RELEASE_BRANCH' is ready."
echo "Review with: git log $RELEASE_BRANCH --oneline"
echo "Push with:   git push origin $RELEASE_BRANCH"
