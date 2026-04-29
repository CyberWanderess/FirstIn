import { withAuth } from '@/lib/route-handler';
import { PROMPT_REGISTRY } from '@/lib/export/prompt-registry';
import { getCurrentPromptValue, getCustomizedKeys } from '@/lib/repositories/prompt-repository';
import { jsonResponse } from '@/lib/api-utils';

export const GET = withAuth(async () => {
  const customized = getCustomizedKeys();
  const items = PROMPT_REGISTRY.map((meta) => ({
    key: meta.key,
    title: meta.title,
    group: meta.group,
    description: meta.description,
    placeholders: meta.placeholders ?? [],
    isCustomized: customized.has(meta.key),
    currentValue: getCurrentPromptValue(meta.key) ?? meta.defaultValue,
    defaultValue: meta.defaultValue,
  }));
  return jsonResponse({ items });
});
