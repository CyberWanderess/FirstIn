/**
 * Load .env.local into process.env before any src/lib imports that need DATABASE_PATH.
 * Import this as the very first statement in each script entry point.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const envFile = join(process.cwd(), '.env.local');
if (existsSync(envFile)) {
  const content = readFileSync(envFile, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    // Don't override values already set in the environment
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
