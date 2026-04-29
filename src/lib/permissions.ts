/**
 * Permission group system — flexible feature flags + usage quotas.
 * Admin users bypass all checks.
 */

import { getAuthDb, findUserById } from './auth-db';
import type { AuthUser } from './auth-db';

// --- Types & Constants ---

export const FEATURE_FLAGS = [
  'can_import',
  'can_export',
  'can_eval',
  'can_use_extension',
  'can_manage_rules',
  'can_import_rejections',
  'can_research',
] as const;

export type FeatureFlag = typeof FEATURE_FLAGS[number];

export const FEATURE_LABELS: Record<FeatureFlag, string> = {
  can_import: 'Import Jobs',
  can_export: 'Export Data',
  can_eval: 'AI Evaluation',
  can_use_extension: 'Chrome Extension',
  can_manage_rules: 'Manage Rules',
  can_import_rejections: 'Import Rejections',
  can_research: 'Company Research',
};

export const QUOTA_DIMENSIONS = [
  'max_jobs',
  'max_eval_per_month',
  'max_import_per_day',
] as const;

export type QuotaDimension = typeof QUOTA_DIMENSIONS[number];

export const QUOTA_LABELS: Record<QuotaDimension, string> = {
  max_jobs: 'Max Jobs',
  max_eval_per_month: 'AI Evals / Month',
  max_import_per_day: 'Imports / Day',
};

export interface PermissionGroup {
  id: number;
  name: string;
  description: string | null;
  is_default: boolean;
  features: Record<FeatureFlag, boolean>;
  quotas: Record<QuotaDimension, number>;
  user_count?: number;
  created_at: string;
  updated_at: string;
}

export interface UserPermissions {
  group: PermissionGroup | null;
  isAdmin: boolean;
  features: Record<FeatureFlag, boolean>;
  quotas: Record<QuotaDimension, number>;
}

// --- Default values ---

const DEFAULT_FEATURES: Record<FeatureFlag, boolean> = {
  can_import: true,
  can_export: true,
  can_eval: true,
  can_use_extension: true,
  can_manage_rules: true,
  can_import_rejections: true,
  can_research: true,
};

const DEFAULT_QUOTAS: Record<QuotaDimension, number> = {
  max_jobs: 0,
  max_eval_per_month: 0,
  max_import_per_day: 0,
};

// --- Row parsing ---

interface RawPermissionGroup {
  id: number;
  name: string;
  description: string | null;
  is_default: number;
  features: string;
  quotas: string;
  user_count?: number;
  created_at: string;
  updated_at: string;
}

