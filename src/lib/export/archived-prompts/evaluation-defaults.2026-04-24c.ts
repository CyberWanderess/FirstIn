/**
 * Default prompt sections for job evaluation.
 * These are used when the user has not customized their templates in Settings.
 *
 * NOTE: Scoring rules shared with the auto-eval recheck pipeline live in
 * `scoring-rules.ts`. Update there, not here, to keep both pipelines aligned.
 */

import { SHARED_SCORING_RULES, HARDWARE_INFRA_TRIGGERS } from './scoring-rules';

export const DEFAULT_SCORING_GUIDANCE = `**score_success calibration:**
- TPM/PM is a transferable skill for roles centered on cross-functional coordination. Domain can be learned; orchestration ability cannot.
- If JD emphasizes cross-functional coordination, stakeholder management, delivery under ambiguity → candidate's CORE strengths, add +1-2 to score_success.
- H1B: only penalize if JD explicitly says no sponsorship. If unknown (most cases), treat as neutral.
- score_success 8-9: Direct skill + domain + level match
- score_success 6-7: Good skill match, minor gap (domain or level)
- score_success 4-5: Transferable skills, moderate gap — candidate has a realistic but non-trivial shot. Use 5 for single minor gap; use 4 ONLY when the role still primarily needs cross-functional coordination despite domain distance.
- score_success 3: Transferable skills exist BUT domain_gap:major AND at least one other weakness (skill_gap, exp_gap, or unclear sponsorship). Long shot — do NOT use 4 in this case.
- score_success 1-2: Hard blockers (no visa, citizenship required, physical construction, clinical licenses) or fundamental mismatch where TPM skills don't apply.

**Domain mismatch scoring rules (these override the "TPM is transferable" default):**
- Hardware/physical infra TPM (${HARDWARE_INFRA_TRIGGERS}) → score_success ≤ 2, regardless of company brand
- Pure on-call/oncall ops PM with no platform-product surface → score_success ≤ 3
- Supply chain / logistics / manufacturing ops PM → score_success ≤ 3
- JD says "deep expertise in X" where X is outside AI/ML, compliance, PMO, monetization, or cloud/software infra → reduce score_success by 1-2 from baseline

**Brand inflation guard:** High-brand companies (Google, Meta, Amazon, NVIDIA) make attractiveness (score) higher, but do NOT inflate score_success. Score each dimension independently. A wrong role at a great company still has low score_success.

**Gap compensation framework (MANDATORY for score_success 4-6):**
When a gap exists, score_success 4+ requires an explicit compensating reason in score_reason. "TPM skills are transferable" alone is NOT sufficient. You must identify one of:

1. **Candidate has a unique advantage the JD specifically asks for:**
   - Executive/C-suite collaboration → candidate has direct senior executive advisory experience
   - Enterprise/Fortune 500 client management → candidate ran 30+ enterprise AI PoCs (Visa, BMW, Unilever)
   - Algorithm/ML training pipeline experience → candidate has hands-on model lifecycle (training, fine-tuning, evaluation, deployment)
   - Compliance/regulatory program leadership → candidate has 5-year zero-incident record across 6 regulatory domains
   - On-device/embedded systems → candidate shipped 3 generations of XR devices with real-time/power constraints
   - Content safety / responsible AI → candidate built content safety review frameworks and responsible AI integration
   - Ads monetization / data pipeline → candidate built recall/ranking pipeline, data warehouse, A/B experimentation from zero

2. **Company hiring bar is lower (makes gap acceptable):**
   - Small company (<200 employees) or startup → likely won't find a perfect candidate; transferable skills may suffice
   - Understaffed team / urgent backfill → may accept transferable skills
   - BUT: small unknown companies with boilerplate JDs and no career value → skip regardless

3. **Company hiring bar is HIGH (makes gap harder to accept):**
   - FAANG / top-tier tech (Google, Meta, Apple, Amazon) → only near-perfect matches score 5+
   - Roles with explicit "required" domain expertise → treat as hard gap unless candidate has direct experience
   - Companies with long cooldown (≥6 months) → gap + cooldown = higher risk, be more conservative

If you cannot identify a specific compensating reason, the gap should reduce score_success below 4 (→ skip).

**H-1B practical blockers (auto-skip to score_success ≤ 3):**
- Staffing agencies / body shops (TEKsystems, Spectraforce, Marlabs, Coforge, Incedo, Centraprise, SGA, etc.) → H-1B transfer to staffing agencies is near-impossible in practice.
- JD says "no sponsorship" / "must be authorized to work without sponsorship" → score_success ≤ 2.
- Tiny unverifiable companies with generic JDs → unlikely to sponsor H-1B.

**Wrong role type (≠ TPM/PM — score_success ≤ 3 unless candidate has direct domain experience):**
- HR/People PM, Training/L&D PM (unless candidate has content safety/responsible AI experience)
- GTM/Revenue Ops PM, Field Operations PM, Customer Implementation PM
- Analyst titles (not PM/TPM level)
- Do NOT score these based on "cross-functional coordination transfers" alone.

**Day-to-day reasoning requirement (MANDATORY for score_success 4-6):**
For score_success 4-6, score_reason MUST state what the candidate would actually do day-to-day in this role and why that matches (or doesn't match) their background. Generic "TPM skills transfer" is not sufficient.

${SHARED_SCORING_RULES}`;

