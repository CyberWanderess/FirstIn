#!/usr/bin/env bash
# JobHQ deployment script for Ubuntu 22/24 and macOS.
# Usage: bash scripts/deploy.sh
set -euo pipefail

echo "=== JobHQ Deployment ==="

# --- Detect OS ---
OS="unknown"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
  OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
  OS="macos"
fi
echo "Detected OS: $OS"

# --- Check / Install Node.js ---
if command -v node &>/dev/null; then
  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  echo "Node.js found: $(node -v)"
  if (( NODE_VERSION < 20 )); then
    echo "WARNING: Node.js 20+ is required. Current version: $(node -v)"
    echo "Please upgrade Node.js and re-run this script."
    exit 1
  fi
else
  echo "Node.js not found. Installing Node.js 20 LTS..."
  if [[ "$OS" == "linux" ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif [[ "$OS" == "macos" ]]; then
    if command -v brew &>/dev/null; then
      brew install node@20
    else
      echo "ERROR: Homebrew not found. Install Node.js 20+ manually:"
      echo "  https://nodejs.org/en/download/"
      exit 1
    fi
  else
    echo "ERROR: Unsupported OS. Install Node.js 20+ manually."
    exit 1
  fi
  echo "Node.js installed: $(node -v)"
fi

# --- Install build dependencies (Linux) ---
if [[ "$OS" == "linux" ]]; then
  echo "Checking build dependencies..."
  DEPS_NEEDED=()
  for pkg in build-essential python3; do
    if ! dpkg -s "$pkg" &>/dev/null; then
      DEPS_NEEDED+=("$pkg")
    fi
  done
  if (( ${#DEPS_NEEDED[@]} > 0 )); then
    echo "Installing: ${DEPS_NEEDED[*]}"
    sudo apt-get update -qq
    sudo apt-get install -y "${DEPS_NEEDED[@]}"
  else
    echo "Build dependencies OK"
  fi
fi

# --- Install npm dependencies ---
echo "Installing npm dependencies..."
npm install

# --- Create .env.local if missing ---
if [[ ! -f .env.local ]]; then
  echo "Creating .env.local from .env.example..."
  cp .env.example .env.local
  # Set production defaults
  sed -i.bak 's/# NODE_ENV=production/NODE_ENV=production/' .env.local 2>/dev/null || true
  rm -f .env.local.bak
  echo "Created .env.local — edit DATABASE_PATH if needed."
else
  echo ".env.local already exists, skipping."
fi

# --- Build ---
echo "Building production bundle..."
npm run build

echo ""
echo "=== Build complete! ==="
echo ""
echo "To start the server:"
echo "  npm start"
echo ""
echo "For production use, consider running with pm2:"
echo "  npm install -g pm2"
echo "  pm2 start npm --name jobhq -- start"
echo "  pm2 save"
echo "  pm2 startup  # auto-start on reboot"
echo ""
echo "Or with systemd (see README.md for unit file example)."
echo ""
echo "The app will be available at http://localhost:3000"
echo "Complete the Setup Wizard on first visit to configure your preferences."
