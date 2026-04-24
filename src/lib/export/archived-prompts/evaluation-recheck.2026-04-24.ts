/**
 * Second-pass evaluation for borderline jobs (score_success 4-6).
 *
 * Runs single-job deep analysis with enriched candidate profile
 * and role persona decomposition. Outputs independent score (no anchoring).
 */

import type { JobWithCompany } from '@/types';
import { cleanJdText } from '@/lib/jd-cleaner';
import { SHARED_SCORING_RULES } from './scoring-rules';

export interface RecheckResult {
  id: number;
  score_success: number;
  daily_work_summary: string;
  must_haves_match: string[];
  must_haves_gap: string[];
  reason: string;
}

/** Compute decision based on original and new score */
export function computeDecision(originalScore: number, newScore: number): 'upgrade' | 'keep' | 'downgrade' {
  if (newScore >= 7) return 'upgrade';
  if (newScore <= 3) return 'downgrade';
  return 'keep';
}

// ── Signal-to-Strength Mapping (enriched from resume ammunition library) ──

export const DEFAULT_SIGNAL_STRENGTH_MAP = `## Candidate Signal-to-Strength Mapping

When the JD mentions these signals, the candidate has the following SPECIFIC experience:

| JD Signal | Candidate's Specific Experience |
|-----------|--------------------------------|
| research delivery / model lifecycle | 23 research-to-production programs across CV, GenAI, 3D, on-device AI. Hybrid architecture selection (DiT + distilled SAM + RIFE + traditional CV). Coordinated benchmark development and model evaluation cycles. |
| model externalization / partner delivery | Led 30+ AI PoCs for Fortune 500 clients (Visa, BMW, Unilever, J&J, Honda) — structurally the same as externalizing AI SOTA to external partners. Single point of contact for partner reviews. |
| compliance / responsible AI | 5-year zero-incident record across 6 domains (GDPR, EAR, EO 14117, PIPL, CISA, data localization). EO 14117: took over mid-flight with undefined scope during Congressional inquiry, 50+ critical remediations. Distributed enforcement model. Content safety review frameworks with escalation architecture and decision-authority matrices. |
| ads / personalization / monetization | Built recall/ranking pipeline from zero: data warehouse (ODS→DWD→DWS→ADS), A/B experimentation, GDPR-compliant ops. $1.5–2M annualized uplift, self-funded Y1. |
| 3D / XR / spatial / SLAM | Visual SLAM (quad-cam VIO, loop detection, drift removal), 6DoF hand/controller tracking, stereo depth estimation, multi-camera calibration. 3 generations XR devices shipped with real-time/power constraints. NPI lifecycle across US–China teams. |
| executive advisory / trusted advisor | Primary decision-support partner to Head of Research Institute (500+ org). Synthesized cross-functional inputs into structured decision options on governance, roadmap, resource allocation. Established regional decision authority. |
| crisis / ambiguity / 0→1 | EO 14117 mid-flight takeover (undefined scope, Congressional inquiry, recovered 3+ months delay). EU ads pipeline built from zero infrastructure in 6 months. PMO founded from zero. |
| benchmark / dataset / evaluation | Coordinated benchmark and dataset development for Proactive AI (always-on perception, low-compute). Organized model evaluation cycles with research leads. Defined benchmark criteria. |
| content safety | Multi-layer risk assessment across internal, external, UGC, AI-generated content. Escalation architecture: project→team→dept→GM→C-level with decision-authority matrices per tier. |
| PMO / governance / process | Founded and scaled virtual PMO from zero. ~3.5 FTE overhead governing 80+ researchers/engineers (300+ extended). 85% governance objectives at 30% overhead. Cross-timezone SLA ~0.5 day. |
| compute / GPU / resource allocation | Managed compute allocation across concurrent research programs. Scoped compute/data requirements for training plans. Built prioritization frameworks to arbitrate GPU/cloud budget. |
| AI-native tooling / agentic | Built production-grade agentic pipelines with structured evaluation and prompt tuning. AI-native ops platform reducing HQ dependency to ~15%. Active GenAI tooling sandbox. |
| cross-functional / global / matrix | 80+ researchers/engineers across US–China–EU, 3 time zones. No direct authority, influence-driven. Aligned algorithm, engineering, data, and business teams. |
| enterprise AI / consulting | 30+ AI PoCs, 18+ engagements for Fortune 500 (Visa, BMW, Unilever, J&J, Honda). Executive-ready reporting. Go/no-go at each deployment milestone. Demos at CES/MWC. |

### Strength Gradients
- **Core** (direct match, high confidence): AI/ML research delivery, PMO governance, compliance/regulatory, executive advisory, ads monetization
- **Secondary** (relevant, transferable): XR/3D perception, enterprise AI consulting, content safety, AI-native tooling, benchmark coordination

### NOT strong in (hard gaps):
- Hardware design (silicon, PCB, mechanical, power/electrical), low-level networking-gear engineering (BGP/L2/L3 protocol-deep), pure on-call/oncall infra ops
- Healthcare/medical device regulations (FDA, ISO 14971, IEC 62304)
- Financial services regulatory affairs
- Supply chain / logistics / manufacturing operations
- HR/people ops, GTM/revenue operations

### IS strong in — software infra (often misclassified):
- Cloud platform / AI infra / ML infra / data infra (formal cloud degree + production cloud-migration experience)
- Compute resource management, training strategy, large-scale cloud migration & re-architecture

### Brand-parity signal (rule 5b)
Candidate is Staff at Oppo — a mid-tier Chinese consumer electronics brand with low US tech-market recognition. When scoring, check target company's brand tier:
- **Senior / Sr. TPM / Sr. PM / L5 / plain "TPM" / plain "PM" / plain "Technical Program Manager" at FAANG / top AI lab / well-known US tech second-tier** → realistic lateral from Oppo. Apply **+1 score_success** brand-parity bonus. Do NOT tag \`overqualified\` or \`down_level\`. This covers both Senior-prefixed titles and plain unprefixed TPM/PM titles (which at FAANG-tier are typically mid-level, 1-2 steps below Staff).
- **Staff / Principal / Director / VP at higher-brand cos** → rule 5a neutral. Score normally based on skill/domain match. Do NOT add a brand-stretch penalty.
- Parity-or-below-tier targets → no brand-parity adjustment.`;

