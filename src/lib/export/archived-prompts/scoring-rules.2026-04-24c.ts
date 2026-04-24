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

// Companies whose US tech-market brand recognition is higher than Oppo's.
// Used by rule 5b (brand-parity adjustment). Extend as the market evolves.
export const BRAND_ABOVE_OPPO = `FAANG / FAANG-adjacent: Google (Alphabet), Meta, Amazon, Apple, Netflix, Microsoft, NVIDIA.
Top AI labs: OpenAI, Anthropic, Google DeepMind, Mistral, Scale AI, Perplexity, Cohere, Runway, Character.ai, Harvey, Glean, Sierra, xAI.
Well-known US tech second-tier: Pinterest, Adobe, Roku, Databricks, Snowflake, Stripe, Uber, Airbnb, Disney, DoorDash, Spotify, Reddit, Atlassian, Figma, Notion, Salesforce, ServiceNow, Palantir, Lyft, Datadog, MongoDB, Cloudflare, HubSpot.`;

export const SHARED_SCORING_RULES = `## Shared scoring rules (apply to score_success unless overridden by a hard blocker)

**1. Software infra is a STRENGTH, not a gap.** Cloud platform, AI infra, ML infra, data infra, compute resource management, training strategy, and large-scale cloud migration / re-architecture all map to candidate's strengths (formal cloud degree + production cloud-migration experience). Evaluate normally; on borderline matches, add +1 to score_success. **Does NOT apply to narrow sub-specialties** (SRE, specific cloud DB/data products like Redshift/BigQuery, storage COGS / cost optimization, autonomous vehicles, etc.) — see rule 3b for the anti-example list.

**2. Hardware/physical infra is the ONLY domain hard cap (score_success ≤ 2).**
Triggers: ${HARDWARE_INFRA_TRIGGERS}
Do NOT apply this cap to general cloud/networking PM, platform-team work, or software-side infra.

**3. Core vs peripheral domain.** Judge domain match by the JD's top 3-5 responsibilities (the "you will" / primary duties section), NOT the "nice to have" list. Tag \`domain_gap\` only when the CORE day-to-day work is in a domain the candidate lacks. Peripheral mentions of unfamiliar tools/areas are not gaps.

**3b. Context dilution guard (mandatory check before strong_match at FAANG / top AI / big-tech companies).** Big AI/tech companies' JDs naturally contain AI/ML/cloud/infrastructure keywords as company boilerplate ("About the team: we're at the frontier of AI / Join us to build the future") and "ways to stand out" sections. **These keywords alone are NOT evidence the role matches candidate's concrete experience.** This is the inverse of rule 3 (peripheral mentions of the candidate's strengths are not strengths, just as peripheral mentions of unfamiliar tools are not gaps).

  **Before tagging \`strong_match\` or invoking rule 1 (software infra strength):**
  1. Re-read the JD's TOP 3-5 PRIMARY responsibilities ("you will", "primary duties", or equivalent). **Ignore** "About the team / company", "ways to stand out", "nice to have".
  2. Verify those primary duties specifically require candidate's CONCRETE background: cloud migration (= moving applications to cloud), AI/ML research-to-product delivery (= shipping research into production), PMO governance (virtual PMO across 80+ engineers), ads monetization pipeline (recall/ranking + data warehouse + A/B), compliance frameworks (GDPR / EO 14117 / content safety), XR / on-device / SLAM.
  3. If the core work is a narrow sub-specialty (see list below), do NOT tag \`strong_match\` and do NOT invoke rule 1. Tag \`domain_gap:minor\` or \`domain_gap:major\` appropriately.

  **Narrow sub-specialties that do NOT qualify as strong_match (regardless of AI context in company boilerplate or title):**
  - **SRE / Site Reliability Engineering** (on-call, SLO/SLI, incident response, chaos engineering, reliability programs) — candidate's cloud-migration background does NOT cover SRE discipline
  - **Specific cloud DB / data product TPM** (Redshift, BigQuery, Snowflake product internals, Azure Storage product team) — product-specific domain
  - **Storage / compute COGS / cost-of-goods optimization** (finance-adjacent infra ops; Azure Storage Efficiency, AWS cost, GCP cost) — storage + finance, not software infra architecture
  - **Autonomous vehicles / automotive functional safety** (ISO 26262 / ASPICE / DRIVE OS / NVIDIA AV) — domain-specific
  - **Customer-success / customer-facing / professional-services PM** (external customer ops, implementation PM) — not internal program management
  - **Executive-in-Residence / advisory / strategy** roles — require specific executive networks, not candidate's profile
  - **Device / hardware product teams** when JD primary duties are hardware lifecycle (PCB / mechanical / power / silicon / certification) — candidate's XR "3 generations" adjacency applies only to software-side XR program work

  Rule 1 (software infra = strength) applies to **generic** cloud / AI / ML / data infrastructure TPM program management (platform teams, migrations, training/inference orchestration at infra level) — NOT to the narrow sub-specialties above.

**4. Healthy-but-unfamous AI startup boost.** PURPOSE: protect the long tail of well-funded but unfamous AI companies — that's where the lower hiring bar + better H-1B odds actually live. The user cannot list these companies by name; the rule must apply dynamically.

  Trigger when ALL of:
  - Company is AI-native (AI is the core product, per company research)
  - Company has a verified funding round Series A through D (\`companies.funding_round\` field is the ground truth)
  - Company is NOT a top-tier brand. Top-tier means FAANG-equivalent hiring bar + cooldown risk — examples: OpenAI, Anthropic, Scale AI, Mistral, Perplexity, Sierra, Harvey, Glean, Cohere, Runway, Character.ai. These are listed as REVERSE EXAMPLES (boost does NOT apply), not as a quality judgement.

  When triggered: +1 to borderline score_success (3→4, 4→5, 5→6). Do NOT tag \`domain_gap:blocker\` for soft mismatches — only for true hard blockers (clinical license, security clearance, hardware-only).

  **Guard against false rejection:** verified funding ≠ "tiny unverifiable / unlikely to sponsor". The "tiny unverifiable" penalty applies only to companies with NO funding record AND boilerplate JDs.

  Hard blockers (clinical license, security clearance, hardware-only) still apply everywhere regardless of stage or boost.

**4b. Small-co strong-match realism bonus (hiring-bar-proxy lower side).** PURPOSE: the real-world hit rate at small/mid companies is higher than at FAANG-tier companies for the SAME responsibilities, because hiring bar is lower, candidate pool is smaller, and teams are more willing to hire on transferable skills. A small-company TPM doing the same daily work as a FAANG Director should outrank that Director on score_success, not trail it. Rules 5b and 4b are both applications of the hiring-bar-proxy principle — 5b on the high-bar side (level step-down mitigates high bar), 4b on the low-bar side (low bar itself is the boost).

  **Trigger when ALL of:**
  - Target company is NOT in the BRAND_ABOVE_OPPO set (i.e. not FAANG / not top AI lab / not well-known second-tier).
  - Company has verified funding (\`companies.funding_round\` is Series A–D) OR company \`size\` field indicates <5000 employees.
  - Role is TPM/PM/Program Manager centered on cross-functional delivery (not a Wrong-Role-Type per eval-defaults).
  - Role would otherwise tag \`strong_match\` or \`strong_match + domain_gap:minor\` with no hard blockers.

  **Effect:** Apply **+1 to score_success** as a low-hiring-bar realism bonus, on top of any rule 4 borderline boost. Unlike rule 4 (which caps at 5→6), rule 4b applies to any score tier — a strong_match at a small funded co can legitimately land score_success 7 or 8. This is symmetric to rule 5b (big-brand Senior gets +1) on the opposite side of the brand-tier axis.

  **Do NOT tag** \`downpay\` / "limited career value" as score_success reductions here — those are attractiveness signals (affect \`score\`), not hit-rate signals. The role being a realistic target (high hit rate) is exactly what rule 4b is capturing.

**5a. Seniority itself is score_success neutral for same-brand-tier moves.** Staff / Principal / Director / Sr. Director / VP titles do NOT add or subtract from score_success when moving across companies of similar brand tier. Senior titles raise \`score\` (attractiveness) only, never score_success. True down-level titles (Associate, Junior, Coordinator, L4 / TPM II) still subtract from score_success as before.

**5b. Brand-parity bonus for realistic laterals at higher-brand companies.** Oppo (candidate's current employer) is a mid-tier Chinese consumer electronics brand with low US tech-market recognition compared to FAANG, top AI labs, and well-known US tech second-tier. Companies "above Oppo's brand tier":

${BRAND_ABOVE_OPPO}

  **Trigger:** Target company is in the above-Oppo set AND the JD level is AT OR BELOW Senior (i.e. any of: Senior / Sr. TPM / Sr. PM / Sr. Manager / L5 / L6-IC-track, OR plain unprefixed titles like "Technical Program Manager" / "Program Manager" / "TPM" / "PM" at higher-brand cos where plain = mid-level by convention).

  **Effect:** Apply **+1 to score_success** as a brand-parity bonus. Do NOT tag \`overqualified\` or \`down_level\`. Do NOT lower score_success for "seniority mismatch". The rationale: given Oppo's brand gap in the US tech market, stepping down one or two levels into a FAANG / top-AI / well-known second-tier company is the realistic lateral path — such roles should not be penalized as beneath the candidate.

  **Explicit non-triggers (keep neutral or penalize as before):**
  - True down-level titles (Associate, Junior, Coordinator, L4 / TPM II / E4) → still apply \`down_level\` penalty per rule 5a.
  - Same-level or up-level at higher-brand co (Staff / Principal / Director / VP) → rule 5a's neutrality applies. Do NOT add a brand-stretch penalty here; score these normally based on skill/domain match.
  - Parity or below-parity target companies → no brand-parity adjustment. Staff/Director titles at mid-tier or lesser-known companies stay neutral.

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
