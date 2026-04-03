import Link from 'next/link';
import { requireAuthPage } from '@/lib/auth';
import { runWithUser } from '@/lib/db';
import { ensureInitialized } from '@/lib/init';
import { listCompanies } from '@/lib/repositories/company-repository';
import { APPLICATION_STRATEGIES } from '@/types';

export const dynamic = 'force-dynamic';

const STRATEGY_COLORS: Record<string, string> = {
  open: 'bg-green-100 text-green-800',
  cautious: 'bg-yellow-100 text-yellow-800',
  blocked: 'bg-red-100 text-red-800',
  no_h1b: 'bg-zinc-100 text-zinc-600',
};

const INFO_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  complete: 'bg-green-100 text-green-800',
};

const SOURCE_COLORS: Record<string, string> = {
  hiring_cafe: 'bg-orange-100 text-orange-700',
  linkedin: 'bg-blue-100 text-blue-700',
  jsearch: 'bg-purple-100 text-purple-700',
  greenhouse: 'bg-emerald-100 text-emerald-700',
  lever: 'bg-zinc-100 text-zinc-600',
  ashby: 'bg-zinc-100 text-zinc-600',
  manual: 'bg-zinc-100 text-zinc-500',
};

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const user = await requireAuthPage();
  const params = await searchParams;

  return runWithUser(user.id, () => {
  ensureInitialized();
  const strategy = params.strategy || undefined;
  const infoStatus = params.info_status || undefined;
  const q = params.q || undefined;
  const page = parseInt(params.page || '1');
  const limit = 50;
  const offset = (page - 1) * limit;

  const { companies, total } = listCompanies({ strategy, infoStatus, q, limit, offset });
  const totalPages = Math.ceil(total / limit);

  function buildUrl(overrides: Record<string, string>) {
    const base: Record<string, string> = {};
    if (strategy) base.strategy = strategy;
    if (infoStatus) base.info_status = infoStatus;
    if (q) base.q = q;
    const merged = { ...base, ...overrides };
    const qs = new URLSearchParams(merged).toString();
    return `/companies${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white border border-zinc-200 rounded-lg p-4">
        <form className="flex flex-wrap items-center gap-3">
          <select
            name="strategy"
            defaultValue={strategy || ''}
            className="border border-zinc-300 rounded-md px-3 py-1.5 text-sm bg-white text-zinc-900"
          >
            <option value="">All strategies</option>
            {APPLICATION_STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          <select
            name="info_status"
            defaultValue={infoStatus || ''}
            className="border border-zinc-300 rounded-md px-3 py-1.5 text-sm bg-white text-zinc-900"
          >
            <option value="">All info statuses</option>
            <option value="pending">Pending</option>
            <option value="complete">Complete</option>
          </select>

          <input
            name="q"
            type="text"
            placeholder="Search companies..."
            defaultValue={q || ''}
            className="border border-zinc-300 rounded-md px-3 py-1.5 text-sm flex-1 min-w-48"
          />

          <button
            type="submit"
            className="px-4 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 transition-colors"
          >
            Filter
          </button>

          {(strategy || infoStatus || q) && (
            <Link
              href="/companies"
              className="px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-700"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* Results count */}
      <div className="text-sm text-zinc-500">
        {total} compan{total !== 1 ? 'ies' : 'y'} found
      </div>

      {/* Table */}
      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Name</th>
              <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Industry</th>
              <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Size</th>
              <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Strategy</th>
              <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Sources</th>
              <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Info Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {companies.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  No companies found
                </td>
              </tr>
            )}
            {companies.map((company) => (
              <tr key={company.id} className="hover:bg-zinc-50 transition-colors">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/companies/${company.id}`}
                    className="text-zinc-900 font-medium hover:underline"
                  >
                    {company.display_name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-zinc-600">
                  {company.industry || '--'}
                </td>
                <td className="px-4 py-2.5 text-zinc-600">
                  {company.size || '--'}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${STRATEGY_COLORS[company.application_strategy] || 'bg-zinc-100 text-zinc-600'}`}>
                    {company.application_strategy}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {company.sources.length > 0 ? company.sources.map(s => (
                      <span key={s} className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded ${SOURCE_COLORS[s] || 'bg-zinc-100 text-zinc-500'}`}>
                        {s}
                      </span>
                    )) : <span className="text-zinc-400">--</span>}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${INFO_STATUS_COLORS[company.info_status] || 'bg-zinc-100 text-zinc-600'}`}>
                    {company.info_status}
                  </span>
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
