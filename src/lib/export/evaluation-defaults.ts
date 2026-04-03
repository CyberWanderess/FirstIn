/**
 * Default prompt sections for job evaluation.
 * These are used when the user has not customized their templates in Settings.
 */

export const DEFAULT_SCORING_GUIDANCE = `**score_success calibration — avoid systematic underscoring:**
- TPM/PM is a transferable skill. Domain gap alone should NOT drop score_success below 4. Domain can be learned; cross-functional orchestration ability cannot.
- If JD emphasizes cross-functional coordination, stakeholder management, delivery under ambiguity → candidate's CORE strengths, add +1-2 to score_success.
- H1B: only penalize if JD explicitly says no sponsorship. If unknown (most cases), treat as neutral.
- score_success 8-9: Direct skill + domain + level match
- score_success 6-7: Good skill match, minor gap (domain or level)
- score_success 4-5: Transferable skills, notable gap but realistic shot
- score_success 1-3: Hard blockers (no visa, citizenship, physical construction) or fundamental mismatch`;

export const DEFAULT_CALIBRATION_EXAMPLES = `## Calibration (score / score_success)
- NVIDIA TPM AI Portfolio = 9/8 (direct AI/ML match)
- OpenAI Security/Compliance TPM = 9/7 (compliance depth + frontier AI company)
- Netflix TPM5 Cross-functional = 9/7 (top comp, cross-functional TPM)
- Google AI PM = 8/6 (good brand but broad role, moderate domain gap)
- HP Ads Monetization = 7/7 (candidate built the same pipeline at OPPO)
- Crusoe Cloud Product TPM = 6/5 (good company, different TPM specialty)
- NVIDIA Principal Infra = 3/1 (physical DC builds, hard blocker)`;

export const DEFAULT_SCORE_TAGS = `Negative (indicate weaknesses):
- **downpay**: Salary significantly below market/expectations
- **down_level**: Role TITLE/LEVEL is clearly below candidate (e.g., Associate, Junior, Coordinator, L4/TPM II). Do NOT use for domain mismatch — use domain_gap instead.
- **skill_gap**: Missing key required technical skills
- **domain_gap**: No experience in the required industry/domain
- **exp_gap**: Significantly under the years-of-experience requirement

Positive (indicate strengths):
- **strong_match**: Excellent alignment across skills, experience, and domain
- **rare_opportunity**: Unusual/niche role worth pursuing even if not perfect match

Risk (indicate caution):
- **cooldown_risk**: Company has significant cooldown period; failure would block future applications
- **overqualified**: Candidate clearly exceeds requirements`;
