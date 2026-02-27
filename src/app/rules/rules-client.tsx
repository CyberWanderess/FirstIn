'use client';

import React, { useState, useMemo } from 'react';

interface FilterRule {
  id: number;
  name: string;
  field: string;
  operator: string;
  value: string;
  action: string;
  priority: number;
  enabled: number;
  created_at: string;
}

interface RuleForm {
  name: string;
  field: string;
  operator: string;
  value: string;
  action: string;
  enabled: number;
}

const OPERATORS = ['contains', 'not_contains', 'regex', 'lt', 'gt', 'eq', 'in', 'not_in', 'any_in'];
const ACTIONS = ['exclude', 'include', 'flag', 'protect'];
const FIELDS = ['title', 'company_name', 'location', 'work_mode', 'commitment', 'salary_min', 'salary_max', 'jd_full_text', 'source'];

const EMPTY_FORM: RuleForm = {
  name: '',
  field: 'title',
  operator: 'contains',
  value: '',
  action: 'exclude',
  enabled: 1,
};

const ACTION_COLORS: Record<string, string> = {
  exclude: 'bg-red-100 text-red-700',
  include: 'bg-green-100 text-green-700',
  flag: 'bg-yellow-100 text-yellow-700',
  protect: 'bg-blue-100 text-blue-700',
};

async function fetchApi<T>(url: string, options?: RequestInit): Promise<{ success: boolean; data?: T; error?: string }> {
  const res = await fetch(url, options);
  return res.json();
}