export const DEFAULT_CALIBRATION_EXAMPLES = `## Calibration (score / score_success)
**Strong matches:**
- NVIDIA TPM AI Portfolio = 9/8 (direct AI/ML match)
- OpenAI Security/Compliance TPM = 9/7 (compliance depth + frontier AI company)
- Netflix TPM5 Cross-functional = 9/7 (top comp, cross-functional TPM)
- Discord Staff TPM Compliance = 8/7 (staff level + compliance depth)
- Google AI PM = 8/6 (good brand but broad role, moderate domain gap)
- HP Ads Monetization = 7/7 (candidate built the same pipeline)

**Brand-parity laterals (rule 5b — Senior or plain TPM at higher-brand co from Oppo Staff; apply +1 brand-parity bonus):**
- OpenAI Senior TPM, safety/compliance = 9/8 (realistic lateral; frontier AI brand + domain match + brand-parity +1)
- Google Senior TPM, AI infra = 9/7 (lateral step-down to FAANG; AI-infra match + brand-parity +1)
- Pinterest Sr. TPM, ads platform = 8/7 (second-tier brand; monetization match + brand-parity +1)
- Databricks L5 TPM, ML platform = 8/7 (AI-focused second-tier brand; cloud/AI-infra match + brand-parity +1)
- Microsoft Senior PM, Copilot = 8/6 (higher-brand co; Copilot PM ≠ candidate's core specialty, but +1 bonus lifts 5 → 6)
- Google Technical Program Manager (plain, no prefix) = 9/7 (plain TPM at FAANG is mid-level and 2 levels below Oppo Staff — realistic lateral, +1 brand-parity)
- Adobe Program Manager (plain) = 8/7 (plain PM at second-tier brand; +1 brand-parity; do NOT tag overqualified)

**Borderline — use these to calibrate the 3-5 range:**
- Crusoe Cloud Product TPM = 6/5 (good company, different TPM specialty but still product delivery)
- Amazon TPM Supply Chain Ops = 5/3 (brand attractive, but domain=ops/logistics not tech; domain_gap:major + different day-to-day → score_success 3, NOT 4-5)
- Meta AI Infrastructure TPM = 8/6 (software infra at AI-leader; candidate's cloud-migration background applies — evaluate normally, do NOT tag domain_gap)
- Google Cloud TPM, BGP/L2 protocol-deep = 5/3 (low-level networking-gear engineering, hardware-adjacent — penalty applies. NOTE: general cloud/networking PM does NOT trigger this; only protocol-deep work)

**Gap WITH compensation (score_success 4-5):**
- Google Pixel Security TPM = 8/5 (embedded systems gap, BUT candidate shipped 3 gen XR devices + has security/compliance depth → compensating advantage offsets domain gap)
- xAI Safety Ops PM = 6/5 (training/QA role type gap, BUT candidate has content safety frameworks + responsible AI integration → direct domain overlap compensates)
- Small startup SaaS PM = 5/5 (domain gap, but small company with lower hiring bar → gap acceptable, startup may value versatile TPM)

**Gap WITHOUT compensation (→ skip):**
- Google Cloud Regulatory Affairs = 8/3 (requires 8yr regulatory affairs + financial services frameworks → no compensating experience, and Google has very high hiring bar)
- DoorDash HR Ops PM = 5/3 (wrong role type + no HR domain experience + low comp → no compensation)
- Staffing agency contract (any) = any/3 (H-1B transfer blocker, regardless of skill match)
- Tiny unknown company generic PM = 3/3 (no career value, no H-1B likelihood, boilerplate JD)

**Software infra & healthy-startup anchors (use these to calibrate boost & guard against over-rejection):**
- Series-B AI startup, AI Platform TPM (verified funding, not top-tier brand) = 7/7 (software infra is candidate's strength; rule 4b +1 for low-hiring-bar realism)
- Series-C AI startup, Compute Resource Programs TPM = 7/7 (compute / training-strategy work matches candidate; rule 4b +1)
- Series-A AI startup, Cross-functional TPM, generic JD but verified funding = 6/6 (verified funding ≠ unverifiable; rule 4 borderline boost 5→6 applies; do NOT auto-skip as "tiny unverifiable")
- Top-tier AI co (OpenAI/Anthropic-tier), Cross-functional TPM = 9/5 (FAANG-equivalent hiring bar + cooldown risk; no startup boost — same calibration as Google. NOT a comment on company quality.)

**Small-co strong-match realism anchors (rule 4b — small/funded co responsibilities match candidate; higher hit rate than FAANG Director doing same work):**
- Anaconda Senior TPM (Series C, ~500 emp, AI infra) = 7/7 (strong_match on PI planning / ambiguous-env program building / AI tooling; rule 4b +1)
- ProRata.ai Principal PM (Series B, ~100 emp, AdTech) = 7/8 (direct ads monetization domain match — candidate built the same pipeline; rule 4b +1 + core-domain match pushes to 8)
- Netomi Senior TPM (Series B, agentic AI SaaS) = 6/7 (CTO-partner TPM at AI-native SaaS; AI/ML + agentic delivery match; rule 4b +1)
- Character.AI TPM (Series A, top-AI-labs list — NO rule 4b since it's BRAND_ABOVE_OPPO) = 7/6 (still good skill match, but 4b doesn't apply at top-tier AI labs; rule 5b applies since plain TPM at above-Oppo brand → +1 brand-parity = 7)
- Generic Series B SaaS TPM, boilerplate JD, no clear AI / ads / PMO core-strength match = 5/4 (verified funding avoids "tiny unverifiable" penalty, but without strong_match the rule 4b doesn't trigger; falls back to rule 4 borderline only)

**Hard blockers:**
- NVIDIA Principal Infra = 3/1 (physical DC builds, hard blocker)
- Top-tier AI co DC Infrastructure TPM (network/whitespace/power) = 8/2 (physical DC build + power planning — hardware hard cap regardless of company brand)`;

