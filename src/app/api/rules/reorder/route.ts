import { NextRequest } from 'next/server';
import { ensureInitialized } from '@/lib/init';
import { getDb } from '@/lib/db';
import { listRules } from '@/lib/repositories/rule-repository';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';

export async function POST(req: NextRequest) {
  ensureInitialized();
  try {
    const body = await parseJsonBody<{ priorities: Array<{ id: number; priority: number }> }>(req);
    if (!Array.isArray(body.priorities)) {
      return errorResponse('"priorities" array is required');
    }

    const db = getDb();
    const stmt = db.prepare('UPDATE filter_rules SET priority = ? WHERE id = ?');

    db.transaction(() => {
      for (const item of body.priorities) {
        stmt.run(item.priority, item.id);
      }
    })();

    const rules = listRules();
    return jsonResponse(rules);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}
