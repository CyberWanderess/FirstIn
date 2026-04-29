'use client';

import { useState } from 'react';
import { PermissionsSection, type PermissionGroupClient } from './permissions-section';

interface UserWithStats {
  id: number;
  email: string;
  display_name: string | null;
  role: 'admin' | 'user';
  disabled: boolean;
  permission_group_id: number | null;
  created_at: string;
  job_count: number;
}

interface Invite {
  id: number;
  code: string;
  created_by: number;
  creator_email: string;
  used_by: number | null;
  expires_at: string | null;
  created_at: string;
}

const EXPIRY_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 168 },
  { label: '30 days', hours: 720 },
  { label: 'No expiry', hours: 0 },
];

export function AdminClient({
  users: initialUsers,
  invites: initialInvites,
  currentUserId,
  permissionGroups: initialGroups,
}: {
  users: UserWithStats[];
  invites: Invite[];
  currentUserId: number;
  permissionGroups: PermissionGroupClient[];
}) {
  const [users, setUsers] = useState(initialUsers);
  const [invites, setInvites] = useState(initialInvites);
  const [groups, setGroups] = useState(initialGroups);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [expiryHours, setExpiryHours] = useState(168); // default 7 days
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  async function handleToggleDisabled(userId: number, disabled: boolean) {
    setLoading(`disable-${userId}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, disabled } : u));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function handleDeleteUser(userId: number) {
    setLoading(`delete-${userId}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUsers(prev => prev.filter(u => u.id !== userId));
      setConfirmDelete(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function handleChangeGroup(userId: number, groupId: number) {
    setLoading(`group-${userId}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission_group_id: groupId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, permission_group_id: groupId } : u));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function handleCreateInvite() {
    setLoading('create-invite');
    setError(null);
    try {
      const body = expiryHours > 0 ? { expiresInHours: expiryHours } : {};
      const res = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Refresh invites list
      const listRes = await fetch('/api/admin/invites');
      const listData = await listRes.json();
      if (listData.success) setInvites(listData.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function handleDeleteInvite(id: number) {
    setLoading(`del-invite-${id}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/invites/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInvites(prev => prev.filter(i => i.id !== id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  function copyInviteLink(code: string, id: number) {
    const link = `${window.location.origin}/register?invite=${code}`;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(link);
    } else {
      const ta = document.createElement('textarea');
      ta.value = link;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const activeInvites = invites.filter(i => !i.used_by);
  const usedInvites = invites.filter(i => i.used_by);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-zinc-900">Admin</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Users */}
      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-zinc-200 bg-zinc-50">
          <h2 className="text-sm font-semibold text-zinc-700">Users ({users.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50/50">
              <th className="text-left px-4 py-2 font-medium text-zinc-600">Email</th>
              <th className="text-left px-4 py-2 font-medium text-zinc-600">Name</th>
              <th className="text-left px-4 py-2 font-medium text-zinc-600">Role</th>
              <th className="text-left px-4 py-2 font-medium text-zinc-600">Group</th>
              <th className="text-left px-4 py-2 font-medium text-zinc-600">Jobs</th>
              <th className="text-left px-4 py-2 font-medium text-zinc-600">Status</th>
              <th className="text-left px-4 py-2 font-medium text-zinc-600">Created</th>
              <th className="text-left px-4 py-2 font-medium text-zinc-600 w-40">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-zinc-50 transition-colors">
                <td className="px-4 py-2.5 font-mono text-xs text-zinc-900">{u.email}</td>
                <td className="px-4 py-2.5 text-zinc-700 text-xs">{u.display_name || '--'}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    u.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-zinc-100 text-zinc-600'
                  }`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <select
                    value={u.permission_group_id ?? ''}
                    onChange={e => handleChangeGroup(u.id, Number(e.target.value))}
                    disabled={loading === `group-${u.id}`}
                    className="text-xs border border-zinc-200 rounded px-1.5 py-1 bg-white disabled:opacity-50"
                  >
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.name}{g.is_default ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2.5 text-zinc-700 text-xs font-mono">{u.job_count}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    u.disabled ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {u.disabled ? 'Disabled' : 'Active'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-zinc-500 text-xs">
                  {new Date(u.created_at + 'Z').toLocaleDateString()}
                </td>
                <td className="px-4 py-2.5">
                  {u.id !== currentUserId && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleToggleDisabled(u.id, !u.disabled)}
                        disabled={loading === `disable-${u.id}`}
                        className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                          u.disabled
                            ? 'border border-green-300 text-green-700 hover:bg-green-50'
                            : 'border border-amber-300 text-amber-700 hover:bg-amber-50'
                        } disabled:opacity-50`}
                      >
                        {u.disabled ? 'Enable' : 'Disable'}
                      </button>
                      {confirmDelete === u.id ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            disabled={loading === `delete-${u.id}`}
                            className="px-2 py-1 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="px-2 py-1 text-xs font-medium border border-zinc-300 rounded hover:bg-zinc-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(u.id)}
                          className="px-2 py-1 text-xs font-medium border border-red-300 text-red-700 rounded hover:bg-red-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Permission Groups */}
      <PermissionsSection groups={groups} onGroupsChange={setGroups} />

      {/* Invites */}
      <div className="bg-white border border-zinc-200 rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-zinc-900">Invite Codes</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Generate invite links for new users to register</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={expiryHours}
              onChange={e => setExpiryHours(parseInt(e.target.value, 10))}
              className="border border-zinc-300 rounded px-2 py-1.5 text-sm"
            >
              {EXPIRY_OPTIONS.map(o => (
                <option key={o.hours} value={o.hours}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={handleCreateInvite}
              disabled={loading === 'create-invite'}
              className="px-3 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              {loading === 'create-invite' ? 'Creating...' : 'Generate Invite'}
            </button>
          </div>
        </div>

        {activeInvites.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-zinc-500 mb-2">Active ({activeInvites.length})</h3>
            <div className="space-y-2">
              {activeInvites.map(inv => {
                const expired = inv.expires_at && new Date(inv.expires_at + 'Z') < new Date();
                return (
                  <div key={inv.id} className="flex items-center gap-3 bg-zinc-50 border border-zinc-200 rounded-md px-3 py-2">
                    <code className="text-xs font-mono text-zinc-700 flex-1 truncate">{inv.code}</code>
                    {inv.expires_at && (
                      <span className={`text-xs ${expired ? 'text-red-500' : 'text-zinc-500'}`}>
                        {expired ? 'Expired' : `Expires ${new Date(inv.expires_at + 'Z').toLocaleDateString()}`}
                      </span>
                    )}
                    {!inv.expires_at && <span className="text-xs text-zinc-400">No expiry</span>}
                    <button
                      onClick={() => copyInviteLink(inv.code, inv.id)}
                      className="px-2 py-1 text-xs font-medium border border-zinc-300 rounded hover:bg-zinc-100 transition-colors whitespace-nowrap"
                    >
                      {copiedId === inv.id ? 'Copied!' : 'Copy Link'}
                    </button>
                    <button
                      onClick={() => handleDeleteInvite(inv.id)}
                      disabled={loading === `del-invite-${inv.id}`}
                      className="px-2 py-1 text-xs font-medium border border-red-300 text-red-700 rounded hover:bg-red-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {usedInvites.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-zinc-500 mb-2">Used ({usedInvites.length})</h3>
            <div className="space-y-1">
              {usedInvites.slice(0, 10).map(inv => (
                <div key={inv.id} className="flex items-center gap-3 text-xs text-zinc-400 px-3 py-1">
                  <code className="font-mono truncate flex-1">{inv.code.slice(0, 8)}...</code>
                  <span>by {inv.creator_email}</span>
                  <span>{new Date(inv.created_at + 'Z').toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {invites.length === 0 && (
          <p className="text-sm text-zinc-500">No invite codes yet. Generate one to invite new users.</p>
        )}
      </div>
    </div>
  );
}
