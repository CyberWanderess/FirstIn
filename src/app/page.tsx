import Link from 'next/link';
import { ensureInitialized } from '@/lib/init';
import { countJobsByStatus } from '@/lib/repositories/job-repository';
import { getRecentOperations } from '@/lib/repositories/operation-log-repository';
import { CrawlTrigger } from '@/components/crawl-trigger';

const STATUS_GROUPS = [
  { label: 'New', statuses: ['new'], color: 'bg-blue-100 text-blue-800' },
  { label: 'Pending Eval', statuses: ['pending_eval'], color: 'bg-yellow-100 text-yellow-800' },
  { label: 'Deep Analysis', statuses: ['pending_deep_analysis'], color: 'bg-purple-100 text-purple-800' },
  { label: 'Analyzed', statuses: ['analyzed'], color: 'bg-indigo-100 text-indigo-800' },
  { label: 'Ready to Apply', statuses: ['ready_to_apply'], color: 'bg-green-100 text-green-800' },
  { label: 'Applied', statuses: ['applied'], color: 'bg-cyan-100 text-cyan-800' },
  { label: 'Interviewing', statuses: ['interviewing'], color: 'bg-orange-100 text-orange-800' },
  { label: 'Offer', statuses: ['offer'], color: 'bg-emerald-100 text-emerald-800' },
  { label: 'Rejected', statuses: ['rejected'], color: 'bg-red-100 text-red-800' },
  { label: 'Archived', statuses: ['archived_filtered', 'archived_low_match', 'archived_no_response'], color: 'bg-zinc-100 text-zinc-600' },
] as const;

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  ensureInitialized();
  const statusCounts = countJobsByStatus();
  const recentOps = getRecentOperations(undefined, 10);

  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const pendingEval = statusCounts['pending_eval'] || 0;
  const readyToApply = statusCounts['ready_to_apply'] || 0;
  const newCount = statusCounts['new'] || 0;

  // Find last crawl operation
  const lastCrawl = recentOps.find((op) => op.operation === 'crawl');

  return (
    <div className="space-y-6">
      {/* Notification banner */}
      <div className="bg-white border border-zinc-200 rounded-lg p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-6 text-sm text-zinc-600">
            <span>
              Last crawl: {lastCrawl ? new Date(lastCrawl.created_at).toLocaleString() : 'Never'}
            </span>
            <span className="font-medium text-zinc-900">
              Total: {total} jobs
            </span>
            {newCount > 0 && (
              <span className="text-blue-600">New: {newCount}</span>
            )}
            {pendingEval > 0 && (
              <span className="text-yellow-600">Pending eval: {pendingEval}</span>
            )}
            {readyToApply > 0 && (
              <span className="text-green-600">Ready to apply: {readyToApply}</span>
            )}
          </div>
          <CrawlTrigger />
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {STATUS_GROUPS.map((group) => {
          const count = group.statuses.reduce((sum, s) => sum + (statusCounts[s] || 0), 0);
          const statusParam = group.statuses.length === 1 ? group.statuses[0] : group.statuses[0];
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

      {/* Recent activity */}
      <div className="bg-white border border-zinc-200 rounded-lg">
        <div className="px-4 py-3 border-b border-zinc-200">
          <h2 className="font-semibold text-zinc-900">Recent Activity</h2>
        </div>
        <div className="divide-y divide-zinc-100">
          {recentOps.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-zinc-400">No activity yet</div>
          )}
          {recentOps.map((op) => (
            <div key={op.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
              <span className="text-zinc-400 w-36 shrink-0">
                {new Date(op.created_at).toLocaleString()}
              </span>
              <span className="inline-block px-1.5 py-0.5 text-xs rounded bg-zinc-100 text-zinc-600">
                {op.operation}
              </span>
              <span className="text-zinc-600">
                {op.entity_type}
                {op.entity_id ? ` #${op.entity_id}` : ''}
              </span>
              <span className="text-zinc-400 truncate">
                {formatDetails(op.details)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatDetails(details: Record<string, unknown>): string {
  if (details.from !== undefined && details.to !== undefined) {
    return `${details.from || '(none)'} → ${details.to}`;
  }
  if (details.jobs_found !== undefined) {
    return `Found ${details.jobs_found}, new: ${details.new_after_dedup}`;
  }
  if (details.total !== undefined) {
    return `Total: ${details.total}, imported: ${details.imported}`;
  }
  if (details.score !== undefined) {
    return `Score: ${details.score}`;
  }
  if (details.field !== undefined) {
    return `${details.field}: ${details.from} → ${details.to}`;
  }
  return '';
}
