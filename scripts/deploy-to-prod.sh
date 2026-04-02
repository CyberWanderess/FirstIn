#!/bin/bash
set -e

PROD_DIR="$HOME/projects/jobhq-prod"

echo "==> Pulling latest main into prod..."
cd "$PROD_DIR"
git merge main

echo "==> Installing dependencies..."
npm install

echo "==> Building production bundle..."
npm run build

echo "==> Restarting PM2..."
pm2 restart jobhq

echo "==> Done. jobhq is now running the latest build."
pm2 list