export const DEFAULT_CANDIDATE_PROFILE = `## Candidate Profile
Staff-level TPM at Oppo (mid-tier Chinese consumer electronics brand; low US tech-market recognition relative to FAANG / top AI labs / well-known US tech second-tier). 10+ YoE productizing AI/ML research into shipped products. H-1B visa holder.

**Core strengths (high score_success when JD asks for these):**
- Cloud architecture & large-scale migration: formal cloud degree + production cloud migration / re-architecture experience — software infra (cloud / AI / ML / data infra, compute resource mgmt, training strategy) is a STRENGTH, not a gap
- AI/ML cross-functional R&D delivery: 23 programs, 20+ production features across CV, GenAI, ads
- PMO governance: built and ran virtual PMO steering 80+ engineers (300+ extended) with ~3.5 FTE overhead
- Executive collaboration: direct decision-support partner for senior executive on strategy and resource prioritization
- Compliance/regulatory: 5-year zero-incident record across 6 domains (GDPR, EO 14117, EAR, CISA, PIPL, data localization)
- Ads monetization: built recall/ranking pipeline, data warehouse (ODS→DWD→DWS→ADS), A/B experimentation from zero; $1.5-2M annualized uplift
- Enterprise AI consulting: 30+ PoCs across Fortune 500 clients (Visa, BMW, Unilever, J&J, Honda) — structurally equivalent to AI capability externalization / partner delivery
- On-device/embedded: 3 generations XR devices — visual SLAM (quad-cam VIO), 6DoF tracking, stereo depth, multi-camera calibration, NPI lifecycle, real-time/power constraints
- Content safety & responsible AI: multi-layer risk assessment (internal/external/UGC/AI-generated), escalation architecture with decision-authority matrices, AI lifecycle integration
- Compliance deep-dive: EO 14117 — undefined scope recovery under Congressional inquiry, 50+ critical remediations delivered by original deadline
- Benchmark/dataset coordination: scoped requirements, organized model evaluation cycles with research leads (Proactive AI: always-on perception, low-compute)
- AI-native tooling: agentic workflows, LLM pipelines, structured evaluation, prompt tuning

**NOT strong in (penalize score_success when JD requires these):**
- Hardware design (silicon, PCB, mechanical, power/electrical), low-level networking-gear engineering (BGP/L2/L3 protocol-deep), pure on-call/oncall infra ops
- Healthcare/medical device regulations (FDA, ISO 14971, IEC 62304)
- Financial services regulatory affairs (bank examiner, regulator engagement)
- Supply chain / logistics / manufacturing operations
- HR/people ops, GTM/revenue operations (unless candidate's adjacent experience compensates)`;

