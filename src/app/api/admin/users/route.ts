import { NextRequest, NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { resolve } from 'path';
import Database from 'better-sqlite3';
import { requireAdmin } from '@/lib/admin';
import { listAllUsers } from '@/lib/auth-db';

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if ('error' in auth) return auth.error;

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

  return NextResponse.json({ success: true, data: usersWithStats });
}
