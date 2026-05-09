import Link from 'next/link';
import type { ArchivedBreakdown, ManualArchiveReason } from '@/lib/repositories/job-repository';
import { MANUAL_ARCHIVE_REASONS } from '@/lib/repositories/job-repository';

const MISMATCH_REASONS: ManualArchiveReason[] = ['Skill Mismatch', 'Eligibility Mismatch'];

export function DashboardArchivedCard({
  breakdown,
  appliedActive,
}: {
  breakdown: ArchivedBreakdown;
  appliedActive: number;
}) {
  if (breakdown.total === 0 && appliedActive === 0) return null;

  const submitted = appliedActive + breakdown.ats_rejected;
  const filterRate = submitted > 0 ? Math.round((breakdown.ats_rejected / submitted) * 100) : null;

  const mismatchCount = MISMATCH_REASONS.reduce((s, r) => s + (breakdown.manual_by_reason[r] || 0), 0);
  const processedTotal = appliedActive + breakdown.manual_total;
  const mismatchPct = processedTotal > 0 ? (mismatchCount / processedTotal) * 100 : 0;
  const accuracyPct = processedTotal > 0 ? Math.round(100 - mismatchPct) : null;

  const filteredSub = breakdown.filtered_total > 0
    ? [
        breakdown.filtered_no_visa > 0 ? `No visa ${breakdown.filtered_no_visa}` : null,
        breakdown.filtered_other > 0 ? `Other rule ${breakdown.filtered_other}` : null,
      ].filter(Boolean).join(' · ')
    : '';

  const manualEntries: [string, number][] = [
    ...MANUAL_ARCHIVE_REASONS.map((r) => [r, breakdown.manual_by_reason[r] || 0] as [string, number]),
    ['Other', breakdown.manual_by_reason.Other || 0] as [string, number],
  ].filter(([, c]) => c > 0);

  const Row = ({ label, count, href, extra }: { label: string; count: number; href: string; extra?: React.ReactNode }) => (
    <div className="flex items-baseline gap-2 flex-wrap">
      <Link href={href} className="text-zinc-700 hover:text-zinc-900 w-28 shrink-0">
        {label} <span className="font-medium tabular-nums">{count}</span>
      </Link>
      {extra}
    </div>
  );

  return (
    <div className="bg-white border border-zinc-200 rounded-lg px-4 py-3 text-sm flex gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-2">
          <Link
            href="/jobs?status=rejected_resume,archived_filtered,archived_low_match,archived_no_response,archived_manual"
            className="font-medium text-zinc-800 hover:text-zinc-900"
          >
            Archived <span className="text-zinc-400 font-normal">· {breakdown.total}</span>
          </Link>
        </div>

        <div className="space-y-1 text-xs">
          {(breakdown.ats_rejected > 0 || appliedActive > 0) && (
            <Row
              label="ATS Filter"
              count={breakdown.ats_rejected}
              href="/jobs?status=rejected_resume"
              extra={filterRate !== null ? (
                <span className="text-zinc-500">
                  filter rate <span className="font-medium text-zinc-800 tabular-nums">{filterRate}%</span>
                  <span className="text-zinc-400"> ({appliedActive} active / {submitted} submitted)</span>
                </span>
              ) : null}
            />
          )}

          {breakdown.filtered_total > 0 && (
            <Row
              label="Rule Filter"
              count={breakdown.filtered_total}
              href="/jobs?status=archived_filtered"
              extra={filteredSub ? <span className="text-zinc-500">{filteredSub}</span> : null}
            />
          )}

          {breakdown.low_match > 0 && (
            <Row label="Low Match" count={breakdown.low_match} href="/jobs?status=archived_low_match" />
          )}

          {breakdown.no_response > 0 && (
            <Row label="No Response" count={breakdown.no_response} href="/jobs?status=archived_no_response" />
          )}

          {breakdown.manual_total > 0 && (
            <Row
              label="Manual"
              count={breakdown.manual_total}
              href="/jobs?status=archived_manual"
              extra={
                <span className="text-zinc-500 flex flex-wrap gap-x-2">
                  {manualEntries.map(([label, count]) => {
                    const isMismatch = (MISMATCH_REASONS as string[]).includes(label);
                    return (
                      <span key={label} className={isMismatch ? 'text-rose-600' : ''}>
                        {label} <span className="font-medium tabular-nums">{count}</span>
                      </span>
                    );
                  })}
                </span>
              }
            />
          )}
        </div>
      </div>

      {/* Eval accuracy — vertical bar on the right */}
      {accuracyPct !== null && (
        <div
          className="shrink-0 flex flex-col items-center justify-between border-l border-zinc-100 pl-4"
          title={`${processedTotal - mismatchCount}/${processedTotal} correct, ${mismatchCount} mismatch`}
        >
          <div className="text-[10px] text-zinc-500 leading-tight text-center">Eval<br/>accuracy</div>
          <div className="w-2 flex-1 my-1 bg-zinc-100 rounded overflow-hidden flex flex-col min-h-[60px]">
            <div className="bg-rose-400" style={{ height: `${mismatchPct}%` }} />
            <div className="bg-emerald-400" style={{ height: `${100 - mismatchPct}%` }} />
          </div>
          <div className="text-xs font-medium text-zinc-800 tabular-nums">{accuracyPct}%</div>
        </div>
      )}
    </div>
  );
}