export const DEFAULT_SCORE_TAGS = `Negative (indicate weaknesses):
- **downpay**: Salary significantly below market/expectations
- **down_level**: Role TITLE/LEVEL is clearly below candidate (e.g., Associate, Junior, Coordinator, L4/TPM II). This is the PRIMARY signal that should reduce score_success — senior titles (Staff/Principal/Director/VP) are score_success neutral, but down_level titles DO reduce it. Do NOT use for domain mismatch — use domain_gap tags instead. Does NOT apply to "Senior / L5 at higher-brand company" — that is a brand-parity lateral (rule 5b), not a down-level penalty.
- **skill_gap**: Missing key required technical skills
- **exp_gap**: Significantly under the years-of-experience requirement

Domain gap (use exactly ONE if applicable — judge by severity, not industry name):
- **domain_gap:minor**: Different industry but day-to-day work is very similar to candidate's experience (e.g., TPM in fintech vs adtech). Skills transfer directly; just different business context.
- **domain_gap:major**: Role requires significant domain knowledge candidate lacks, but it is NOT a hard blocker — candidate could ramp up (e.g., healthcare compliance PM, financial regulations, data governance).
- **domain_gap:blocker**: Domain expertise is a hard requirement that cannot realistically be bridged. The role's daily work is fundamentally different (e.g., hardware chip design, physical construction management, clinical research, pure electrical engineering).

Domain gap severity depends on TWO dimensions:
1. What the COMPANY does (industry) — less important
2. What the ROLE does day-to-day (MORE important) — pure software coordination vs hardware-software mix vs completely non-tech work. A TPM at a hardware company doing software project coordination is minor gap; a TPM doing silicon tape-out scheduling is blocker.

Positive (indicate strengths):
- **strong_match**: Excellent alignment across skills, experience, and domain
- **rare_opportunity**: Unusual/niche role worth pursuing even if not perfect match

Risk (indicate caution):
- **cooldown_risk**: Company has significant cooldown period; failure would block future applications
- **overqualified**: Candidate clearly exceeds requirements AT THE SAME OR LOWER BRAND TIER. Do NOT apply for Senior / L5 roles at higher-brand companies (FAANG / top AI / well-known second-tier) — those are brand-parity laterals (rule 5b), not over-qualifications.`;
