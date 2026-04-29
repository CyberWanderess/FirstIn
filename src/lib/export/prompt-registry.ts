/**
 * Central registry of user-editable prompts. Each entry maps a stable key
 * to the DEFAULT_* constant baked into the exporter modules. The UI lists
 * these; the API serves/saves them; exporter wiring calls `resolvePrompt(key)`
 * to pick user-saved value or fall back to the default.
 */

import {
  DEFAULT_SCORING_GUIDANCE,
  DEFAULT_CALIBRATION_EXAMPLES,
  DEFAULT_SCORE_TAGS,
  DEFAULT_CANDIDATE_PROFILE,
} from './evaluation-defaults';
import { SHARED_SCORING_RULES } from './scoring-rules';
import {
  DEFAULT_SIGNAL_STRENGTH_MAP,
  DEFAULT_RECHECK_TASK_FRAMING,
  DEFAULT_RECHECK_OUTPUT_FORMAT,
} from './evaluation-recheck';
import { DEFAULT_COMPANY_RESEARCH_INSTRUCTIONS } from './company-exporter';
import { DEFAULT_DEEP_ANALYSIS_INSTRUCTIONS } from './deep-analysis-exporter';
import { DEFAULT_REJECTION_SCAN_PROMPT } from './rejection-exporter';
import { getCurrentPromptValue } from '@/lib/repositories/prompt-repository';

export type PromptGroup = 'evaluation' | 'shared' | 'recheck' | 'company' | 'deep_analysis' | 'rejection';

export interface PromptMeta {
  key: string;
  title: string;
  group: PromptGroup;
  description: string;
  /** Placeholders substituted at render time (e.g. `{{days}}`). */
  placeholders?: string[];
  defaultValue: string;
}

export const PROMPT_REGISTRY: PromptMeta[] = [
  // ── Evaluation (clipboard export from workspace → /api/export/evaluate) ──
  {
    key: 'eval.scoring_guidance',
    title: 'Evaluation — Scoring Guidance',
    group: 'evaluation',
    description: 'score_success calibration rules, gap-compensation framework, wrong-role-type rules.',
    defaultValue: DEFAULT_SCORING_GUIDANCE,
  },
  {
    key: 'eval.calibration',
    title: 'Evaluation — Calibration Examples',
    group: 'evaluation',
    description: 'Reference score/score_success pairs to anchor the model.',
    defaultValue: DEFAULT_CALIBRATION_EXAMPLES,
  },
  {
    key: 'eval.score_tags',
    title: 'Evaluation — Score Tag Taxonomy',
    group: 'evaluation',
    description: 'The 9-tag taxonomy (downpay, domain_gap:*, strong_match, etc.).',
    defaultValue: DEFAULT_SCORE_TAGS,
  },
  {
    key: 'eval.candidate_profile',
    title: 'Evaluation — Candidate Profile',
    group: 'evaluation',
    description: 'Static candidate bio included in every evaluation prompt.',
    defaultValue: DEFAULT_CANDIDATE_PROFILE,
  },

  // ── Shared ──
  {
    key: 'shared.scoring_rules',
    title: 'Shared Scoring Rules',
    group: 'shared',
    description: 'Scoring rules shared by evaluation AND recheck prompts.',
    defaultValue: SHARED_SCORING_RULES,
  },

  // ── Recheck (clipboard export from workspace → /api/export/recheck) ──
  {
    key: 'recheck.task_framing',
    title: 'Recheck — Task Framing',
    group: 'recheck',
    description: 'Opening prose: task description, score meaning, role-persona questions.',
    defaultValue: DEFAULT_RECHECK_TASK_FRAMING,
  },
  {
    key: 'recheck.signal_strength',
    title: 'Recheck — Signal-to-Strength Mapping',
    group: 'recheck',
    description: 'JD-signal → candidate-experience lookup table injected into recheck prompts.',
    defaultValue: DEFAULT_SIGNAL_STRENGTH_MAP,
  },
  {
    key: 'recheck.output_format',
    title: 'Recheck — Output Format',
    group: 'recheck',
    description: 'JSON output schema. Use {{job_id}} placeholder for the job id.',
    placeholders: ['job_id'],
    defaultValue: DEFAULT_RECHECK_OUTPUT_FORMAT,
  },

  // ── Company research (clipboard export from workspace → companies research) ──
  {
    key: 'company.instructions',
    title: 'Company Research Instructions',
    group: 'company',
    description: 'Research task prose + field definitions. Use {{json_example}} and {{chinese_affinity_field}} placeholders.',
    placeholders: ['json_example', 'chinese_affinity_field'],
    defaultValue: DEFAULT_COMPANY_RESEARCH_INSTRUCTIONS,
  },

  // ── Deep analysis ──
  {
    key: 'deep_analysis.instructions',
    title: 'Deep Analysis Instructions',
    group: 'deep_analysis',
    description: 'Instructions + field definitions for the deep-analysis prompt.',
    defaultValue: DEFAULT_DEEP_ANALYSIS_INSTRUCTIONS,
  },

  // ── Rejection scan ──
  {
    key: 'rejection.scan',
    title: 'Rejection Scan Prompt',
    group: 'rejection',
    description: 'Gmail/inbox rejection detection prompt. Use {{days}} placeholder for the scan window.',
    placeholders: ['days'],
    defaultValue: DEFAULT_REJECTION_SCAN_PROMPT,
  },
];

const PROMPT_MAP = new Map(PROMPT_REGISTRY.map((p) => [p.key, p]));

export function getPromptMeta(key: string): PromptMeta | undefined {
  return PROMPT_MAP.get(key);
}

export function isValidPromptKey(key: string): boolean {
  return PROMPT_MAP.has(key);
}

/**
 * Return the live value for a prompt key: user's latest saved version if any,
 * otherwise the DEFAULT_* constant. Returns empty string for unknown keys.
 */
export function resolvePrompt(key: string): string {
  const meta = PROMPT_MAP.get(key);
  if (!meta) return '';
  return getCurrentPromptValue(key) ?? meta.defaultValue;
}
