import { requireAuthPage } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { listAllUsers, listInvites } from '@/lib/auth-db';
import { existsSync } from 'fs';
import { resolve } from 'path';
import Database from 'better-sqlite3';
import { AdminClient } from './admin-client';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await requireAuthPage();
  if (user.role !== 'admin') redirect('/');

  const users = listAllUsers();
  const usersWithStats = users.map(u => {
    const dbPath = resolve(`./data/user-${u.id}.db`);
    let jobCount = 0;
    if (existsSync(dbPath)) {
      try {
        const db = new Database(dbPath, { readonly: true });
        jobCount = (db.prepare('SELECT COUNT(*) as c FROM jobs').get() as { c: number }).c;
        db.close();
      } catch {
        // DB might not have jobs table yet
      }
    }
    return { ...u, job_count: jobCount };
  });

  const invites = listInvites();

  return <AdminClient users={usersWithStats} invites={invites} currentUserId={user.id} />;
}
