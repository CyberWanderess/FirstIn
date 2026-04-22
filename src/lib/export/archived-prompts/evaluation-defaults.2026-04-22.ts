/**
 * Default prompt sections for job evaluation.
 * These are used when the user has not customized their templates in Settings.
 */

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
- Hardware/physical infra TPM (silicon tape-out, DC build-out, facilities management) → score_success ≤ 2, regardless of company brand
- Cloud platform engineering TPM (infrastructure/platform team, not product delivery) → score_success ≤ 4 maximum
- Pure DevOps/SRE/networking PM → score_success ≤ 3
- Supply chain / logistics / manufacturing ops PM → score_success ≤ 3
- JD says "deep expertise in X" where X is outside AI/ML, compliance, PMO, or monetization → reduce score_success by 1-2 from baseline

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
For score_success 4-6, score_reason MUST state what the candidate would actually do day-to-day in this role and why that matches (or doesn't match) their background. Generic "TPM skills transfer" is not sufficient.`;

export const DEFAULT_CALIBRATION_EXAMPLES = `## Calibration (score / score_success)
**Strong matches:**
- NVIDIA TPM AI Portfolio = 9/8 (direct AI/ML match)
- OpenAI Security/Compliance TPM = 9/7 (compliance depth + frontier AI company)
- Netflix TPM5 Cross-functional = 9/7 (top comp, cross-functional TPM)
- Discord Staff TPM Compliance = 8/7 (staff level + compliance depth)
- Google AI PM = 8/6 (good brand but broad role, moderate domain gap)
- HP Ads Monetization = 7/7 (candidate built the same pipeline)

**Borderline — use these to calibrate the 3-5 range:**
- Crusoe Cloud Product TPM = 6/5 (good company, different TPM specialty but still product delivery)
- Amazon TPM Supply Chain Ops = 5/3 (brand attractive, but domain=ops/logistics not tech; domain_gap:major + different day-to-day → score_success 3, NOT 4-5)
- Meta Infra Platform TPM = 6/3 (brand + AI company inflates score, but role is pure infra — not product delivery; domain_gap:major)
- Google Cloud TPM (networking) = 5/3 (brand, but JD requires deep networking expertise — "deep expertise in X" rule applies)

**Gap WITH compensation (score_success 4-5):**
- Google Pixel Security TPM = 8/5 (embedded systems gap, BUT candidate shipped 3 gen XR devices + has security/compliance depth → compensating advantage offsets domain gap)
- xAI Safety Ops PM = 6/5 (training/QA role type gap, BUT candidate has content safety frameworks + responsible AI integration → direct domain overlap compensates)
- Small startup SaaS PM = 5/5 (domain gap, but small company with lower hiring bar → gap acceptable, startup may value versatile TPM)

**Gap WITHOUT compensation (→ skip):**
- Google Cloud Regulatory Affairs = 8/3 (requires 8yr regulatory affairs + financial services frameworks → no compensating experience, and Google has very high hiring bar)
- DoorDash HR Ops PM = 5/3 (wrong role type + no HR domain experience + low comp → no compensation)
- Staffing agency contract (any) = any/3 (H-1B transfer blocker, regardless of skill match)
- Tiny unknown company generic PM = 3/3 (no career value, no H-1B likelihood, boilerplate JD)

**Hard blockers:**
- NVIDIA Principal Infra = 3/1 (physical DC builds, hard blocker)`;

export const DEFAULT_CANDIDATE_PROFILE = `## Candidate Profile
Staff-level TPM, 10+ YoE productizing AI/ML research into shipped products. H-1B visa holder.

**Core strengths (high score_success when JD asks for these):**
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
- Hardware design (silicon, PCB, mechanical), pure DevOps/SRE/networking
- Healthcare/medical device regulations (FDA, ISO 14971, IEC 62304)
- Financial services regulatory affairs (bank examiner, regulator engagement)
- Supply chain / logistics / manufacturing operations
- HR/people ops, GTM/revenue operations (unless candidate's adjacent experience compensates)`;

export const DEFAULT_SCORE_TAGS = `Negative (indicate weaknesses):
- **downpay**: Salary significantly below market/expectations
- **down_level**: Role TITLE/LEVEL is clearly below candidate (e.g., Associate, Junior, Coordinator, L4/TPM II). Do NOT use for domain mismatch — use domain_gap tags instead.
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
- **overqualified**: Candidate clearly exceeds requirements`;