export function RulesClient({ initialRules }: { initialRules: FilterRule[] }) {
  const [rules, setRules] = useState<FilterRule[]>(initialRules);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderChanged, setOrderChanged] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  // Test section state
  const [testJson, setTestJson] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  // Always display sorted by priority descending (higher priority = executes first = top)
  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => b.priority - a.priority),
    [rules],
  );

  function moveRule(ruleId: number, direction: 'up' | 'down') {
    const sorted = [...rules].sort((a, b) => b.priority - a.priority);
    const idx = sorted.findIndex((r) => r.id === ruleId);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    // Swap priority values
    const tempPriority = sorted[idx].priority;
    sorted[idx] = { ...sorted[idx], priority: sorted[swapIdx].priority };
    sorted[swapIdx] = { ...sorted[swapIdx], priority: tempPriority };

    setRules(sorted);
    setOrderChanged(true);
  }

  async function handleSaveOrder() {
    setSavingOrder(true);
    setError(null);
    try {
      const priorities = rules.map((r) => ({ id: r.id, priority: r.priority }));
      const res = await fetchApi<FilterRule[]>('/api/rules/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priorities }),
      });
      if (!res.success) throw new Error(res.error || 'Failed to save order');
      if (res.data) setRules(res.data);
      setOrderChanged(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingOrder(false);
    }
  }

  function startEdit(rule: FilterRule) {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      field: rule.field,
      operator: rule.operator,
      value: rule.value,
      action: rule.action,
      enabled: rule.enabled,
    });
    setShowAdd(false);
    setError(null);
  }

  function startAdd() {
    setShowAdd(true);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setShowAdd(false);
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      if (showAdd) {
        // Auto-assign priority: lower than all existing (will appear at bottom)
        const minPriority = rules.length > 0 ? Math.min(...rules.map((r) => r.priority)) : 0;
        const res = await fetchApi<FilterRule>('/api/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, priority: minPriority - 1 }),
        });
        if (!res.success) throw new Error(res.error || 'Failed to create rule');
        if (res.data) setRules((prev) => [...prev, res.data!]);
        setShowAdd(false);
      } else if (editingId !== null) {
        const res = await fetchApi<FilterRule>(`/api/rules/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (!res.success) throw new Error(res.error || 'Failed to update rule');
        if (res.data) {
          setRules((prev) => prev.map((r) => (r.id === editingId ? res.data! : r)));
        }
        setEditingId(null);
      }
      setForm(EMPTY_FORM);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this rule?')) return;
    try {
      const res = await fetchApi(`/api/rules/${id}`, { method: 'DELETE' });
      if (!res.success) throw new Error(res.error || 'Failed to delete rule');
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleToggleEnabled(rule: FilterRule) {
    try {
      const newEnabled = rule.enabled ? 0 : 1;
      const res = await fetchApi<FilterRule>(`/api/rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      if (!res.success) throw new Error(res.error || 'Failed to toggle');
      if (res.data) {
        setRules((prev) => prev.map((r) => (r.id === rule.id ? res.data! : r)));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleTest() {
    setTestLoading(true);
    setTestError(null);
    setTestResult(null);

    try {
      let data: unknown;
      try {
        data = JSON.parse(testJson);
      } catch {
        throw new Error('Invalid JSON');
      }

      const res = await fetchApi<{ action: string; matchedRules: Array<{ id: number; name: string; action: string }>; reason?: string }>('/api/rules/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job: data }),
      });
      if (!res.success) throw new Error(res.error || 'Test failed');
      setTestResult(JSON.stringify(res.data, null, 2));
    } catch (e) {
      setTestError((e as Error).message);
    } finally {
      setTestLoading(false);
    }
  }

  function renderForm() {
    return (
      <tr className="bg-blue-50 border-b border-zinc-200">
        <td className="px-4 py-2">
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Rule name"
            className="border border-zinc-300 rounded px-2 py-1 text-sm w-full"
          />
        </td>
        <td className="px-4 py-2">
          <select
            value={form.field}
            onChange={(e) => setForm({ ...form, field: e.target.value })}
            className="border border-zinc-300 rounded px-2 py-1 text-sm bg-white"
          >
            {FIELDS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </td>
        <td className="px-4 py-2">
          <select
            value={form.operator}
            onChange={(e) => setForm({ ...form, operator: e.target.value })}
            className="border border-zinc-300 rounded px-2 py-1 text-sm bg-white"
          >
            {OPERATORS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </td>
        <td className="px-4 py-2">
          <input
            type="text"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
            placeholder="Value"
            className="border border-zinc-300 rounded px-2 py-1 text-sm w-full"
          />
        </td>
        <td className="px-4 py-2">
          <select
            value={form.action}
            onChange={(e) => setForm({ ...form, action: e.target.value })}
            className="border border-zinc-300 rounded px-2 py-1 text-sm bg-white"
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </td>
        <td className="px-4 py-2 text-zinc-400 text-xs">auto</td>
        <td className="px-4 py-2 text-center">
          <input
            type="checkbox"
            checked={!!form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked ? 1 : 0 })}
            className="rounded border-zinc-300"
          />
        </td>
        <td className="px-4 py-2">
          <div className="flex gap-1">
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim() || !form.value.trim()}
              className="px-2 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? '...' : 'Save'}
            </button>
            <button
              onClick={cancelEdit}
              className="px-2 py-1 text-xs font-medium border border-zinc-300 rounded hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-zinc-900">Filter Rules</h1>
        <div className="flex items-center gap-2">
          {orderChanged && (
            <button
              onClick={handleSaveOrder}
              disabled={savingOrder}
              className="px-4 py-1.5 text-sm font-medium bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50 transition-colors animate-pulse"
            >
              {savingOrder ? 'Saving...' : 'Save Order'}
            </button>
          )}
          {!showAdd && editingId === null && (
            <button
              onClick={startAdd}
              className="px-4 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 transition-colors"
            >
              Add Rule
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Rules table */}
      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Field</th>
                <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Operator</th>
                <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Value</th>
                <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Action</th>
                <th className="text-center px-4 py-2.5 font-medium text-zinc-600">Order</th>
                <th className="text-center px-4 py-2.5 font-medium text-zinc-600">Enabled</th>
                <th className="text-left px-4 py-2.5 font-medium text-zinc-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {showAdd && renderForm()}
              {rules.length === 0 && !showAdd && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-zinc-400">
                    No rules yet. Click &quot;Add Rule&quot; to create one.
                  </td>
                </tr>
              )}
              {sortedRules.map((rule, idx) =>
                editingId === rule.id ? (
                  <React.Fragment key={rule.id}>{renderForm()}</React.Fragment>
                ) : (
                  <tr key={rule.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-zinc-900">{rule.name}</td>
                    <td className="px-4 py-2.5 text-zinc-600">{rule.field}</td>
                    <td className="px-4 py-2.5 text-zinc-600">{rule.operator}</td>
                    <td className="px-4 py-2.5 text-zinc-600 max-w-48 truncate" title={rule.value}>
                      {rule.value}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${ACTION_COLORS[rule.action] || 'bg-zinc-100 text-zinc-600'}`}>
                        {rule.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        {idx > 0 ? (
                          <button
                            onClick={() => moveRule(rule.id, 'up')}
                            className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors"
                            title="Move up (higher priority)"
                          >
                            ▲
                          </button>
                        ) : (
                          <span className="w-6 h-6" />
                        )}
                        {idx < sortedRules.length - 1 ? (
                          <button
                            onClick={() => moveRule(rule.id, 'down')}
                            className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors"
                            title="Move down (lower priority)"
                          >
                            ▼
                          </button>
                        ) : (
                          <span className="w-6 h-6" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => handleToggleEnabled(rule)}
                        className={`w-8 h-5 rounded-full relative transition-colors ${
                          rule.enabled ? 'bg-green-500' : 'bg-zinc-300'
                        }`}
                      >
                        <span
                          className={`block w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-transform ${
                            rule.enabled ? 'translate-x-3.5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <button
                          onClick={() => startEdit(rule)}
                          className="px-2 py-1 text-xs font-medium border border-zinc-300 rounded hover:bg-zinc-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(rule.id)}
                          className="px-2 py-1 text-xs font-medium border border-red-200 text-red-600 rounded hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Test section */}
      <div className="bg-white border border-zinc-200 rounded-lg p-6 space-y-3">
        <h2 className="font-semibold text-zinc-900">Test Rules</h2>
        <p className="text-sm text-zinc-500">
          Paste a job JSON object below to test against all enabled rules.
        </p>
        <textarea
          value={testJson}
          onChange={(e) => setTestJson(e.target.value)}
          rows={6}
          className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm text-zinc-900 font-mono resize-y"
          placeholder='{"title": "Software Engineer", "company_name": "Acme Corp", "location": ["Remote"], ...}'
        />
        <button
          onClick={handleTest}
          disabled={testLoading || !testJson.trim()}
          className="px-4 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {testLoading ? 'Testing...' : 'Test Rules'}
        </button>

        {testResult && (
          <pre className="bg-zinc-50 border border-zinc-200 rounded-md p-3 text-sm text-zinc-700 overflow-x-auto">
            {testResult}
          </pre>
        )}
        {testError && (
          <div className="text-sm text-red-600">{testError}</div>
        )}
      </div>
    </div>
  );
}