function parseGroup(row: RawPermissionGroup): PermissionGroup {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    is_default: !!row.is_default,
    features: { ...DEFAULT_FEATURES, ...JSON.parse(row.features || '{}') },
    quotas: { ...DEFAULT_QUOTAS, ...JSON.parse(row.quotas || '{}') },
    user_count: row.user_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// --- CRUD ---

export function listPermissionGroups(): PermissionGroup[] {
  const db = getAuthDb();
  const rows = db.prepare(`
    SELECT pg.*, COUNT(u.id) as user_count
    FROM permission_groups pg
    LEFT JOIN users u ON u.permission_group_id = pg.id
    GROUP BY pg.id
    ORDER BY pg.created_at
  `).all() as RawPermissionGroup[];
  return rows.map(parseGroup);
}

export function getPermissionGroup(id: number): PermissionGroup | null {
  const db = getAuthDb();
  const row = db.prepare('SELECT * FROM permission_groups WHERE id = ?').get(id) as RawPermissionGroup | null;
  return row ? parseGroup(row) : null;
}

export function createPermissionGroup(data: {
  name: string;
  description?: string;
  features: Record<string, boolean>;
  quotas: Record<string, number>;
}): PermissionGroup {
  const db = getAuthDb();
  const result = db.prepare(`
    INSERT INTO permission_groups (name, description, features, quotas)
    VALUES (?, ?, ?, ?)
  `).run(data.name, data.description || null, JSON.stringify(data.features), JSON.stringify(data.quotas));
  return getPermissionGroup(result.lastInsertRowid as number)!;
}

export function updatePermissionGroup(id: number, data: {
  name?: string;
  description?: string;
  features?: Record<string, boolean>;
  quotas?: Record<string, number>;
}): PermissionGroup {
  const db = getAuthDb();
  const sets: string[] = ["updated_at = datetime('now')"];
  const params: (string | number)[] = [];

  if (data.name !== undefined) { sets.push('name = ?'); params.push(data.name); }
  if (data.description !== undefined) { sets.push('description = ?'); params.push(data.description); }
  if (data.features !== undefined) { sets.push('features = ?'); params.push(JSON.stringify(data.features)); }
  if (data.quotas !== undefined) { sets.push('quotas = ?'); params.push(JSON.stringify(data.quotas)); }

  params.push(id);
  db.prepare(`UPDATE permission_groups SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return getPermissionGroup(id)!;
}

export function deletePermissionGroup(id: number): { error?: string } {
  const db = getAuthDb();
  const group = getPermissionGroup(id);
  if (!group) return { error: 'Group not found' };
  if (group.is_default) return { error: 'Cannot delete the default group' };

  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users WHERE permission_group_id = ?').get(id) as { count: number }).count;
  if (userCount > 0) return { error: `Cannot delete: ${userCount} user(s) still assigned` };

  db.prepare('DELETE FROM permission_groups WHERE id = ?').run(id);
  return {};
}

export function setDefaultGroup(groupId: number): void {
  const db = getAuthDb();
  db.transaction(() => {
    db.prepare('UPDATE permission_groups SET is_default = 0').run();
    db.prepare('UPDATE permission_groups SET is_default = 1 WHERE id = ?').run(groupId);
  })();
}

export function assignUserGroup(userId: number, groupId: number): void {
  const db = getAuthDb();
  db.prepare('UPDATE users SET permission_group_id = ? WHERE id = ?').run(groupId, userId);
}

// --- Permission checks ---

export function getUserPermissions(userId: number): UserPermissions {
  const db = getAuthDb();
  const user = findUserById(userId);
  if (!user) {
    return { group: null, isAdmin: false, features: DEFAULT_FEATURES, quotas: DEFAULT_QUOTAS };
  }

  const isAdmin = user.role === 'admin';

  if (!user.permission_group_id) {
    // No group assigned — admin gets all, others get defaults
    return {
      group: null,
      isAdmin,
      features: isAdmin ? allFeaturesEnabled() : DEFAULT_FEATURES,
      quotas: isAdmin ? allQuotasUnlimited() : DEFAULT_QUOTAS,
    };
  }

  const group = getPermissionGroup(user.permission_group_id);
  if (!group) {
    return { group: null, isAdmin, features: DEFAULT_FEATURES, quotas: DEFAULT_QUOTAS };
  }

  return {
    group,
    isAdmin,
    features: isAdmin ? allFeaturesEnabled() : group.features,
    quotas: isAdmin ? allQuotasUnlimited() : group.quotas,
  };
}

export function checkFeature(userId: number, flag: FeatureFlag): boolean {
  const perms = getUserPermissions(userId);
  if (perms.isAdmin) return true;
  return perms.features[flag] ?? false;
}

export function checkQuota(userId: number, dimension: QuotaDimension): { allowed: boolean; current: number; limit: number } {
  const perms = getUserPermissions(userId);
  const limit = perms.quotas[dimension] ?? 0;

  // 0 = unlimited
  if (perms.isAdmin || limit === 0) {
    return { allowed: true, current: 0, limit: 0 };
  }

  const current = getCurrentUsage(userId, dimension);
  return { allowed: current < limit, current, limit };
}

export function incrementUsage(userId: number, dimension: QuotaDimension): void {
  const db = getAuthDb();
  const period = getUsagePeriod(dimension);

  db.prepare(`
    INSERT INTO usage_tracking (user_id, dimension, period, count, updated_at)
    VALUES (?, ?, ?, 1, datetime('now'))
    ON CONFLICT(user_id, dimension, period)
    DO UPDATE SET count = count + 1, updated_at = datetime('now')
  `).run(userId, dimension, period);
}

// --- Usage helpers ---

function getCurrentUsage(userId: number, dimension: QuotaDimension): number {
  if (dimension === 'max_jobs') {
    return getJobCount(userId);
  }

  const db = getAuthDb();
  const period = getUsagePeriod(dimension);
  const row = db.prepare(
    'SELECT count FROM usage_tracking WHERE user_id = ? AND dimension = ? AND period = ?'
  ).get(userId, dimension, period) as { count: number } | undefined;
  return row?.count ?? 0;
}

function getJobCount(userId: number): number {
  // Job count is in the per-user DB, but we access it via auth.db context
  // For simplicity, we count from the user's DB file directly
  try {
    const Database = require('better-sqlite3');
    const { resolve } = require('path');
    const dbPath = resolve(process.env.DATA_DIR || './data', `user_${userId}.db`);
    const userDb = new Database(dbPath, { readonly: true });
    const result = userDb.prepare('SELECT COUNT(*) as count FROM jobs').get() as { count: number };
    userDb.close();
    return result.count;
  } catch {
    return 0; // DB doesn't exist yet
  }
}

function getUsagePeriod(dimension: QuotaDimension): string {
  const now = new Date();
  if (dimension.includes('per_month')) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  if (dimension.includes('per_day')) {
    return now.toISOString().split('T')[0];
  }
  return 'lifetime';
}

function allFeaturesEnabled(): Record<FeatureFlag, boolean> {
  return Object.fromEntries(FEATURE_FLAGS.map(f => [f, true])) as Record<FeatureFlag, boolean>;
}

function allQuotasUnlimited(): Record<QuotaDimension, number> {
  return Object.fromEntries(QUOTA_DIMENSIONS.map(d => [d, 0])) as Record<QuotaDimension, number>;
}

/** Get usage summary for a user (for /api/auth/me response) */
export function getUserUsageSummary(userId: number): Record<string, { current: number; limit: number }> {
  const perms = getUserPermissions(userId);
  const result: Record<string, { current: number; limit: number }> = {};

  for (const dim of QUOTA_DIMENSIONS) {
    const limit = perms.quotas[dim] ?? 0;
    const current = limit === 0 && !perms.isAdmin ? 0 : getCurrentUsage(userId, dim);
    result[dim] = { current, limit };
  }

  return result;
}
