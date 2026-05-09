'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface DailyStatRow {
  date: string;
  newJobs: number;
  activeNew: number;
  applied: number;
  tailored: number;
}

interface ApiResponse {
  success: boolean;
  data?: DailyStatRow[];
  error?: string;
}

const RANGES = [7, 30, 90, 365] as const;
type Range = (typeof RANGES)[number];

// Colors tuned to match the project's zinc/tailwind palette.
const COLOR_TAILORED = '#047857';    // emerald-700
const COLOR_APPLIED = '#6ee7b7';     // emerald-300
const COLOR_NEW_JOBS = '#2563eb';    // blue-600
const COLOR_ACTIVE_NEW = '#d97706';  // amber-600

// Explicit YAxis widths so the HTML data table below can align with bar
// centers by using matching left/right spacers.
const YAXIS_WIDTH = 44;

export function DailyStatsChart() {
  const [range, setRange] = useState<Range>(30);
  const [rows, setRows] = useState<DailyStatRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Recharts can throw during hydration when the ResponsiveContainer mounts
  // with a 0x0 parent; defer rendering until after first paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const load = useCallback(async (days: number) => {
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/daily-stats?days=${days}`);
      const body = (await res.json()) as ApiResponse;
      if (!body.success || !body.data) {
        setError(body.error || 'Failed to load stats');
        return;
      }
      setRows(body.data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { load(range); }, [load, range]);

  // Hide inline value labels + data table on long ranges where bars get too narrow.
  const showRatioLabels = range <= 30;

  const chartData = useMemo(() => {
    if (!rows) return [];
    return rows.map((r) => ({
      ...r,
      // Recharts stacks `tailored` + `nonTailored` on the same stackId so the
      // total bar height equals `applied`. We keep `applied` in the row for
      // the tooltip but don't render it as a bar.
      nonTailored: Math.max(0, r.applied - r.tailored),
    }));
  }, [rows]);

  const tickFormatter = useMemo(() => {
    // Fewer ticks for longer ranges.
    return (iso: string) => {
      const d = new Date(iso + 'T00:00:00Z');
      if (range <= 30) {
        return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
      }
      // For 90/365: show month abbreviations only on month starts.
      return d.getUTCDate() === 1
        ? d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
        : '';
    };
  }, [range]);

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h2 className="font-semibold text-zinc-900">Daily Activity</h2>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
                range === r
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-zinc-600 border-zinc-300 hover:bg-zinc-50'
              }`}
            >
              {r === 365 ? '1y' : `${r}d`}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="text-sm text-rose-600">Error: {error}</div>}
      {!error && (!mounted || rows === null) && <div className="text-sm text-zinc-400">Loading…</div>}
      {!error && mounted && rows !== null && (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={tickFormatter}
                tick={showRatioLabels ? false : { fontSize: 11, fill: '#71717a' }}
                tickLine={false}
                axisLine={{ stroke: '#e4e4e7' }}
                interval="preserveStartEnd"
                minTickGap={range >= 90 ? 20 : 8}
                height={showRatioLabels ? 4 : undefined}
              />
              <YAxis
                yAxisId="left"
                width={YAXIS_WIDTH}
                tick={{ fontSize: 11, fill: '#71717a' }}
                tickLine={false}
                axisLine={{ stroke: COLOR_APPLIED }}
                allowDecimals={false}
                label={{ value: 'Apps', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#71717a' } }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                width={YAXIS_WIDTH}
                tick={{ fontSize: 11, fill: '#71717a' }}
                tickLine={false}
                axisLine={{ stroke: COLOR_NEW_JOBS }}
                allowDecimals={false}
                label={{ value: 'Jobs', angle: 90, position: 'insideRight', style: { fontSize: 10, fill: '#71717a' } }}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e4e4e7' }}
                formatter={(value, name) => {
                  const labels: Record<string, string> = {
                    tailored: 'Tailored',
                    nonTailored: 'Non-tailored',
                    applied: 'Applied (total)',
                    newJobs: 'New (gross)',
                    activeNew: 'New (active)',
                  };
                  return [value as number, labels[String(name)] ?? String(name)];
                }}
              />
              <Legend
                verticalAlign="top"
                wrapperStyle={{ fontSize: 12, paddingBottom: 4 }}
                formatter={(value: string) => {
                  const labels: Record<string, string> = {
                    tailored: 'Tailored',
                    nonTailored: 'Non-tailored',
                    newJobs: 'New (gross)',
                    activeNew: 'New (active)',
                  };
                  return <span style={{ color: '#3f3f46' }}>{labels[value] ?? value}</span>;
                }}
              />
              <Bar yAxisId="left" dataKey="tailored" stackId="apps" fill={COLOR_TAILORED} />
              <Bar yAxisId="left" dataKey="nonTailored" stackId="apps" fill={COLOR_APPLIED} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="newJobs"
                stroke={COLOR_NEW_JOBS}
                strokeWidth={2}
                dot={{ r: 2, fill: COLOR_NEW_JOBS }}
              >
                {showRatioLabels && (
                  <LabelList
                    dataKey="newJobs"
                    position="top"
                    style={{ fontSize: 10, fill: COLOR_NEW_JOBS, fontWeight: 600 }}
                    formatter={(v: unknown) => (typeof v === 'number' && v > 0 ? String(v) : '')}
                  />
                )}
              </Line>
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="activeNew"
                stroke={COLOR_ACTIVE_NEW}
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={{ r: 2, fill: COLOR_ACTIVE_NEW }}
              >
                {showRatioLabels && (
                  <LabelList
                    dataKey="activeNew"
                    position="bottom"
                    style={{ fontSize: 10, fill: COLOR_ACTIVE_NEW, fontWeight: 600 }}
                    formatter={(v: unknown) => (typeof v === 'number' && v > 0 ? String(v) : '')}
                  />
                )}
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
          {showRatioLabels && (
            <div
              className="mt-0 text-[10px]"
              style={{ display: 'flex', alignItems: 'stretch' }}
            >
              {/* Left label column — same width as the left YAxis so the
                  numbers align with bar centers. First row left blank to
                  pair with the date row that now serves as the X axis. */}
              <div
                style={{ width: YAXIS_WIDTH, flexShrink: 0, textAlign: 'right', paddingRight: 6 }}
              >
                <div>&nbsp;</div>
                <div style={{ color: COLOR_TAILORED, fontWeight: 600 }}>Tailored</div>
                <div style={{ color: '#3f3f46', fontWeight: 600 }}>Applied</div>
              </div>
              {/* Data grid — one column per day, centered numbers mirror bar centers.
                  First row is the date axis (replaces chart's hidden XAxis ticks). */}
              <div
                style={{
                  flex: 1,
                  display: 'grid',
                  gridTemplateColumns: `repeat(${chartData.length}, 1fr)`,
                }}
              >
                {chartData.map((r) => (
                  <div key={`d-${r.date}`} style={{ textAlign: 'center', color: '#71717a' }}>
                    {tickFormatter(r.date)}
                  </div>
                ))}
                {chartData.map((r) => (
                  <div key={`t-${r.date}`} style={{ textAlign: 'center', color: COLOR_TAILORED }}>
                    {r.tailored || ''}
                  </div>
                ))}
                {chartData.map((r) => (
                  <div key={`a-${r.date}`} style={{ textAlign: 'center', color: '#3f3f46' }}>
                    {r.applied || ''}
                  </div>
                ))}
              </div>
              {/* Right spacer matches right YAxis width so last column centers on last bar */}
              <div style={{ width: YAXIS_WIDTH, flexShrink: 0 }} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
