'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'created_at',        label: 'Date Added' },
  { value: 'updated_at',        label: 'Date Updated' },
  { value: 'title',             label: 'Title' },
  { value: 'salary_max',        label: 'Salary (max)' },
  { value: 'score',             label: 'Score' },
  { value: 'score_success',     label: 'Score Success' },
  { value: 'status_changed_at', label: 'Last Status Change' },
];

interface Props {
  sort: string;
  order: 'ASC' | 'DESC';
}

export function SortControl({ sort, order }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParams(next: { sort?: string; order?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.sort !== undefined) params.set('sort', next.sort);
    if (next.order !== undefined) params.set('order', next.order);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="text-zinc-500">Sort:</label>
      <select
        value={sort}
        onChange={(e) => updateParams({ sort: e.target.value })}
        className="border border-zinc-300 rounded px-2 py-1 text-sm bg-white"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => updateParams({ order: order === 'ASC' ? 'DESC' : 'ASC' })}
        className="border border-zinc-300 rounded px-2 py-1 text-sm bg-white hover:bg-zinc-50"
        title={order === 'ASC' ? 'Ascending (click for descending)' : 'Descending (click for ascending)'}
      >
        {order === 'ASC' ? '↑ Asc' : '↓ Desc'}
      </button>
    </div>
  );
}
