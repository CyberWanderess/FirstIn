import Link from 'next/link';
import { ensureInitialized } from '@/lib/init';
import { config } from '@/lib/config';
import { listJobs } from '@/lib/repositories/job-repository';
import { StatusBadge } from '@/components/status-badge';
import { JOB_STATUSES } from '@/types';

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
  ensureInitialized();
  const params = await searchParams;

  const status = params.status || undefined;
  const q = params.q || undefined;
  const sort = params.sort || 'created_at';
  const order = params.order || 'DESC';
  const page = parseInt(params.page || '1');
  const limit = 50;
  const offset = (page - 1) * limit;

  const { jobs, total } = listJobs({ status, q, sort, order, limit, offset });
  const totalPages = Math.ceil(total / limit);

  function buildUrl(overrides: Record<string, string>) {
    const base: Record<string, string> = {};
    if (status) base.status = status;
    if (q) base.q = q;
    if (sort !== 'created_at') base.sort = sort;
    if (order !== 'DESC') base.order = order;
    const merged = { ...base, ...overrides };
    const qs = new URLSearchParams(merged).toString();
    return `/jobs${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white border border-zinc-200 rounded-lg p-4">
        <form className="flex flex-wrap items-center gap-3">
          <select
            name="status"
            defaultValue={status || ''}
            className="border border-zinc-300 rounded-md px-3 py-1.5 text-sm bg-white text-zinc-900"
          >
            <option value="">All statuses</option>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          <input
            name="q"
            type="text"
            placeholder="Search jobs or companies..."
            defaultValue={q || ''}
            className="border border-zinc-300 rounded-md px-3 py-1.5 text-sm flex-1 min-w-48"
          />

          <select
            name="sort"
            defaultValue={sort}
            className="border border-zinc-300 rounded-md px-3 py-1.5 text-sm bg-white text-zinc-900"
          >
            <option value="created_at">Date Added</option>
            <option value="updated_at">Last Updated</option>
            <option value="score">Score</option>
            <option value="salary_max">Salary</option>
            <option value="status_changed_at">Status Changed</option>
          </select>

          <select
            name="order"
            defaultValue={order}
            className="border border-zinc-300 rounded-md px-3 py-1.5 text-sm bg-white text-zinc-900"
          >
            <option value="DESC">Desc</option>
            <option value="ASC">Asc</option>
          </select>

          <button
            type="submit"
            className="px-4 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 transition-colors"
          >
            Filter
          </button>

          {(status || q) && (
            <Link
              href="/jobs"
              className="px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-700"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* Results count */}
      <div className="text-sm text-zinc-500">
        {total} job{total !== 1 ? 's' : ''} found
        {status && <span> with status &quot;{status.replace(/_/g, ' ')}&quot;</span>}
        {q && <span> matching &quot;{q}&quot;</span>}
      </div>

      {/* Table */}
      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Company</th>
              <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Title</th>
              <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Score</th>
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
                    </Link>
                    {config.enableChineseAffinity && job.chinese_affinity ? (
                      <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-blue-100 text-blue-700 shrink-0">中</span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/jobs/${job.id}`}
                    className="text-zinc-900 font-medium hover:underline"
                  >
                    {job.title}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-zinc-600">
                  {job.score !== null ? job.score : '--'}
                </td>
                <td className="px-4 py-2.5 text-zinc-600">
                  {formatSalary(job.salary_min, job.salary_max)}
                </td>
                <td className="px-4 py-2.5 text-zinc-600">
                  {job.location.length > 0 ? job.location.join(', ') : '--'}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={job.status} />
                    {job.visa_sponsorship === 'no' && (
                      <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-red-100 text-red-700 shrink-0">No Visa</span>
                    )}
                    {job.visa_sponsorship === 'yes' && (
                      <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-green-100 text-green-700 shrink-0">Visa OK</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-zinc-400 max-w-48 truncate" title={[job.score_reason, job.notes].filter(Boolean).join('\n---\n') || ''}>
                  {job.score_reason || job.notes || '--'}
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
    </div>
  );
}
