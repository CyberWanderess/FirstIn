import { withAuth } from '@/lib/route-handler';
import { userContext } from '@/lib/db';
import { checkFeature } from '@/lib/permissions';
import { findRuleById, updateRule, deleteRule } from '@/lib/repositories/rule-repository';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';
import type { FilterRuleUpdate } from '@/types';

type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (_req, context) => {
  const { id } = await (context as Params).params;
  const rule = findRuleById(parseInt(id));
  if (!rule) return errorResponse('Rule not found', 404);
  return jsonResponse(rule);
});

export const PATCH = withAuth(async (req, context) => {
  const userId = userContext.getStore()!.userId;
  if (!checkFeature(userId, 'can_manage_rules')) return errorResponse('Rule management not available for your plan', 403);
  const { id } = await (context as Params).params;
  try {
    const body = await parseJsonBody<FilterRuleUpdate>(req);
    const updated = updateRule(parseInt(id), body);
    if (!updated) return errorResponse('Rule not found', 404);
    return jsonResponse(updated);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
});

export const DELETE = withAuth(async (_req, context) => {
  const userId = userContext.getStore()!.userId;
  if (!checkFeature(userId, 'can_manage_rules')) return errorResponse('Rule management not available for your plan', 403);
  const { id } = await (context as Params).params;
  const deleted = deleteRule(parseInt(id));
  if (!deleted) return errorResponse('Rule not found', 404);
  return jsonResponse({ deleted: true });
});
