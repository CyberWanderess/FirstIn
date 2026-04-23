/**
 * Shared scoring rules used by BOTH the manual clip-and-paste eval pipeline
 * (evaluation-defaults.ts → evaluation-exporter.ts) AND the auto-eval recheck
 * pipeline (evaluation-recheck.ts → scripts/auto-evaluate.ts).
 *
 * Single source of truth — DO NOT duplicate these rules into either pipeline's
 * prompt body. Import and concatenate instead.
 *
 * Backup-before-edit protocol applies (see feedback_prompt_change_protocol.md).
 */

export const HARDWARE_INFRA_TRIGGERS = `silicon tape-out, datacenter physical build-out, facilities management, power/electrical engineering, low-level networking-gear engineering (BGP/L2/L3 protocol design, switch/router NPI). General networking PM, cloud networking, software-platform team work do NOT qualify as hardware infra.`;

export const SHARED_SCORING_RULES = `## Shared scoring rules (apply to score_success unless overridden by a hard blocker)

**1. Software infra is a STRENGTH, not a gap.** Cloud platform, AI infra, ML infra, data infra, compute resource management, training strategy, and large-scale cloud migration / re-architecture all map to candidate's strengths (formal cloud degree + production cloud-migration experience). Evaluate normally; on borderline matches, add +1 to score_success.

**2. Hardware/physical infra is the ONLY domain hard cap (score_success ≤ 2).**
Triggers: ${HARDWARE_INFRA_TRIGGERS}
Do NOT apply this cap to general cloud/networking PM, platform-team work, or software-side infra.

**3. Core vs peripheral domain.** Judge domain match by the JD's top 3-5 responsibilities (the "you will" / primary duties section), NOT the "nice to have" list. Tag \`domain_gap\` only when the CORE day-to-day work is in a domain the candidate lacks. Peripheral mentions of unfamiliar tools/areas are not gaps.

**4. Healthy-but-unfamous AI startup boost.** PURPOSE: protect the long tail of well-funded but unfamous AI companies — that's where the lower hiring bar + better H-1B odds actually live. The user cannot list these companies by name; the rule must apply dynamically.

  Trigger when ALL of:
  - Company is AI-native (AI is the core product, per company research)
  - Company has a verified funding round Series A through D (\`companies.funding_round\` field is the ground truth)
  - Company is NOT a top-tier brand. Top-tier means FAANG-equivalent hiring bar + cooldown risk — examples: OpenAI, Anthropic, Scale AI, Mistral, Perplexity, Sierra, Harvey, Glean, Cohere, Runway, Character.ai. These are listed as REVERSE EXAMPLES (boost does NOT apply), not as a quality judgement.

  When triggered: +1 to borderline score_success (3→4, 4→5, 5→6). Do NOT tag \`domain_gap:blocker\` for soft mismatches — only for true hard blockers (clinical license, security clearance, hardware-only).

  **Guard against false rejection:** verified funding ≠ "tiny unverifiable / unlikely to sponsor". The "tiny unverifiable" penalty applies only to companies with NO funding record AND boilerplate JDs.

  Hard blockers (clinical license, security clearance, hardware-only) still apply everywhere regardless of stage or boost.

**5. Seniority is score_success neutral.** Staff / Principal / Director / Sr. Director / VP titles do NOT add or subtract from score_success. Senior titles raise \`score\` (attractiveness) only, never score_success. The real success-rate predictor is \`down_level\` (Associate, Junior, Coordinator, L4 / TPM II) — those DO subtract from score_success.

**6. Strict separation: \`score\` (attractiveness) vs \`score_success\` (likelihood of getting + accepting).** These two axes must NOT contaminate each other. The same fact often belongs to ONE axis and not the other:

  | Signal | Affects \`score\` (attractiveness) | Affects \`score_success\` |
  |---|---|---|
  | Company brand prestige (FAANG, top AI lab) | YES — raises score | NO — does NOT raise score_success |
  | Salary likely below market / "$5M-funded startup" | YES — lowers score | NO — does NOT lower score_success |
  | "Limited career value", "zero strategic value" | YES — lowers score | NO — does NOT lower score_success |
  | "Risk factors", "limited runway", "unproven" | YES — lowers score | NO — does NOT lower score_success |
  | Skill / domain match to daily work | NO | YES |
  | H1B feasibility (JD says no sponsorship) | NO | YES — lowers score_success |
  | Cooldown risk after rejection | NO (informs decision) | YES — lowers score_success on borderline |
  | down_level title | NO | YES — lowers score_success |

  **The \`ai_summary\` field is allowed to inform \`score\` only. Risk language in ai_summary ("limited funding", "early stage") MUST NOT lower \`score_success\` — score_success is purely about whether the candidate's skills match the role's daily work AND whether the candidate can realistically get + accept this offer (H1B, level fit, cooldown). Company financial health affects whether the candidate WANTS the job, not whether the candidate would GET it.**

  Specifically: do NOT use phrases like "H-1B transfer to a small company is risky" to lower score_success unless the JD itself signals no sponsorship. "Small company" alone does not predict H-1B failure — verified funding is the relevant signal.

**7. Funding-round signal is provided in the company context block.** When a company has \`Funding Round: Series A\` (or B/C/D) in the context, treat that as VERIFIED funding for rule #4 purposes. Do not require the model to infer funding from ai_summary text. If \`Funding Round: Unknown\`, fall back to ai_summary inference but DO NOT default to "tiny unverifiable" without positive evidence of being unverifiable.`;
