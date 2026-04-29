import Link from 'next/link';
import { requireAuthPage } from '@/lib/auth';
import { runWithUser } from '@/lib/db';
import { ensureInitialized } from '@/lib/init';
import { config } from '@/lib/config';
import { listJobs } from '@/lib/repositories/job-repository';
import { StatusBadge } from '@/components/status-badge';
import { ExpandableReason } from '@/components/expandable-reason';
import { JobFilterBar } from '@/components/job-filter-bar';
import { StatusActions } from '@/components/status-actions';
import { DedupPanel } from '@/components/dedup-panel';
import type { JobStatus } from '@/types';

export const dynamic = 'force-dynamic';

const STRATEGY_DOT: Record<string, string> = {
  open: 'bg-green-500',
  cautious: 'bg-yellow-500',
  blocked: 'bg-red-500',
  no_h1b: 'bg-zinc-400',
};

function formatSalary(min: number | null, max: number | null): string {
  if (!min && !max) return '--';
  const fmt = (n: number) => {
    if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
    return `$${n}`;
  };
  if (min && max) return `${fmt(min)} - ${fmt(max)}`;
  if (max) return `up to ${fmt(max)}`;
  return `from ${fmt(min!)}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const user = await requireAuthPage();
  const params = await searchParams;

  return runWithUser(user.id, () => {
  ensureInitialized();
  const DEFAULT_STATUSES = 'pending_eval,pending_deep_analysis,ready_to_apply_tailored,ready_to_apply';
  const rawStatus = params.status ?? DEFAULT_STATUSES;
  const status = rawStatus === 'all' ? undefined : rawStatus;
  const q = params.q || undefined;
  const isReadyToApply = status === 'ready_to_apply';
  const sort = params.sort || (isReadyToApply ? 'score_success' : 'created_at');
  const order = params.order || 'DESC';
  const sort2 = params.sort2 || (isReadyToApply && !params.sort ? 'score' : '');
  const order2 = params.order2 || 'DESC';
  const sort3 = params.sort3 || '';
  const order3 = params.order3 || 'DESC';
  const page = parseInt(params.page || '1');
  const limit = 50;
  const offset = (page - 1) * limit;

  const tags = params.tags || undefined;
  const excludeTags = params.exclude_tags || undefined;
  const ageParam = params.age ?? '7';
  const showAll = ageParam === 'all';
  const maxAgeDays = showAll ? undefined : (parseInt(ageParam) || 7);
  const qaFlaggedOnly = params.qaFlagged === '1';
  const { jobs, total } = listJobs({
    status, q, sort, order,
    sort2: sort2 || undefined,
    order2: order2 || undefined,
    sort3: sort3 || undefined,
    order3: order3 || undefined,
    tags,
    excludeTags,
    excludeExpired: !showAll,
    maxAgeDays,
    qaFlaggedOnly,
    limit, offset,
  });
  const totalPages = Math.ceil(total / limit);

  function buildUrl(overrides: Record<string, string>) {
    const base: Record<string, string> = {};
    if (status) base.status = status;
    if (q) base.q = q;
    if (sort !== 'created_at') base.sort = sort;
    if (order !== 'DESC') base.order = order;
    if (sort2) base.sort2 = sort2;
    if (sort2 && order2 !== 'DESC') base.order2 = order2;
    if (sort3) base.sort3 = sort3;
    if (sort3 && order3 !== 'DESC') base.order3 = order3;
    if (ageParam !== '7') base.age = ageParam;
    const merged = { ...base, ...overrides };
    // Remove empty values
    for (const [k, v] of Object.entries(merged)) {
      if (!v) delete merged[k];
    }
    const qs = new URLSearchParams(merged).toString();
    return `/jobs${qs ? `?${qs}` : ''}`;
  }

  const AGE_OPTIONS = [
    { label: '7d', value: '7' },
    { label: '14d', value: '14' },
    { label: '30d', value: '30' },
    { label: 'All', value: 'all' },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <JobFilterBar
        initialStatus={status}
        initialQ={q}
        initialSort={sort}
        initialOrder={order}
        initialSort2={sort2}
        initialOrder2={order2}
        initialSort3={sort3}
        initialOrder3={order3}
        initialTags={tags}
        initialExcludeTags={excludeTags}
        initialQaFlaggedOnly={qaFlaggedOnly}
      />

      {/* Results count */}
      <div className="flex items-center justify-between text-sm text-zinc-500">
        <div>
          {total} job{total !== 1 ? 's' : ''} found
          {status && <span> with status &quot;{status.replace(/_/g, ' ')}&quot;</span>}
          {q && <span> matching &quot;{q}&quot;</span>}
        </div>
        <div className="flex items-center gap-2">
          <DedupPanel />
          <div className="flex items-center rounded border border-zinc-200 overflow-hidden text-xs">
            {AGE_OPTIONS.map((opt) => (
              <Link
                key={opt.value}
                href={buildUrl({ age: opt.value === '7' ? '' : opt.value })}
                className={`px-2.5 py-1 transition-colors ${
                  ageParam === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-500 hover:bg-zinc-50'
                }`}
              >
                {opt.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Company</th>
              <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Title</th>
              <th className="text-left px-4 py-2.5 font-medium text-zinc-600" title="Success Rate / Attractiveness">Score</th>
              <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Salary</th>
              <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Location</th>
              <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Status</th>
              <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Reason / Notes</th>
              <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {jobs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-zinc-400">
                  No jobs found
                </td>
              </tr>
            )}
            {jobs.map((job) => (
              <tr key={job.id} className="hover:bg-zinc-50 transition-colors">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${STRATEGY_DOT[job.application_strategy] || 'bg-zinc-300'}`}
                      title={job.application_strategy}
                    />
                    <Link
                      href={`/companies/${job.company_id}`}
                      className="text-zinc-700 hover:text-zinc-900"
                    >
                      {job.company_display_name}
                      {job.company_total_jobs != null && job.company_total_jobs > 1 && (
                        <span className="text-zinc-400 text-xs ml-0.5">({job.company_active_jobs}/{job.company_total_jobs})</span>
                      )}
                    </Link>
                    {config.enableChineseAffinity && job.chinese_affinity ? (
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200 shrink-0">Affinity</span>
                    ) : null}
                    {job.cooldown_months != null && job.cooldown_months > 0 && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">
                        {job.cooldown_months}mo CD
                      </span>
                    )}
                    {job.application_limit != null && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">
                        {job.application_limit}/{(job.limit_period_months ?? 12) === 1 ? 'mo' : (job.limit_period_months ?? 12) === 12 ? 'yr' : `${job.limit_period_months}mo`}
                      </span>
                    )}
                    {job.funding_round && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-200 shrink-0">
                        {job.funding_round}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/jobs/${job.id}`}
                      className="text-zinc-900 font-medium hover:underline"
                    >
                      {job.title}
                    </Link>
                    {(job.apply_url || job.jd_url) && (
                      <a
                        href={job.apply_url || job.jd_url!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-zinc-400 hover:text-blue-600 shrink-0"
                        title="View original posting"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-zinc-600">
                  {job.score_success !== null || job.score !== null ? (
                    <>
                      <span className="font-medium">{job.score_success ?? '--'}</span>
                      <span className="text-zinc-400 text-xs"> / {job.score ?? '--'}</span>
                    </>
                  ) : '--'}
                </td>
                <td className="px-4 py-2.5 text-zinc-600">
                  {formatSalary(job.salary_min, job.salary_max)}
                </td>
                <td className="px-4 py-2.5 text-zinc-600 max-w-28 truncate" title={job.location.join(', ')}>
                  {job.location.length > 0 ? job.location.join(', ') : '--'}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={job.status} />
                    {job.qa_flagged === 1 && (
                      <span
                        title={job.qa_notes ?? 'QA agent flagged this evaluation'}
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-300 shrink-0"
                      >QA</span>
                    )}
                    {job.visa_sponsorship === 'no' && (
                      <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-red-100 text-red-700 shrink-0">No Visa</span>
                    )}
                    {job.visa_sponsorship === 'yes' && (
                      <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-green-100 text-green-700 shrink-0">Visa OK</span>
                    )}
                    {job.resume_tailored && (
                      <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-indigo-100 text-indigo-700 shrink-0">Tailored</span>
                    )}
                    {job.has_referral && (
                      <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">内推</span>
                    )}
                  </div>
                  <StatusActions jobId={job.id} currentStatus={job.status as JobStatus} variant="compact" />
                </td>
                <td className="px-4 py-2.5">
                  <ExpandableReason
                    scoreReason={job.score_reason}
                    notes={job.notes}
                    scoreTags={job.score_tags}
                  />
                </td>
                <td className="px-4 py-2.5 text-zinc-500">
                  {formatDate(job.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-zinc-500">
            Page {page} of {totalPages}
          </div>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildUrl({ page: String(page - 1) })}
                className="px-3 py-1.5 text-sm border border-zinc-300 rounded-md hover:bg-zinc-50 transition-colors"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildUrl({ page: String(page + 1) })}
                className="px-3 py-1.5 text-sm border border-zinc-300 rounded-md hover:bg-zinc-50 transition-colors"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>);
  });
}
