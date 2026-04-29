import {
  extractFromState,
  findTitle,
  findCompany,
  findLocation,
  findDescription,
  findSalary,
  findPostedDate,
  findSourceId,
  findApplyUrl,
} from './selectors';
import type { JobPayload } from '../../shared/types';

/**
 * Extract job data from an Indeed job detail page (/viewjob?jk=...).
 * Returns null if critical fields (title, company) cannot be found.
 *
 * Strategy: extract structured data from window._initialData first,
 * then fill remaining fields (especially JD text) from DOM.
 */
export async function extractJobFromDetail(): Promise<JobPayload | null> {
  // Try JS state first — more stable than DOM selectors
  const state = extractFromState();

  const title       = state?.title        ?? findTitle();
  const companyName = state?.company_name ?? findCompany();

  console.log('[FirstIn/Indeed] extracting:', { title, company: companyName });

  if (!title || !companyName) {
    console.log('[FirstIn/Indeed] could not extract title or company');
    return null;
  }

  // Description: prefer state HTML-stripped text (more complete), fall back to DOM
  const description = state?.jd_full_text ?? findDescription();

  const { location, workMode } = state?.location
    ? { location: state.location, workMode: state.work_mode ?? null }
    : findLocation();

  const salary   = findSalary(state ?? undefined);
  const postedAt = state?.posted_at ?? findPostedDate();
  const sourceId = state?.source_id ?? findSourceId();
  const applyUrl = findApplyUrl();

  return {
    title:           title.trim(),
    company_name:    companyName.trim(),
    location:        location ? [location] : [],
    salary_min:      salary?.min,
    salary_max:      salary?.max,
    salary_currency: salary?.currency,
    work_mode:       workMode ?? undefined,
    jd_url:          window.location.href,
    apply_url:       applyUrl ?? window.location.href,
    jd_full_text:    description ?? undefined,
    source:          'indeed',
    source_id:       sourceId ?? undefined,
    posted_at:       postedAt ?? undefined,
  };
}
