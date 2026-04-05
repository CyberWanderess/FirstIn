import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuthPage } from '@/lib/auth';
import { runWithUser } from '@/lib/db';
import { ensureInitialized } from '@/lib/init';
import { findJobById } from '@/lib/repositories/job-repository';
import { getEntityHistory } from '@/lib/repositories/operation-log-repository';
import { StatusBadge } from '@/components/status-badge';
import { StatusActions } from '@/components/status-actions';
import { JobNotesEditor } from './notes-editor';
import type { JobStatus } from '@/types';

export const dynamic = 'force-dynamic';

const STRATEGY_COLORS: Record<string, string> = {
  open: 'text-green-700 bg-green-50 border-green-200',
  cautious: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  blocked: 'text-red-700 bg-red-50 border-red-200',
  no_h1b: 'text-zinc-600 bg-zinc-50 border-zinc-200',
};

function formatSalary(min: number | null, max: number | null): string {
  if (!min && !max) return 'Not specified';
  const fmt = (n: number) => {
    if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
    return `$${n}`;
  };
  if (min && max) return `${fmt(min)} - ${fmt(max)}`;
  if (max) return `Up to ${fmt(max)}`;
  return `From ${fmt(min!)}`;
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuthPage();
  const { id } = await params;

  return runWithUser(user.id, () => {
  ensureInitialized();
  const job = findJobById(parseInt(id));
  if (!job) notFound();

  const history = getEntityHistory('job', job.id, 50);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/jobs" className="text-sm text-zinc-500 hover:text-zinc-700">
        &larr; Back to Jobs
      </Link>

      {/* Header */}
      <div className="bg-white border border-zinc-200 rounded-lg p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">{job.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-zinc-500">at</span>
              <Link
                href={`/companies/${job.company_id}`}
                className="text-zinc-700 font-medium hover:underline"
              >
                {job.company_display_name}
              </Link>
              <span
                className={`text-xs px-2 py-0.5 rounded border ${STRATEGY_COLORS[job.application_strategy] || 'text-zinc-600 bg-zinc-50 border-zinc-200'}`}
              >
                {job.application_strategy}
              </span>
            </div>
          </div>
          {(job.apply_url || job.jd_url) && (
            <a
              href={job.apply_url || job.jd_url!}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline shrink-0"
            >
              View Original
            </a>
          )}
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <InfoCard label="Location" value={job.location.length > 0 ? job.location.join(', ') : 'Not specified'} />
        <InfoCard label="Salary" value={formatSalary(job.salary_min, job.salary_max)} />
        <InfoCard label="Work Mode" value={job.work_mode || 'Not specified'} />
        <InfoCard label="Commitment" value={job.commitment || 'Not specified'} />
        <InfoCard
          label="Success Rate"
          value={job.score_success !== null ? String(job.score_success) : 'Not scored'}
          subtitle={job.score_reason || undefined}
        />
        <InfoCard
          label="Attractiveness"
          value={job.score !== null ? String(job.score) : 'Not scored'}
        />
      </div>

      {/* Status section */}
      <div className="bg-white border border-zinc-200 rounded-lg p-6">
        <h2 className="font-semibold text-zinc-900 mb-3">Status</h2>
        <div className="flex items-center gap-4 flex-wrap">
          <StatusBadge status={job.status} />
          <StatusActions jobId={job.id} currentStatus={job.status as JobStatus} variant="expanded" />
        </div>
      </div>

      {/* Job Description */}
      <div className="bg-white border border-zinc-200 rounded-lg p-6">
        <h2 className="font-semibold text-zinc-900 mb-3">Job Description</h2>
        {job.jd_full_text ? (
          <div className="prose prose-sm max-w-none text-zinc-700 whitespace-pre-wrap">
            {job.jd_full_text}
          </div>
        ) : (
          <p className="text-sm text-zinc-400 italic">
            Not fetched (status: {job.jd_fetch_status})
          </p>
        )}
      </div>

      {/* Deep Analysis */}
      {job.deep_analysis && (() => {
        let da;
        try { da = JSON.parse(job.deep_analysis); } catch { return null; }
        return (
          <div className="bg-white border border-zinc-200 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-zinc-900">Deep Analysis</h2>
              <span className={`text-xs px-2 py-0.5 rounded border ${
                da.recommendation === 'proceed'
                  ? 'text-green-700 bg-green-50 border-green-200'
                  : 'text-red-700 bg-red-50 border-red-200'
              }`}>
                {da.recommendation}
              </span>
            </div>

            {da.analysis_summary && (
              <p className="text-sm text-zinc-700">{da.analysis_summary}</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {da.strengths?.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-green-800 mb-2">Strengths</h3>
                  <ul className="list-disc list-inside text-sm text-zinc-700 space-y-1">
                    {da.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}
              {da.concerns?.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-red-800 mb-2">Concerns</h3>
                  <ul className="list-disc list-inside text-sm text-zinc-700 space-y-1">
                    {da.concerns.map((s: string, i: number) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}
            </div>

            {da.jd_mapping && Object.keys(da.jd_mapping).length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-zinc-800 mb-2">JD-Resume Mapping</h3>
                <div className="space-y-1.5">
                  {Object.entries(da.jd_mapping).map(([req, match]) => (
                    <div key={req} className="text-sm">
                      <span className="font-medium text-zinc-700">{req}:</span>{' '}
                      <span className="text-zinc-600">{match as string}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Notes */}
      <div className="bg-white border border-zinc-200 rounded-lg p-6">
        <h2 className="font-semibold text-zinc-900 mb-3">Notes</h2>
        <JobNotesEditor jobId={job.id} initialNotes={job.notes || ''} />
      </div>

      {/* History */}
      <div className="bg-white border border-zinc-200 rounded-lg">
        <div className="px-6 py-3 border-b border-zinc-200">
          <h2 className="font-semibold text-zinc-900">History</h2>
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

function InfoCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-4">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className="text-sm font-medium text-zinc-900">{value}</div>
      {subtitle && <div className="text-xs text-zinc-400 mt-1 truncate">{subtitle}</div>}
    </div>
  );
}

function formatHistoryDetails(details: Record<string, unknown>): string {
  if (details.from !== undefined && details.to !== undefined) {
    let text = `${details.from || '(none)'} -> ${details.to}`;
    if (details.source === 'mbox_import') {
      text += ` (via mbox${details.rejection_date ? `, ${details.rejection_date}` : ''})`;
    } else if (details.source === 'rejection_email_scan') {
      text += ' (via email scan)';
    }
    return text;
  }
  if (details.score !== undefined) {
    return `Score: ${details.score}${details.score_reason ? ` (${details.score_reason})` : ''}`;
  }
  if (details.field !== undefined) {
    return `${details.field}: ${details.from} -> ${details.to}`;
  }
  return JSON.stringify(details);
}
