/**
 * Shared job processing pipeline for ATS source scripts.
 * Handles dedup → rules → insert for a batch of job candidates.
 */

import { checkDuplicate, hashContent } from '../../src/lib/dedup';
import { evaluateJob } from '../../src/lib/rule-engine';
import { findOrCreateCompany } from '../../src/lib/repositories/company-repository';
import { insertJob, listJobs } from '../../src/lib/repositories/job-repository';
import { listRules } from '../../src/lib/repositories/rule-repository';
import { getSetting } from '../../src/lib/repositories/settings-repository';
import { logOperation } from '../../src/lib/repositories/operation-log-repository';
import type { Job, JobInsert } from '../../src/types';

export interface ProcessResult {
  found: number;
  titleFiltered: number;
  locationFiltered: number;
  duplicates: number;
  filtered: number;
  inserted: number;
  failed: number;
  errors: string[];
}

export type JobCandidate = Omit<JobInsert, 'company_id'> & { company_name: string };

/**
 * Title filter: keep Program/Project Manager, Program/Project Management, Program/Project Lead roles,
 * and Product Manager roles that are explicitly AI/ML.
 */
export function matchesTitleFilter(title: string): boolean {
  const lower = title.toLowerCase();
  if (lower.includes('program manager')) return true;
  if (lower.includes('project manager')) return true;
  if (lower.includes('program management')) return true;
  if (lower.includes('project management')) return true;
  if (lower.includes('program lead')) return true;
  if (lower.includes('project lead')) return true;
  if (
    lower.includes('product manager') &&
    (lower.includes(' ai') || lower.includes('ai ') || lower.includes('-ai') ||
     lower.includes(' ml') || lower.includes('machine learning') || lower.includes('artificial intelligence'))
  ) return true;
  return false;
}

const US_LOCATION_KEYWORDS = [
  'remote', 'hybrid', 'in-office', 'on-site', 'onsite', 'united states', ' us,', ' us ', '(us)', ', us',
  'california', 'new york', 'washington', 'texas', 'massachusetts', 'illinois',
  'colorado', 'georgia', 'virginia', 'north carolina', 'florida', 'oregon',
  'utah', 'arizona', 'minnesota', 'michigan', 'ohio', 'pennsylvania',
  'maryland', 'new jersey', 'nevada', 'tennessee', 'indiana', 'wisconsin',
  'missouri', 'connecticut', 'oklahoma', 'kentucky', 'alabama', 'kansas',
  ', ca', ', ny', ', wa', ', tx', ', ma', ', il', ', co', ', ga',
  ', va', ', nc', ', fl', ', or', ', ut', ', az', ', mn', ', mi',
  ', oh', ', pa', ', md', ', nj', ', nv', ', tn', ', in', ', wi',
  ', mo', ', ct', ', ok', ', ky', ', al', ', ks', ', dc',
];

/**
 * Location filter: keep US-based or Remote jobs, drop non-US international locations.
 * Empty location array is kept (can't determine, default to include).
 */
export function matchesLocationFilter(locations: string[]): boolean {
  if (locations.length === 0) return true;
  return locations.some((loc) => {
    const lower = loc.toLowerCase();
    return US_LOCATION_KEYWORDS.some((kw) => lower.includes(kw));
  });
}

export function processJobs(
  candidates: JobCandidate[],
  sourceName: string,
  applyTitleFilter = false,
  applyLocationFilter = false,
): ProcessResult {
  const rules = listRules(true);
  const noH1bAction = getSetting('no_h1b_action', 'auto_exclude');
  const blockedAction = getSetting('blocked_action', 'auto_exclude');
  const jobNoVisaAction = getSetting('job_no_visa_action', 'auto_exclude');

  const { jobs: existingJobs } = listJobs({ limit: 10000, offset: 0 });
  const allExisting = [...existingJobs] as Job[];

  const result: ProcessResult = {
    found: candidates.length,
    titleFiltered: 0,
    locationFiltered: 0,
    duplicates: 0,
    filtered: 0,
    inserted: 0,
    failed: 0,
    errors: [],
  };

  let pipeline = candidates;

  if (applyTitleFilter) {
    pipeline = pipeline.filter((c) => {
      if (matchesTitleFilter(c.title)) return true;
      result.titleFiltered++;
      return false;
    });
  }

  if (applyLocationFilter) {
    pipeline = pipeline.filter((c) => {
      if (matchesLocationFilter(c.location)) return true;
      result.locationFiltered++;
      return false;
    });
  }

  for (const candidate of pipeline) {
    try {
      const company = findOrCreateCompany(candidate.company_name || 'Unknown');

      const dedupResult = checkDuplicate(
        { ...candidate, company_id: company.id },
        allExisting,
      );

      if (dedupResult.isDuplicate) {
        result.duplicates++;
        continue;
      }

      const ruleResult = evaluateJob(
        { ...candidate, company_id: company.id, company: company.display_name },
        rules,
        company,
        { noH1bAction, blockedAction, jobNoVisaAction },
      );

      if (ruleResult.action === 'exclude') {
        const inserted = insertJob({
          ...candidate,
          company_id: company.id,
          status: 'archived_filtered',
          notes: `Filtered: ${ruleResult.reason}`,
          jd_full_text: null,
          jd_fetch_status: 'pending',
          jd_content_hash: null,
        });
        allExisting.push(inserted as unknown as Job);
        result.filtered++;
        continue;
      }

      const jdText = candidate.jd_full_text ?? null;
      const inserted = insertJob({
        ...candidate,
        company_id: company.id,
        jd_content_hash: jdText ? hashContent(jdText) : null,
        jd_fetch_status: jdText ? 'success' : 'pending',
        status: 'pending_eval',
      });

      allExisting.push(inserted as unknown as Job);
      result.inserted++;
    } catch (e) {
      result.failed++;
      result.errors.push(`${candidate.title} @ ${candidate.company_name}: ${(e as Error).message}`);
    }
  }

  logOperation({
    operation: 'import',
    entity_type: 'batch',
    trigger: 'system',
    details: {
      source: sourceName,
      found: result.found,
      duplicates: result.duplicates,
      filtered: result.filtered,
      inserted: result.inserted,
      failed: result.failed,
    },
  });

  return result;
}

export function printResult(source: string, result: ProcessResult): void {
  console.log(`\n[${source}] Done:`);
  console.log(`  Found:           ${result.found}`);
  if (result.titleFiltered > 0) {
    console.log(`  Title filter:    -${result.titleFiltered} (not PM/TPM)`);
  }
  if (result.locationFiltered > 0) {
    console.log(`  Location filter: -${result.locationFiltered} (non-US)`);
  }
  console.log(`  Duplicates:      ${result.duplicates}`);
  console.log(`  Rule filtered:   ${result.filtered}`);
  console.log(`  Inserted:        ${result.inserted}`);
  if (result.failed > 0) {
    console.log(`  Failed:          ${result.failed}`);
    for (const err of result.errors) {
      console.error(`    - ${err}`);
    }
  }
}
