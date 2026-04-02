import { findTitle, findCompany, expandDescription, findDescription, findLocationMeta, findSalary, findPostedDate } from './selectors';
import type { JobPayload } from '../../shared/types';

/**
 * Extract job data from LinkedIn job detail page.
 * Returns null if critical fields (title, company) cannot be found.
 */
export async function extractJobFromDetail(): Promise<JobPayload | null> {
  const title = findTitle();
  const company = findCompany();

  console.log('[FirstIn] extracting:', { title, company });

  if (!title || !company) return null;

  // Expand truncated JD before extracting — try twice with increasing delay
  expandDescription();
  await new Promise(r => setTimeout(r, 500));
  // Check if still truncated (text ends with "… more" pattern)
  let description = findDescription();
  if (description && /…\s*more\s*$/i.test(description)) {
    expandDescription();
    await new Promise(r => setTimeout(r, 500));
    description = findDescription();
  }
  const { location, workMode } = findLocationMeta();
  const salary = findSalary();
  const postedAt = findPostedDate();
  const sourceId = extractSourceId();

  return {
    title: title.trim(),
    company_name: company.trim(),
    location: location ? [location] : [],
    salary_min: salary?.min,
    salary_max: salary?.max,
    salary_currency: salary?.currency,
    work_mode: workMode,
    jd_url: window.location.href,
    apply_url: window.location.href,
    jd_full_text: description,
    source: 'linkedin',
    source_id: sourceId,
    posted_at: postedAt,
  };
}

function extractSourceId(): string | null {
  // /jobs/view/1234567890/
  const pathMatch = window.location.pathname.match(/\/jobs\/view\/(\d+)/);
  if (pathMatch) return pathMatch[1];

  // /jobs/search/?currentJobId=1234567890
  const params = new URLSearchParams(window.location.search);
  return params.get('currentJobId');
}
