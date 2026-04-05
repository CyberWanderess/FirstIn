'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { JOB_STATUSES, STATUS_LABELS, type ScoreTag } from '@/types';
import { useClickOutside } from '@/hooks/use-click-outside';

// All filterable tags including legacy domain_gap for existing data
const FILTER_TAGS: string[] = [
  'strong_match', 'rare_opportunity',
  'domain_gap:minor', 'domain_gap:major', 'domain_gap:blocker', 'domain_gap',
  'downpay', 'down_level', 'skill_gap', 'exp_gap',
  'cooldown_risk', 'overqualified',
];

const TAG_LABELS: Record<string, string> = {
  strong_match: 'Strong Match',
  rare_opportunity: 'Rare Opportunity',
  'domain_gap:minor': 'Gap: Minor',
  'domain_gap:major': 'Gap: Major',
  'domain_gap:blocker': 'Gap: Blocker',
  domain_gap: 'Domain Gap (old)',
  downpay: 'Downpay',
  down_level: 'Down Level',
  skill_gap: 'Skill Gap',
  exp_gap: 'Exp Gap',
  cooldown_risk: 'Cooldown Risk',
  overqualified: 'Overqualified',
};

const SORT_OPTIONS = [
  { value: 'created_at', label: 'Date Added' },
  { value: 'updated_at', label: 'Last Updated' },
  { value: 'score_success', label: 'Success Rate' },
  { value: 'score', label: 'Attractiveness' },
  { value: 'salary_max', label: 'Salary' },
  { value: 'status_changed_at', label: 'Status Changed' },
  { value: 'company_name', label: 'Company' },
];