/**
 * Default task-framing prose for the recheck prompt (everything before the
 * Signal-to-Strength Mapping and Shared Scoring Rules blocks).
 */
export const DEFAULT_RECHECK_TASK_FRAMING = `## Task
Evaluate how well this job matches the candidate below. Score on a 1-10 scale (decimals allowed, e.g. 6.5).

Score meaning:
- 8-10: Strong match — candidate's daily work experience maps directly to role requirements
- 6-7: Reasonable match — core skills transfer, minor domain gaps
- 4-5: Weak match — significant gaps in must-haves or domain
- 1-3: Poor match — daily work fundamentally different from candidate's background

## Role Persona Analysis (REQUIRED)
Before scoring, answer these three questions:

1. **What is the DAILY work of this role?** Not what the company does — what would this person actually do Monday through Friday? What meetings, what artifacts, what decisions?

2. **Must-have vs nice-to-have decomposition:** List each JD requirement and classify as must-have (role fails without it) or nice-to-have (helpful but not blocking).

3. **Does the candidate's background match the daily work?** Map the must-haves against the candidate's specific experience below. Be precise — "cross-functional coordination" is too vague; name the specific domain.`;

/**
 * Default output-format block for the recheck prompt. `{{job_id}}` is
 * substituted at render time.
 */
export const DEFAULT_RECHECK_OUTPUT_FORMAT = `## Output Format
Return a single JSON object (no markdown fences):
{"id": {{job_id}}, "score_success": <1.0-10.0>, "daily_work_summary": "<1 sentence: what this person does day-to-day>", "must_haves_match": ["<matched must-have 1>", ...], "must_haves_gap": ["<unmatched must-have 1>", ...], "reason": "<1-2 sentences explaining the score>"}`;

export interface RecheckPromptConfig {
  taskFraming?: string;
  signalStrengthMap?: string;
  sharedScoringRules?: string;
  outputFormat?: string;
}

/**
 * Build the recheck prompt for a single borderline job.
 * No original score or decision framing — model evaluates independently.
 */
export function buildRecheckPrompt(job: JobWithCompany, config?: RecheckPromptConfig): string {
  const jdText = (job as any).jd_cleaned_text || (job.jd_full_text ? cleanJdText(job.jd_full_text) : 'Not available');
  const taskFraming = config?.taskFraming || DEFAULT_RECHECK_TASK_FRAMING;
  const signalStrengthMap = config?.signalStrengthMap || DEFAULT_SIGNAL_STRENGTH_MAP;
  const sharedScoringRules = config?.sharedScoringRules || SHARED_SCORING_RULES;
  const outputFormat = (config?.outputFormat || DEFAULT_RECHECK_OUTPUT_FORMAT).replace(/\{\{job_id\}\}/g, String(job.id));

  return `# Deep Evaluation: Job #${job.id}

${taskFraming}

${signalStrengthMap}

${sharedScoringRules}

## Company Context
- Company: ${job.company_display_name}
- Industry: ${(job as any).company_industry || 'Unknown'}
- Size: ${(job as any).company_size || 'Unknown'}
- Funding Round: ${job.funding_round || 'Unknown'}
${(job as any).company_description ? `- Description: ${(job as any).company_description}` : ''}
${(job as any).company_ai_summary ? `- AI Summary: ${(job as any).company_ai_summary}` : ''}
- Cooldown: ${(job as any).cooldown_months != null ? ((job as any).cooldown_months === 0 ? 'None' : `${(job as any).cooldown_months} months`) : 'Unknown'}

## Job Details
- Title: ${job.title}
- Location: ${Array.isArray(job.location) ? job.location.join(', ') : job.location || 'Not specified'}
- Salary: ${formatSalary(job.salary_min, job.salary_max)}
- Work Mode: ${job.work_mode || 'Not specified'} | Commitment: ${job.commitment || 'Not specified'}

## Full Job Description
${jdText}

${outputFormat}
`;
}

/**
 * Parse recheck response into structured result.
 */
export function parseRecheckResult(responseText: string): RecheckResult | null {
  const cleaned = responseText.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!objMatch) return null;

  try {
    const obj = JSON.parse(objMatch[0]);
    // Accept both new format (score_success) and old format (revised_score_success)
    const score = obj.score_success ?? obj.revised_score_success;
    if (typeof obj.id !== 'number' || typeof score !== 'number') return null;

    return {
      id: obj.id,
      score_success: Math.round(Math.max(1, Math.min(10, score)) * 10) / 10,
      daily_work_summary: obj.daily_work_summary || '',
      must_haves_match: Array.isArray(obj.must_haves_match) ? obj.must_haves_match : [],
      must_haves_gap: Array.isArray(obj.must_haves_gap) ? obj.must_haves_gap : [],
      reason: obj.reason || '',
    };
  } catch {
    return null;
  }
}

function formatSalary(min: number | null, max: number | null): string {
  if (min && max) return `$${min.toLocaleString()} - $${max.toLocaleString()}`;
  if (min) return `$${min.toLocaleString()}+`;
  if (max) return `Up to $${max.toLocaleString()}`;
  return 'Not specified';
}
