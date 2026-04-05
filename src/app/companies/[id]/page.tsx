import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuthPage } from '@/lib/auth';
import { runWithUser } from '@/lib/db';
import { ensureInitialized } from '@/lib/init';
import { findCompanyById } from '@/lib/repositories/company-repository';
import { listJobs } from '@/lib/repositories/job-repository';
import { getEntityHistory } from '@/lib/repositories/operation-log-repository';
import { StatusBadge } from '@/components/status-badge';
import { StatusActions } from '@/components/status-actions';
import { CompanyStrategyEditor } from './strategy-editor';
import { TrimExcess } from './trim-excess';
import type { JobStatus } from '@/types';

export const dynamic = 'force-dynamic';

const STRATEGY_COLORS: Record<string, string> = {
  open: 'bg-green-100 text-green-800',
  cautious: 'bg-yellow-100 text-yellow-800',
  blocked: 'bg-red-100 text-red-800',
  no_h1b: 'bg-zinc-100 text-zinc-600',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

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

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuthPage();
  const { id } = await params;

  return runWithUser(user.id, () => {
  ensureInitialized();
  const company = findCompanyById(parseInt(id));
  if (!company) notFound();

  const { jobs } = listJobs({ companyId: company.id, limit: 100, offset: 0 });
  const history = getEntityHistory('company', company.id, 50);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/companies" className="text-sm text-zinc-500 hover:text-zinc-700">
        &larr; Back to Companies
      </Link>

      {/* Header */}
      <div className="bg-white border border-zinc-200 rounded-lg p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">{company.display_name}</h1>
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${STRATEGY_COLORS[company.application_strategy] || 'bg-zinc-100 text-zinc-600'}`}>
                {company.application_strategy}
              </span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${company.info_status === 'complete' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                {company.info_status}
              </span>
            </div>
          </div>
          {company.website && (
            <a
              href={company.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline shrink-0"
            >
              Website
            </a>
          )}
        </div>
      </div>

      {/* Info section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-zinc-200 rounded-lg p-6 space-y-4">
          <h2 className="font-semibold text-zinc-900">Company Info</h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-zinc-500">Industry</dt>
              <dd className="text-zinc-900">{company.industry || 'Not set'}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Size</dt>
              <dd className="text-zinc-900">{company.size || 'Not set'}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Description</dt>
              <dd className="text-zinc-900">{company.description || 'Not set'}</dd>
            </div>
            {company.ai_summary && (
              <div>
                <dt className="text-zinc-500">AI Summary</dt>
                <dd className="text-zinc-700 whitespace-pre-wrap">{company.ai_summary}</dd>
              </div>
            )}
            {company.notes && (
              <div>
                <dt className="text-zinc-500">Notes</dt>
                <dd className="text-zinc-700 whitespace-pre-wrap">{company.notes}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Strategy editor */}
        <div className="bg-white border border-zinc-200 rounded-lg p-6">
          <h2 className="font-semibold text-zinc-900 mb-4">Application Strategy</h2>
          <CompanyStrategyEditor
            companyId={company.id}
            currentStrategy={company.application_strategy}
            currentReason={company.strategy_reason || ''}
            currentLimit={company.application_limit}
          />
        </div>
      </div>

      {/* Jobs table */}
      <div className="bg-white border border-zinc-200 rounded-lg">
        <div className="px-6 py-3 border-b border-zinc-200 flex items-center justify-between">
          <h2 className="font-semibold text-zinc-900">
            Jobs ({jobs.length})
          </h2>
          {company.application_limit != null && company.application_limit > 0 && (
            <TrimExcess
              companyId={company.id}
              applicationLimit={company.application_limit}
              limitPeriodMonths={company.limit_period_months}
              jobs={jobs.map(j => ({
                id: j.id,
                title: j.title,
                status: j.status,
                score_success: j.score_success ?? null,
                score: j.score,
              }))}
            />
          )}
        </div>
        {jobs.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-zinc-400">
            No jobs at this company
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Title</th>
                <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Score</th>
                <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Salary</th>
                <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/jobs/${job.id}`}
                      className="text-zinc-900 font-medium hover:underline"
                    >
                      {job.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={job.status} />
                    <StatusActions jobId={job.id} currentStatus={job.status as JobStatus} variant="compact" />
                  </td>
                  <td className="px-4 py-2.5 text-zinc-600">
                    {job.score !== null ? job.score : '--'}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-600">
                    {formatSalary(job.salary_min, job.salary_max)}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500">
                    {formatDate(job.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* History */}
      <div className="bg-white border border-zinc-200 rounded-lg">
        <div className="px-6 py-3 border-b border-zinc-200">
          <h2 className="font-semibold text-zinc-900">Change History</h2>
        </div>
        <div className="divide-y divide-zinc-100">
          {history.length === 0 && (
            <div className="px-6 py-8 text-center text-sm text-zinc-400">
              No history yet
            </div>
          )}
          {history.map((entry) => (
            <div key={entry.id} className="px-6 py-3 flex items-center gap-3 text-sm">
              <span className="text-zinc-400 w-40 shrink-0">
                {new Date(entry.created_at).toLocaleString()}
              </span>
              <span className="inline-block px-1.5 py-0.5 text-xs rounded bg-zinc-100 text-zinc-600">
                {entry.operation}
              </span>
              <span className="text-zinc-600 truncate">
                {formatHistoryDetails(entry.details)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>);
  });
}

function formatHistoryDetails(details: Record<string, unknown>): string {
  if (details.field !== undefined) {
    return `${details.field}: ${details.from || '(none)'} -> ${details.to}`;
  }
  if (details.from !== undefined && details.to !== undefined) {
    return `${details.from || '(none)'} -> ${details.to}`;
  }
  return JSON.stringify(details);
}
