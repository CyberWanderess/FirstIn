import { config } from '@/lib/config';
import { getDb } from '@/lib/db';
import { findCompanyByNameFuzzy, updateCompany } from '@/lib/repositories/company-repository';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import type { Company, ParseResult } from '@/types';

export interface CompanyResearchItem {
  name: string;
  industry?: string;
  size?: string;
  description?: string;
  sponsors_h1b?: boolean | null;
  chinese_affinity?: boolean | null;
  application_limit?: number | null;
  limit_period_months?: number | null;
  cooldown_months?: number | null;
  funding_round?: string | null;
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
      limit_period_months: typeof item.limit_period_months === 'number' ? item.limit_period_months : null,
      cooldown_months: typeof item.cooldown_months === 'number' ? item.cooldown_months : null,
      funding_round: typeof item.funding_round === 'string' ? item.funding_round : null,
      ai_summary: item.ai_summary || undefined,
    });
  }

  return { items, warnings };
}

/**
 * Apply company research results to the database.
 * Wraps in a transaction.
 */
function normalizeCompanyName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function applyCompanyResearch(items: CompanyResearchItem[]): { updated: number; merged: number; errors: string[] } {
  const db = getDb();
  let updated = 0;
  let merged = 0;
  const errors: string[] = [];

  const run = db.transaction(() => {
    for (const item of items) {
      const company = findCompanyByNameFuzzy(item.name);
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
      if (item.limit_period_months !== undefined) updateData.limit_period_months = item.limit_period_months;
      if (item.cooldown_months !== undefined) updateData.cooldown_months = item.cooldown_months;
      if (item.funding_round !== undefined) updateData.funding_round = item.funding_round;

      // Handle chinese_affinity (full three-state)
      if (config.enableChineseAffinity) {
        if (item.chinese_affinity === true) {
          updateData.chinese_affinity = 1;
        } else if (item.chinese_affinity === false) {
          updateData.chinese_affinity = 0;
        } else if (item.chinese_affinity === null) {
          updateData.chinese_affinity = null;
        }
      }

      // Handle H1B sponsorship
      // Guard: do NOT auto-lock funded startups (Seed / Series A-D / Late Stage) into 'no_h1b' even if
      // sponsors_h1b===false. Funded startups frequently have legitimate sponsorship capacity but no
      // public H1B filing history yet, and a false negative auto-locks the candidate out of real
      // opportunities. For these, log the signal but leave application_strategy as-is for manual review.
      const fundingRound = (item.funding_round ?? company.funding_round ?? '').trim();
      const isFundedStartup = /^(Seed|Series [A-D]|Late Stage)$/i.test(fundingRound);

      if (item.sponsors_h1b === false) {
        if (isFundedStartup) {
          logOperation({
            operation: 'company_update',
            entity_type: 'company',
            entity_id: company.id,
            trigger: 'import',
            details: {
              field: 'application_strategy',
              from: company.application_strategy,
              to: company.application_strategy,
              reason: `Skipped auto-lock to no_h1b: funded startup (${fundingRound}) — manual review required`,
            },
          });
        } else {
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

      // Auto-merge pending duplicate companies with similar names
      const normalized = normalizeCompanyName(item.name);
      const duplicates = db.prepare(`
        SELECT * FROM companies
        WHERE id != ? AND info_status = 'pending'
        AND (name LIKE ? OR ? LIKE name || '%')
      `).all(company.id, `${normalized}%`, normalized) as Company[];

      for (const dup of duplicates) {
        db.prepare(`UPDATE jobs SET company_id = ? WHERE company_id = ?`).run(company.id, dup.id);
        db.prepare(`DELETE FROM companies WHERE id = ?`).run(dup.id);
        merged++;
        logOperation({
          operation: 'company_merge',
          entity_type: 'company',
          entity_id: dup.id,
          trigger: 'import',
          details: { merged_into: company.id, merged_name: dup.display_name },
        });
      }
    }
  });

  run();
  return { updated, merged, errors };
}
