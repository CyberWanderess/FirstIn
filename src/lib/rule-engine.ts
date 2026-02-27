import type { FilterRule, Company, JobInsert, RuleResult } from '@/types';

/**
 * Pure function: evaluates a job against company strategy + filter rules.
 * No database access — caller provides all data.
 */
export function evaluateJob(
  job: JobInsert & { company?: string; visa_sponsorship?: string | null },
  rules: FilterRule[],
  company?: Pick<Company, 'application_strategy' | 'strategy_reason' | 'display_name' | 'chinese_affinity'> | null,
  options?: { noH1bAction?: string; blockedAction?: string; jobNoVisaAction?: string },
): RuleResult {
  const matched: RuleResult['matchedRules'] = [];

  // 1. Company strategy check (priority over rules)
  if (company) {
    const noH1bAction = options?.noH1bAction ?? 'auto_exclude';
    const blockedAction = options?.blockedAction ?? 'auto_exclude';

    if (company.application_strategy === 'no_h1b') {
      if (noH1bAction === 'auto_exclude') {
        return {
          action: 'exclude',
          matchedRules: [{ id: 0, name: `Company "${company.display_name}" does not sponsor H1B`, action: 'exclude' }],
          reason: company.strategy_reason || 'Company does not sponsor H1B',
        };
      }
      matched.push({ id: 0, name: `Company "${company.display_name}" no_h1b (warn)`, action: 'flag' });
    }

    if (company.application_strategy === 'blocked') {
      if (blockedAction === 'auto_exclude') {
        return {
          action: 'exclude',
          matchedRules: [{ id: 0, name: `Company "${company.display_name}" is blocked`, action: 'exclude' }],
          reason: company.strategy_reason || 'Company is blocked for this search cycle',
        };
      }
      matched.push({ id: 0, name: `Company "${company.display_name}" blocked (warn)`, action: 'flag' });
    }

    if (company.application_strategy === 'cautious') {
      matched.push({ id: 0, name: `Company "${company.display_name}" requires caution`, action: 'flag' });
    }
  }

  // 2. Job-level visa sponsorship check
  if (job.visa_sponsorship === 'no') {
    const jobNoVisaAction = options?.jobNoVisaAction ?? 'auto_exclude';
    if (jobNoVisaAction === 'auto_exclude') {
      return {
        action: 'exclude',
        matchedRules: [{ id: 0, name: 'Job does not sponsor visa', action: 'exclude' }],
        reason: 'Job explicitly does not offer visa sponsorship',
      };
    }
    matched.push({ id: 0, name: 'Job does not sponsor visa (warn)', action: 'flag' });
  }

  // 3. Evaluate filter rules (sorted by priority descending)
  const sorted = [...rules]
    .filter((r) => r.enabled)
    .sort((a, b) => b.priority - a.priority);

  let hasInclude = false;
  let hasFlag = false;
  let protectPriority = -1; // highest priority of matched protect rules

  // Chinese-affinity company: inject high-priority protect
  if (company?.chinese_affinity) {
    matched.push({ id: 0, name: `Company "${company.display_name}" is Chinese-affinity (protected)`, action: 'protect' });
    protectPriority = 100;
  }

  for (const rule of sorted) {
    if (matchesRule(job, rule)) {
      matched.push({ id: rule.id, name: rule.name, action: rule.action });
      if (rule.action === 'protect' && rule.priority > protectPriority) {
        protectPriority = rule.priority;
      }
      if (rule.action === 'include') hasInclude = true;
      if (rule.action === 'flag') hasFlag = true;
    }
  }

  // 3. Determine final action
  // Check excludes, but skip any that have lower priority than a matched protect rule
  const activeExclude = matched.find(
    (r) => r.action === 'exclude' && (protectPriority < 0 || r.id === 0 || getPriority(r.id, sorted) > protectPriority),
  );
  if (activeExclude) {
    return { action: 'exclude', matchedRules: matched, reason: activeExclude.name };
  }
  if (hasInclude) return { action: 'include', matchedRules: matched };
  if (hasFlag || matched.length > 0) return { action: 'flag', matchedRules: matched };
  return { action: 'pass', matchedRules: [] };
}

function getPriority(ruleId: number, rules: FilterRule[]): number {
  const rule = rules.find((r) => r.id === ruleId);
  return rule?.priority ?? 0;
}

function getFieldValue(job: JobInsert & { company?: string }, field: string): unknown {
  switch (field) {
    case 'title': return job.title;
    case 'company': return job.company_name ?? job.company ?? '';
    case 'location': return job.location;
    case 'salary_min': return job.salary_min;
    case 'salary_max': return job.salary_max;
    case 'work_mode': return job.work_mode;
    case 'commitment': return job.commitment;
    case 'source': return job.source;
    case 'jd_full_text': return job.jd_full_text;
    default: return undefined;
  }
}

function matchesRule(job: JobInsert & { company?: string }, rule: FilterRule): boolean {
  const fieldValue = getFieldValue(job, rule.field);
  if (fieldValue === undefined || fieldValue === null) return false;

  const ruleValue = rule.value;

  switch (rule.operator) {
    case 'contains':
      return String(fieldValue).toLowerCase().includes(ruleValue.toLowerCase());

    case 'not_contains':
      return !String(fieldValue).toLowerCase().includes(ruleValue.toLowerCase());

    case 'regex':
      try {
        return new RegExp(ruleValue, 'i').test(String(fieldValue));
      } catch {
        return false;
      }

    case 'lt':
      return typeof fieldValue === 'number' && fieldValue < parseFloat(ruleValue);

    case 'gt':
      return typeof fieldValue === 'number' && fieldValue > parseFloat(ruleValue);

    case 'eq':
      return String(fieldValue) === ruleValue;

    case 'in': {
      const list = ruleValue.split(',').map((s) => s.trim().toLowerCase());
      return list.includes(String(fieldValue).toLowerCase().trim());
    }

    case 'not_in': {
      const list = ruleValue.split(',').map((s) => s.trim().toLowerCase());
      return !list.includes(String(fieldValue).toLowerCase().trim());
    }

    case 'any_in': {
      // For array fields (e.g. location): any element in field matches any item in rule value
      const ruleItems = ruleValue.split(',').map((s) => s.trim().toLowerCase());
      if (Array.isArray(fieldValue)) {
        return fieldValue.some((v) => ruleItems.includes(String(v).toLowerCase().trim()));
      }
      // Fallback for scalar: treat as 'in'
      return ruleItems.includes(String(fieldValue).toLowerCase().trim());
    }

    default:
      return false;
  }
}
