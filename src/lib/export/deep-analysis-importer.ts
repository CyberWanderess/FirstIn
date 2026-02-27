import { getDb } from '@/lib/db';
import { findJobById, updateJob } from '@/lib/repositories/job-repository';
import { validateTransition } from '@/lib/status-machine';
import { logOperation } from '@/lib/repositories/operation-log-repository';
import type { JobStatus, ParseResult } from '@/types';

export interface DeepAnalysisItem {
  id: number;
  strengths: string[];
  concerns: string[];
  jd_mapping: Record<string, string>;
  recommendation: 'proceed' | 'mass_apply' | 'skip';
  analysis_summary: string;
}

export function parseDeepAnalysis(jsonText: string): ParseResult<DeepAnalysisItem> {
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

  const items: DeepAnalysisItem[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (typeof item.id !== 'number') {
      warnings.push(`Item ${i + 1}: missing or invalid "id" field`);
      continue;
    }
    if (!['proceed', 'mass_apply', 'skip'].includes(item.recommendation)) {
      warnings.push(`Item ${i + 1} (id=${item.id}): recommendation must be proceed/mass_apply/skip`);
      continue;
    }
    items.push({
      id: item.id,
      strengths: Array.isArray(item.strengths) ? item.strengths : [],
      concerns: Array.isArray(item.concerns) ? item.concerns : [],
      jd_mapping: item.jd_mapping && typeof item.jd_mapping === 'object' ? item.jd_mapping : {},
      recommendation: item.recommendation,
      analysis_summary: item.analysis_summary || '',
    });
  }

  return { items, warnings };
}

export function applyDeepAnalysis(items: DeepAnalysisItem[]): { updated: number; errors: string[] } {
  const db = getDb();
  let updated = 0;
  const errors: string[] = [];

  const run = db.transaction(() => {
    for (const item of items) {
      const job = findJobById(item.id);
      if (!job) {
        errors.push(`Job #${item.id} not found`);
        continue;
      }

      const targetStatus: JobStatus = item.recommendation === 'skip'
        ? 'archived_low_match'
        : 'analyzed'; // both 'proceed' and 'mass_apply' go to analyzed

      const validation = validateTransition(job.status as JobStatus, targetStatus);
      if (!validation.valid) {
        errors.push(`Job #${item.id}: ${validation.reason}`);
        continue;
      }

      const analysisData = {
        strengths: item.strengths,
        concerns: item.concerns,
        jd_mapping: item.jd_mapping,
        recommendation: item.recommendation,
        analysis_summary: item.analysis_summary,
      };

      updateJob(item.id, {
        deep_analysis: JSON.stringify(analysisData),
        status: targetStatus,
      });

      logOperation({
        operation: 'status_change',
        entity_type: 'job',
        entity_id: item.id,
        trigger: 'import',
        details: { from: job.status, to: targetStatus, recommendation: item.recommendation },
      });

      updated++;
    }
  });

  run();
  return { updated, errors };
}
