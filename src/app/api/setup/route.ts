import { NextRequest } from 'next/server';
import { ensureInitialized } from '@/lib/init';
import { jsonResponse, errorResponse, parseJsonBody } from '@/lib/api-utils';
import { upsertSetting } from '@/lib/repositories/settings-repository';
import { insertRule } from '@/lib/repositories/rule-repository';
import type { FilterRuleInsert } from '@/types';

interface SetupBody {
  visa_status: 'need_h1b' | 'no_need' | 'skip';
  resume_text: string;
  rule_templates: string[];
  salary_floor: number | null;
}

const RULE_TEMPLATES: Record<string, FilterRuleInsert[]> = {
  basic: [
    { name: 'Exclude junior/intern', field: 'title', operator: 'regex', value: '\\b(intern|junior|entry.level)\\b', action: 'exclude', priority: 100 },
    { name: 'Exclude part-time/temporary', field: 'commitment', operator: 'regex', value: 'Part Time|Temporary', action: 'exclude', priority: 96 },
    { name: 'Flag contract roles', field: 'commitment', operator: 'eq', value: 'Contract', action: 'flag', priority: 50 },
  ],
};

export async function POST(req: NextRequest) {
  ensureInitialized();
  try {
    const body = await parseJsonBody<SetupBody>(req);

    const results = {
      settings_saved: 0,
      rules_created: 0,
    };

    // Visa settings
    if (body.visa_status === 'need_h1b') {
      upsertSetting('no_h1b_action', 'auto_exclude', 'Action for no-H1B companies: auto_exclude or warn');
      upsertSetting('job_no_visa_action', 'auto_exclude', 'Action for jobs with no visa sponsorship');
      results.settings_saved += 2;
    } else if (body.visa_status === 'no_need') {
      upsertSetting('no_h1b_action', 'warn', 'Action for no-H1B companies: auto_exclude or warn');
      upsertSetting('job_no_visa_action', 'warn', 'Action for jobs with no visa sponsorship');
      results.settings_saved += 2;
    }

    // Resume
    if (body.resume_text?.trim()) {
      upsertSetting('resume_text', body.resume_text.trim(), 'User resume for deep analysis');
      results.settings_saved++;
    }

    // Rule templates
    if (body.rule_templates?.length) {
      for (const templateId of body.rule_templates) {
        const rules = RULE_TEMPLATES[templateId];
        if (rules) {
          for (const rule of rules) {
            insertRule(rule);
            results.rules_created++;
          }
        }
      }
    }

    // Salary floor
    if (body.salary_floor && body.salary_floor > 0) {
      insertRule({
        name: `Exclude salary below $${body.salary_floor.toLocaleString()}`,
        field: 'salary_max',
        operator: 'lt',
        value: String(body.salary_floor),
        action: 'exclude',
        priority: 95,
      });
      results.rules_created++;
    }

    // Mark setup as complete
    upsertSetting('setup_completed', 'true', 'Whether initial setup wizard has been completed');
    results.settings_saved++;

    return jsonResponse(results);
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}
