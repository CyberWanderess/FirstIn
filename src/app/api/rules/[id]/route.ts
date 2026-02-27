import { NextRequest } from 'next/server';
import { ensureInitialized } from '@/lib/init';
import { findRuleById, updateRule, deleteRule } from '@/lib/repositories/rule-repository';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';
import type { FilterRuleUpdate } from '@/types';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  ensureInitialized();
  const { id } = await params;
  const rule = findRuleById(parseInt(id));
  if (!rule) return errorResponse('Rule not found', 404);
  return jsonResponse(rule);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  ensureInitialized();
  const { id } = await params;
  try {
    const body = await parseJsonBody<FilterRuleUpdate>(req);
    const updated = updateRule(parseInt(id), body);
    if (!updated) return errorResponse('Rule not found', 404);
    return jsonResponse(updated);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  ensureInitialized();
  const { id } = await params;
  const deleted = deleteRule(parseInt(id));
  if (!deleted) return errorResponse('Rule not found', 404);
  return jsonResponse({ deleted: true });
}
