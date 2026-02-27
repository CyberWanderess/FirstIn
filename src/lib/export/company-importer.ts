import { getDb } from '@/lib/db';
import { findCompanyByName, updateCompany } from '@/lib/repositories/company-repository';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import type { ParseResult } from '@/types';

export interface CompanyResearchItem {
  name: string;
  industry?: string;
  size?: string;
  description?: string;
  sponsors_h1b?: boolean | null;
  chinese_affinity?: boolean | null;
  application_limit?: number | null;
  cooldown_months?: number | null;
  ai_summary?: string;
}

/**
 * Parse JSON text of company research results.
 */
export function parseCompanyResearch(jsonText: string): ParseResult<CompanyResearchItem> {
  const warnings: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { items: [], warnings: ['Invalid JSON format'] };
  }

  if (!Array.isArray(parsed)) {
    return { items: [], warnings: ['Expected a JSON array'] };
  }

  const items: CompanyResearchItem[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (!item.name || typeof item.name !== 'string') {
      warnings.push(`Item ${i + 1}: missing or invalid "name" field`);
      continue;
    }
    items.push({
      name: item.name,
      industry: item.industry || undefined,
      size: item.size || undefined,
      description: item.description || undefined,
      sponsors_h1b: item.sponsors_h1b ?? null,
      chinese_affinity: item.chinese_affinity ?? null,
      application_limit: typeof item.application_limit === 'number' ? item.application_limit : null,
      cooldown_months: typeof item.cooldown_months === 'number' ? item.cooldown_months : null,
      ai_summary: item.ai_summary || undefined,
    });
  }

  return { items, warnings };
}

/**
 * Apply company research results to the database.
 * Wraps in a transaction.
 */
export function applyCompanyResearch(items: CompanyResearchItem[]): { updated: number; errors: string[] } {
  const db = getDb();
  let updated = 0;
  const errors: string[] = [];

  const run = db.transaction(() => {
    for (const item of items) {
      const company = findCompanyByName(item.name);
      if (!company) {
        errors.push(`Company not found: "${item.name}"`);
        continue;
      }

      const updateData: Record<string, unknown> = {
        info_status: 'complete',
      };

      if (item.industry) updateData.industry = item.industry;
      if (item.size) updateData.size = item.size;
      if (item.description) updateData.description = item.description;
      if (item.ai_summary) updateData.ai_summary = item.ai_summary;
      if (item.application_limit !== undefined) updateData.application_limit = item.application_limit;
      if (item.cooldown_months !== undefined) updateData.cooldown_months = item.cooldown_months;

      // Handle chinese_affinity (full three-state)
      if (item.chinese_affinity === true) {
        updateData.chinese_affinity = 1;
      } else if (item.chinese_affinity === false) {
        updateData.chinese_affinity = 0;
      } else if (item.chinese_affinity === null) {
        updateData.chinese_affinity = null;
      }

      // Handle H1B sponsorship
      if (item.sponsors_h1b === false) {
        updateData.application_strategy = 'no_h1b';
        updateData.strategy_reason = 'Does not sponsor H1B';

        logOperation({
          operation: 'company_update',
          entity_type: 'company',
          entity_id: company.id,
          trigger: 'import',
          details: {
            field: 'application_strategy',
            from: company.application_strategy,
            to: 'no_h1b',
            reason: 'Company research: does not sponsor H1B',
          },
        });
      }

      updateCompany(company.id, updateData);
      updated++;

      logOperation({
        operation: 'company_update',
        entity_type: 'company',
        entity_id: company.id,
        trigger: 'import',
        details: { fields_updated: Object.keys(updateData).join(', ') },
      });
    }
  });

  run();
  return { updated, errors };
}