export function JobFilterBar({
  initialStatus,
  initialQ,
  initialSort,
  initialOrder,
  initialSort2,
  initialOrder2,
  initialSort3,
  initialOrder3,
  initialTags,
  initialExcludeTags,
}: {
  initialStatus?: string;
  initialQ?: string;
  initialSort: string;
  initialOrder: string;
  initialSort2?: string;
  initialOrder2?: string;
  initialSort3?: string;
  initialOrder3?: string;
  initialTags?: string;
  initialExcludeTags?: string;
}) {
  const router = useRouter();
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(() => {
    if (!initialStatus) return new Set();
    return new Set(initialStatus.split(',').filter(Boolean));
  });
  const [q, setQ] = useState(initialQ || '');
  const [sort, setSort] = useState(initialSort);
  const [order, setOrder] = useState(initialOrder);
  const [sort2, setSort2] = useState(initialSort2 || '');
  const [order2, setOrder2] = useState(initialOrder2 || 'DESC');
  const [sort3, setSort3] = useState(initialSort3 || '');
  const [order3, setOrder3] = useState(initialOrder3 || 'DESC');
  const [includeTags, setIncludeTags] = useState<Set<string>>(() => {
    if (!initialTags) return new Set();
    return new Set(initialTags.split(',').filter(Boolean));
  });
  const [excludeTags, setExcludeTags] = useState<Set<string>>(() => {
    if (!initialExcludeTags) return new Set();
    return new Set(initialExcludeTags.split(',').filter(Boolean));
  });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  useClickOutside(dropdownRef, () => setDropdownOpen(false), dropdownOpen);
  useClickOutside(tagDropdownRef, () => setTagDropdownOpen(false), tagDropdownOpen);

  function toggleIncludeTag(tag: string) {
    setIncludeTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
    // Remove from exclude if being included
    setExcludeTags((prev) => { const next = new Set(prev); next.delete(tag); return next; });
  }

  function toggleExcludeTag(tag: string) {
    setExcludeTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
    // Remove from include if being excluded
    setIncludeTags((prev) => { const next = new Set(prev); next.delete(tag); return next; });
  }

  function toggleStatus(status: string) {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  function applyFilters() {
    const params = new URLSearchParams();
    if (selectedStatuses.size > 0) {
      params.set('status', Array.from(selectedStatuses).join(','));
    } else {
      params.set('status', 'all');
    }
    if (q.trim()) params.set('q', q.trim());
    if (sort !== 'created_at') params.set('sort', sort);
    if (order !== 'DESC') params.set('order', order);
    if (sort2) {
      params.set('sort2', sort2);
      if (order2 !== 'DESC') params.set('order2', order2);
    }
    if (sort3) {
      params.set('sort3', sort3);
      if (order3 !== 'DESC') params.set('order3', order3);
    }
    if (includeTags.size > 0) params.set('tags', Array.from(includeTags).join(','));
    if (excludeTags.size > 0) params.set('exclude_tags', Array.from(excludeTags).join(','));
    const qs = params.toString();
    router.push(`/jobs${qs ? `?${qs}` : ''}`);
  }

  function clearFilters() {
    setSelectedStatuses(new Set());
    setQ('');
    setSort('created_at');
    setOrder('DESC');
    setSort2('');
    setOrder2('DESC');
    setSort3('');
    setOrder3('DESC');
    setIncludeTags(new Set());
    setExcludeTags(new Set());
    router.push('/jobs');
  }

  const hasFilters = selectedStatuses.size > 0 || q.trim() || sort !== 'created_at' || order !== 'DESC' || !!sort2 || !!sort3 || includeTags.size > 0 || excludeTags.size > 0;

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Status multi-select dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="border border-zinc-300 rounded-md px-3 py-1.5 text-sm bg-white text-zinc-900 hover:bg-zinc-50 flex items-center gap-1.5"
          >
            <span>
              {selectedStatuses.size === 0
                ? 'All statuses'
                : `Status (${selectedStatuses.size})`}
            </span>
            <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {dropdownOpen && (
            <div className="absolute z-20 mt-1 w-64 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 max-h-72 overflow-y-auto">
              <button
                type="button"
                onClick={() => setSelectedStatuses(new Set())}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50"
              >
                Clear all
              </button>
              <div className="border-t border-zinc-100 my-1" />
              {JOB_STATUSES.map((s) => (
                <label
                  key={s}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedStatuses.has(s)}
                    onChange={() => toggleStatus(s)}
                    className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                  />
                  <span className="text-zinc-700">{STATUS_LABELS[s] || s.replace(/_/g, ' ')}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Tag filter dropdown */}
        <div className="relative" ref={tagDropdownRef}>
          <button
            type="button"
            onClick={() => setTagDropdownOpen(!tagDropdownOpen)}
            className="border border-zinc-300 rounded-md px-3 py-1.5 text-sm bg-white text-zinc-900 hover:bg-zinc-50 flex items-center gap-1.5"
          >
            <span>
              {includeTags.size === 0 && excludeTags.size === 0
                ? 'Tags'
                : `Tags (${includeTags.size + excludeTags.size})`}
            </span>
            <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {tagDropdownOpen && (
            <div className="absolute z-20 mt-1 w-72 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 max-h-80 overflow-y-auto">
              <button
                type="button"
                onClick={() => { setIncludeTags(new Set()); setExcludeTags(new Set()); }}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50"
              >
                Clear tag filters
              </button>
              <div className="border-t border-zinc-100 my-1" />
              <div className="px-3 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Include / Exclude</div>
              {FILTER_TAGS.map((tag) => (
                <div key={tag} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-50">
                  <label className="flex items-center gap-1 cursor-pointer" title="Include">
                    <input
                      type="checkbox"
                      checked={includeTags.has(tag)}
                      onChange={() => toggleIncludeTag(tag)}
                      className="rounded border-zinc-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-[10px] text-green-600">+</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer" title="Exclude">
                    <input
                      type="checkbox"
                      checked={excludeTags.has(tag)}
                      onChange={() => toggleExcludeTag(tag)}
                      className="rounded border-zinc-300 text-red-600 focus:ring-red-500"
                    />
                    <span className="text-[10px] text-red-600">&minus;</span>
                  </label>
                  <span className="text-zinc-700">{TAG_LABELS[tag] || tag}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search jobs or companies..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
          className="border border-zinc-300 rounded-md px-3 py-1.5 text-sm flex-1 min-w-48"
        />

        {/* Primary Sort */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-zinc-400">1st</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="border border-zinc-300 rounded-md px-2 py-1.5 text-sm bg-white text-zinc-900"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            className="border border-zinc-300 rounded-md px-2 py-1.5 text-sm bg-white text-zinc-900 w-16"
          >
            <option value="DESC">Desc</option>
            <option value="ASC">Asc</option>
          </select>
        </div>

        {/* Secondary Sort */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-zinc-400">2nd</span>
          <select
            value={sort2}
            onChange={(e) => {
              setSort2(e.target.value);
              if (!e.target.value) { setSort3(''); setOrder3('DESC'); }
            }}
            className="border border-zinc-300 rounded-md px-2 py-1.5 text-xs bg-white text-zinc-700"
          >
            <option value="">None</option>
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {sort2 && (
            <select
              value={order2}
              onChange={(e) => setOrder2(e.target.value)}
              className="border border-zinc-300 rounded-md px-2 py-1.5 text-xs bg-white text-zinc-700 w-16"
            >
              <option value="DESC">Desc</option>
              <option value="ASC">Asc</option>
            </select>
          )}
        </div>

        {/* Tertiary Sort */}
        {sort2 && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-zinc-400">3rd</span>
            <select
              value={sort3}
              onChange={(e) => setSort3(e.target.value)}
              className="border border-zinc-300 rounded-md px-2 py-1.5 text-xs bg-white text-zinc-700"
            >
              <option value="">None</option>
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {sort3 && (
              <select
                value={order3}
                onChange={(e) => setOrder3(e.target.value)}
                className="border border-zinc-300 rounded-md px-2 py-1.5 text-xs bg-white text-zinc-700 w-16"
              >
                <option value="DESC">Desc</option>
                <option value="ASC">Asc</option>
              </select>
            )}
          </div>
        )}

        {/* Apply */}
        <button
          type="button"
          onClick={applyFilters}
          className="px-4 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 transition-colors"
        >
          Apply
        </button>

        {/* Clear */}
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-700"
          >
            Clear
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {(selectedStatuses.size > 0 || includeTags.size > 0 || excludeTags.size > 0) && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {Array.from(selectedStatuses).map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700"
            >
              {STATUS_LABELS[s] || s.replace(/_/g, ' ')}
              <button type="button" onClick={() => toggleStatus(s)} className="text-zinc-400 hover:text-zinc-600">&times;</button>
            </span>
          ))}
          {Array.from(includeTags).map((tag) => (
            <span
              key={`+${tag}`}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700"
            >
              +{TAG_LABELS[tag] || tag}
              <button type="button" onClick={() => toggleIncludeTag(tag)} className="text-green-400 hover:text-green-600">&times;</button>
            </span>
          ))}
          {Array.from(excludeTags).map((tag) => (
            <span
              key={`-${tag}`}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700"
            >
              &minus;{TAG_LABELS[tag] || tag}
              <button type="button" onClick={() => toggleExcludeTag(tag)} className="text-red-400 hover:text-red-600">&times;</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
