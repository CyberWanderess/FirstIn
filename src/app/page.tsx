import Link from 'next/link';
import { requireAuthPage } from '@/lib/auth';
import { runWithUser } from '@/lib/db';
import { ensureInitialized } from '@/lib/init';
import { config } from '@/lib/config';
import { countJobsByStatus } from '@/lib/repositories/job-repository';
import { getRecentOperations } from '@/lib/repositories/operation-log-repository';
import { getSetting } from '@/lib/repositories/settings-repository';
import { CrawlTrigger } from '@/components/crawl-trigger';
import { StatusBadge } from '@/components/status-badge';
import { STATUS_LABELS } from '@/types';
import type { OperationLog } from '@/types';
import type { ReactNode } from 'react';

const STATUS_GROUPS = [
  { label: 'Pending Eval', statuses: ['pending_eval'], color: 'bg-yellow-100 text-yellow-800' },
  { label: 'Flagged', statuses: ['flagged'], color: 'bg-amber-100 text-amber-800' },
  { label: 'Deep Analysis', statuses: ['pending_deep_analysis'], color: 'bg-purple-100 text-purple-800' },
  { label: 'Tailored', statuses: ['ready_to_apply_tailored'], color: 'bg-indigo-100 text-indigo-800' },
  { label: 'Ready to Apply', statuses: ['ready_to_apply'], color: 'bg-green-100 text-green-800' },
  { label: 'Applied', statuses: ['applied'], color: 'bg-cyan-100 text-cyan-800' },
  { label: 'Interviewing', statuses: ['interviewing'], color: 'bg-orange-100 text-orange-800' },
  { label: 'Offer', statuses: ['offer'], color: 'bg-emerald-100 text-emerald-800' },
  { label: 'Rejected', statuses: ['rejected'], color: 'bg-red-100 text-red-800' },
  { label: 'Archived', statuses: ['archived_filtered', 'archived_low_match', 'archived_no_response'], color: 'bg-zinc-100 text-zinc-600' },
] as const;

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireAuthPage();

  return runWithUser(user.id, () => {
  ensureInitialized();
  const statusCounts = countJobsByStatus();
  const batchOps = getRecentOperations(undefined, 10, 'batch');
  const jobOps = getRecentOperations(undefined, 10, 'job');

  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const pendingEval = statusCounts['pending_eval'] || 0;
  const flaggedCount = statusCounts['flagged'] || 0;
  const readyToApply = statusCounts['ready_to_apply'] || 0;

  // Find last crawl/import operation
  const lastActivity = config.enableCrawler
    ? batchOps.find((op) => op.operation === 'crawl')
    : batchOps.find((op) => op.operation === 'import');

  const setupCompleted = getSetting('setup_completed', '') === 'true';

  return (<div className="space-y-6">
      {/* Setup banner */}
      {!setupCompleted && (
        <Link
          href="/setup"
          className="block bg-blue-50 border border-blue-200 rounded-lg p-4 hover:bg-blue-100 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold text-blue-900">Welcome to FirstIn!</span>
              <span className="text-sm text-blue-700 ml-2">
                Complete initial setup to configure visa preferences, resume, and filter rules.
              </span>
            </div>
            <span className="text-sm font-medium text-blue-600 shrink-0">Go to Setup &rarr;</span>
          </div>
        </Link>
      )}

      {/* Notification banner */}
      <div className="bg-white border border-zinc-200 rounded-lg p-4">
        <div className={`flex items-center ${config.enableCrawler ? 'justify-between flex-wrap gap-4' : 'gap-6 text-sm text-zinc-600'}`}>
          <div className="flex items-center gap-6 text-sm text-zinc-600">
            <span>
              {config.enableCrawler ? 'Last crawl' : 'Last import'}: {lastActivity ? new Date(lastActivity.created_at).toLocaleString() : 'Never'}
            </span>
            <span className="font-medium text-zinc-900">
              Total: {total} jobs
            </span>
            {pendingEval > 0 && (
              <span className="text-yellow-600">Pending eval: {pendingEval}</span>
            )}
            {flaggedCount > 0 && (
              <span className="text-amber-600">Flagged: {flaggedCount}</span>
            )}
            {readyToApply > 0 && (
              <span className="text-green-600">Ready to apply: {readyToApply}</span>
            )}
          </div>
          {config.enableCrawler && <CrawlTrigger />}
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {STATUS_GROUPS.map((group) => {
          const count = group.statuses.reduce((sum, s) => sum + (statusCounts[s] || 0), 0);
          const statusParam = group.statuses.join(',');
          return (
            <Link
              key={group.label}
              href={`/jobs?status=${statusParam}`}
              className="block bg-white border border-zinc-200 rounded-lg p-4 hover:border-zinc-400 transition-colors"
            >
              <div className="text-2xl font-bold text-zinc-900">{count}</div>
              <div className={`inline-block text-xs font-medium px-2 py-0.5 rounded mt-1 ${group.color}`}>
                {group.label}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Recent activity — split into Batch Operations and Job Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ActivitySection title="Batch Operations" ops={batchOps} />
        <ActivitySection title="Job Activity" ops={jobOps} />
      </div>
    </div>);
  });
}

function ActivitySection({ title, ops }: { title: string; ops: OperationLog[] }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg">
      <div className="px-4 py-3 border-b border-zinc-200">
        <h2 className="font-semibold text-zinc-900">{title}</h2>
      </div>
      <div className="divide-y divide-zinc-100">
        {ops.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-zinc-400">No activity yet</div>
        )}
        {ops.map((op) => (
          <div key={op.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
            <span className="text-zinc-400 w-28 shrink-0 text-xs">
              {new Date(op.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
              {new Date(op.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="inline-block px-1.5 py-0.5 text-xs rounded bg-zinc-100 text-zinc-600 shrink-0">
              {op.operation}
            </span>
            <span className="shrink-0 flex items-center gap-1.5">
              {formatDetails(op)}
            </span>
            <span className="text-zinc-600 truncate">
              {formatEntity(op)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatEntity(op: OperationLog): ReactNode {
  if (op.entity_type === 'job' && op.entity_id) {
    const title = op.job_title || 'Unknown';
    const company = op.company_name ? ` @ ${op.company_name}` : '';
    return (
      <Link href={`/jobs/${op.entity_id}`} className="hover:text-blue-600 hover:underline">
        #{op.entity_id} {title}{company}
      </Link>
    );
  }
  return null;
}

const REJECTION_LABELS: Record<string, string> = {
  resume: 'Resume',
  hr_screen: 'HR Screen',
  hm_interview: 'HM Interview',
  final_round: 'Final Round',
  other: 'Other',
  // Legacy Chinese values
  '简历拒': 'Resume',
  'OA拒': 'OA',
  '面试拒': 'Interview',
  '其他': 'Other',
};

function rejectionLabel(reason: string): string {
  return REJECTION_LABELS[reason] || reason;
}

function formatDetails(op: OperationLog): ReactNode {
  const d = op.details;

  switch (op.operation) {
    case 'status_change':
      if (op.entity_type === 'batch') {
        return `Rejections: ${d.matched_updated ?? 0} updated, ${d.unmatched_created ?? 0} created`;
      }
      if (!d.to) return null;
      return (
        <span className="flex items-center gap-1">
          <StatusBadge status={String(d.to)} />
          {d.reason ? <span className="text-zinc-400 text-xs">({rejectionLabel(String(d.reason))})</span> : null}
        </span>
      );
    case 'score_update': {
      return (
        <span className="flex items-center gap-1.5">
          {d.score !== undefined && <span>Score: {String(d.score)}</span>}
          {d.to !== undefined && <StatusBadge status={String(d.to)} />}
        </span>
      );
    }
    case 'crawl':
      return `Found ${d.jobs_found ?? 0}, new: ${d.new_after_dedup ?? 0}, imported: ${d.imported ?? d.new_after_dedup ?? 0}, filtered: ${d.filtered ?? 0}`;
    case 'import':
      return `Total: ${d.total ?? 0}, imported: ${d.imported ?? 0}, dup: ${d.duplicates ?? d.dup ?? 0}`;
    case 'evaluate':
      return d.evaluated !== undefined ? `Evaluated: ${d.evaluated}` : '';
    case 'jd_fetch':
      return d.fetched !== undefined ? `Fetched: ${d.fetched}` : '';
    case 'visa_scan':
      return d.scanned !== undefined ? `Scanned: ${d.scanned}` : '';
    default: {
      if (d.to !== undefined) {
        return <StatusBadge status={String(d.to)} />;
      }
      if (d.field !== undefined) {
        return `${d.field}: ${d.from} → ${d.to}`;
      }
      return null;
    }
  }
}
