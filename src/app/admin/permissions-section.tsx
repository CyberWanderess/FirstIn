'use client';

import { useState } from 'react';

// Mirror the server types for client use
export interface PermissionGroupClient {
  id: number;
  name: string;
  description: string | null;
  is_default: boolean;
  features: Record<string, boolean>;
  quotas: Record<string, number>;
  user_count?: number;
  created_at: string;
  updated_at: string;
}

const FEATURE_FLAGS = [
  { key: 'can_import', label: 'Import Jobs' },
  { key: 'can_export', label: 'Export Data' },
  { key: 'can_eval', label: 'AI Evaluation' },
  { key: 'can_use_extension', label: 'Chrome Extension' },
  { key: 'can_manage_rules', label: 'Manage Rules' },
  { key: 'can_import_rejections', label: 'Import Rejections' },
  { key: 'can_research', label: 'Company Research' },
] as const;

const QUOTA_DIMS = [
  { key: 'max_jobs', label: 'Max Jobs (0=unlimited)' },
  { key: 'max_eval_per_month', label: 'AI Evals / Month (0=unlimited)' },
  { key: 'max_import_per_day', label: 'Imports / Day (0=unlimited)' },
] as const;

const EMPTY_FEATURES: Record<string, boolean> = Object.fromEntries(FEATURE_FLAGS.map(f => [f.key, true]));
const EMPTY_QUOTAS: Record<string, number> = Object.fromEntries(QUOTA_DIMS.map(q => [q.key, 0]));

export function PermissionsSection({
  groups: initialGroups,
  onGroupsChange,
}: {
  groups: PermissionGroupClient[];
  onGroupsChange: (groups: PermissionGroupClient[]) => void;
}) {
  const [groups, setGroupsLocal] = useState(initialGroups);
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState({ name: '', description: '', features: { ...EMPTY_FEATURES }, quotas: { ...EMPTY_QUOTAS } });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function setGroups(g: PermissionGroupClient[]) {
    setGroupsLocal(g);
    onGroupsChange(g);
  }

  function startCreate() {
    setEditingId('new');
    setForm({ name: '', description: '', features: { ...EMPTY_FEATURES }, quotas: { ...EMPTY_QUOTAS } });
    setError(null);
  }

  function startEdit(g: PermissionGroupClient) {
    setEditingId(g.id);
    setForm({
      name: g.name,
      description: g.description || '',
      features: { ...EMPTY_FEATURES, ...g.features },
      quotas: { ...EMPTY_QUOTAS, ...g.quotas },
    });
    setError(null);
  }

  function cancel() {
    setEditingId(null);
    setError(null);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setLoading(true);
    setError(null);
    try {
      const url = editingId === 'new'
        ? '/api/admin/permission-groups'
        : `/api/admin/permission-groups/${editingId}`;
      const method = editingId === 'new' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), description: form.description.trim() || null, features: form.features, quotas: form.quotas }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Refresh list
      const listRes = await fetch('/api/admin/permission-groups');
      const listData = await listRes.json();
      if (listData.success) setGroups(listData.data);
      setEditingId(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this permission group?')) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/permission-groups/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGroups(groups.filter(g => g.id !== id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSetDefault(id: number) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/permission-groups/${id}/set-default`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGroups(groups.map(g => ({ ...g, is_default: g.id === id })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const enabledCount = (features: Record<string, boolean>) =>
    FEATURE_FLAGS.filter(f => features[f.key]).length;

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-zinc-900">Permission Groups</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Define feature access and usage quotas for user groups</p>
        </div>
        {editingId === null && (
          <button
            onClick={startCreate}
            className="px-3 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 transition-colors"
          >
            Create Group
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">{error}</div>
      )}

      {/* Edit / Create form */}
      {editingId !== null && (
        <div className="border border-zinc-200 rounded-lg p-4 space-y-3 bg-zinc-50">
          <h3 className="text-sm font-semibold text-zinc-700">
            {editingId === 'new' ? 'New Group' : 'Edit Group'}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Name</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
                placeholder="e.g. Free, Pro"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Description</label>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
                placeholder="Optional description"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-2">Features</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {FEATURE_FLAGS.map(f => (
                <label key={f.key} className="flex items-center gap-1.5 text-xs text-zinc-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.features[f.key] ?? true}
                    onChange={e => setForm(prev => ({
                      ...prev,
                      features: { ...prev.features, [f.key]: e.target.checked },
                    }))}
                    className="rounded border-zinc-300"
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-2">Quotas</label>
            <div className="grid grid-cols-3 gap-3">
              {QUOTA_DIMS.map(q => (
                <div key={q.key}>
                  <label className="block text-xs text-zinc-500 mb-1">{q.label}</label>
                  <input
                    type="number"
                    min={0}
                    value={form.quotas[q.key] ?? 0}
                    onChange={e => setForm(prev => ({
                      ...prev,
                      quotas: { ...prev.quotas, [q.key]: parseInt(e.target.value, 10) || 0 },
                    }))}
                    className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm font-mono"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-3 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={cancel}
              className="px-3 py-1.5 text-sm font-medium border border-zinc-300 rounded-md hover:bg-zinc-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Groups list */}
      {groups.length > 0 && (
        <div className="space-y-2">
          {groups.map(g => (
            <div key={g.id} className="flex items-center gap-3 border border-zinc-200 rounded-md px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-900">{g.name}</span>
                  {g.is_default && (
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-medium">Default</span>
                  )}
                  <span className="text-xs text-zinc-400">
                    {enabledCount(g.features)}/{FEATURE_FLAGS.length} features
                  </span>
                  {g.user_count !== undefined && (
                    <span className="text-xs text-zinc-400">{g.user_count} user{g.user_count !== 1 ? 's' : ''}</span>
                  )}
                </div>
                {g.description && <p className="text-xs text-zinc-500 mt-0.5">{g.description}</p>}
              </div>
              <div className="flex gap-1">
                {!g.is_default && (
                  <button
                    onClick={() => handleSetDefault(g.id)}
                    disabled={loading}
                    className="px-2 py-1 text-xs font-medium border border-blue-300 text-blue-700 rounded hover:bg-blue-50 disabled:opacity-50"
                  >
                    Set Default
                  </button>
                )}
                <button
                  onClick={() => startEdit(g)}
                  className="px-2 py-1 text-xs font-medium border border-zinc-300 rounded hover:bg-zinc-50"
                >
                  Edit
                </button>
                {!g.is_default && (
                  <button
                    onClick={() => handleDelete(g.id)}
                    disabled={loading}
                    className="px-2 py-1 text-xs font-medium border border-red-300 text-red-700 rounded hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
