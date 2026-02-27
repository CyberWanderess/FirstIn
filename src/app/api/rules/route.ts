import { NextRequest } from 'next/server';
import { ensureInitialized } from '@/lib/init';
import { listRules, insertRule } from '@/lib/repositories/rule-repository';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';
import type { FilterRuleInsert } from '@/types';

export async function GET() {
  ensureInitialized();
  const rules = listRules();
  return jsonResponse(rules);
}

export async function POST(req: NextRequest) {
  ensureInitialized();
  try {
    const body = await parseJsonBody<FilterRuleInsert>(req);
    if (!body.name || !body.field || !body.operator || body.value === undefined || !body.action) {
      return errorResponse('name, field, operator, value, and action are required');
    }
    const rule = insertRule(body);
    return jsonResponse(rule, 201);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}
