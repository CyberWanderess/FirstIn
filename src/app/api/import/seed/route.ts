import { withAuth } from '@/lib/route-handler';
import { getDb } from '@/lib/db';
import { upsertSetting } from '@/lib/repositories/settings-repository';
import { insertRule } from '@/lib/repositories/rule-repository';
import { insertSearchConfig } from '@/lib/repositories/search-config-repository';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';
import type { FilterRuleInsert, SearchConfigInsert } from '@/types';

interface SeedData {
  settings?: Array<{ key: string; value: string; description?: string }>;
  rules?: FilterRuleInsert[];
  search_configs?: SearchConfigInsert[];
}

export const POST = withAuth(async (req) => {
  try {
    const body = await parseJsonBody<SeedData>(req);
    const db = getDb();

    let settingsCount = 0;
    let rulesCount = 0;
    let configsCount = 0;

    const run = db.transaction(() => {
      if (body.settings) {
        for (const s of body.settings) {
          upsertSetting(s.key, s.value, s.description);
          settingsCount++;
        }
      }

      if (body.rules) {
        for (const r of body.rules) {
          insertRule(r);
          rulesCount++;
        }
      }

      if (body.search_configs) {
        for (const c of body.search_configs) {
          insertSearchConfig(c);
          configsCount++;
        }
      }
    });

    run();

    return jsonResponse({
      settings: settingsCount,
      rules: rulesCount,
      search_configs: configsCount,
    });
  } catch (e) {
    return errorResponse((e as Error).message);
  }
});
