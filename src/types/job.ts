export type JobStatus =
  | 'pending_eval'
  | 'flagged'
  | 'pending_deep_analysis'
  | 'ready_to_apply_tailored'
  | 'ready_to_apply'
  | 'applied'
  | 'interviewing'
  | 'offer'
  | 'rejected_resume'
  | 'archived_filtered'
  | 'archived_low_match'
  | 'archived_no_response'
  | 'archived_manual';

export const JOB_STATUSES: readonly JobStatus[] = [
  'pending_eval', 'flagged', 'pending_deep_analysis', 'ready_to_apply_tailored',
  'ready_to_apply', 'applied', 'interviewing', 'offer', 'rejected_resume',
  'archived_filtered', 'archived_low_match', 'archived_no_response', 'archived_manual',
] as const;

export const STATUS_LABELS: Record<string, string> = {
  pending_eval: 'Pending Eval',
  flagged: 'Flagged',
  pending_deep_analysis: 'Deep Analysis',
  ready_to_apply_tailored: 'Tailoring',
  ready_to_apply: 'Ready to Apply',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected_resume: 'Rejected (Resume)',
  archived_filtered: 'Archived (Filtered)',
  archived_low_match: 'Archived (Low Match)',
  archived_no_response: 'Archived (No Response)',
  archived_manual: 'Archived (Manual)',
};

export type ScoreTag =
  | 'downpay' | 'down_level' | 'skill_gap' | 'exp_gap'
  | 'domain_gap:minor' | 'domain_gap:major' | 'domain_gap:blocker'
  | 'strong_match' | 'rare_opportunity'
  | 'cooldown_risk' | 'overqualified';

export const SCORE_TAGS: readonly ScoreTag[] = [
  'downpay', 'down_level', 'skill_gap', 'exp_gap',
  'domain_gap:minor', 'domain_gap:major', 'domain_gap:blocker',
  'strong_match', 'rare_opportunity',
  'cooldown_risk', 'overqualified',
] as const;

export type JdFetchStatus = 'pending' | 'success' | 'failed';

export interface Job {
  id: number;
  company_id: number;
  title: string;
  location: string[];
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  work_mode: string | null;
  commitment: string | null;
  jd_url: string | null;
  apply_url: string | null;
  jd_full_text: string | null;
  jd_fetch_status: JdFetchStatus;
  jd_content_hash: string | null;
  source: string;
  source_id: string | null;
  status: JobStatus;
  score: number | null;
  score_success: number | null;
  score_reason: string | null;
  deep_analysis: string | null;
  visa_sponsorship: string | null;
  score_tags: string[] | null;
  posted_at: string | null;
  resume_tailored: boolean | null;
  has_referral: boolean | null;
  notes: string | null;
  qa_flagged: number;
  qa_notes: string | null;
  created_at: string;
  updated_at: string;
  status_changed_at: string;
}

export interface JobWithCompany extends Job {
  company_name: string;
  company_display_name: string;
  company_industry: string | null;
  company_size: string | null;
  company_description: string | null;
  company_ai_summary: string | null;
  application_strategy: string;
  strategy_reason: string | null;
  application_limit: number | null;
  limit_period_months: number | null;
  cooldown_months: number | null;
  funding_round: string | null;
  chinese_affinity: number | null;
  company_active_jobs?: number;
  company_total_jobs?: number;
}

export interface JobInsert {
  company_id?: number;
  company_name?: string;
  title: string;
  location: string[];
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string;
  work_mode?: string | null;
  commitment?: string | null;
  jd_url?: string | null;
  apply_url?: string | null;
  jd_full_text?: string | null;
  jd_fetch_status?: JdFetchStatus;
  jd_content_hash?: string | null;
  source: string;
  source_id?: string | null;
  status?: JobStatus;
  score?: number | null;
  score_success?: number | null;
  score_reason?: string | null;
  deep_analysis?: string | null;
  visa_sponsorship?: string | null;
  posted_at?: string | null;
  notes?: string | null;
}

export interface JobUpdate {
  title?: string;
  location?: string[];
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string;
  work_mode?: string | null;
  commitment?: string | null;
  jd_url?: string | null;
  apply_url?: string | null;
  jd_full_text?: string | null;
  jd_fetch_status?: JdFetchStatus;
  jd_content_hash?: string | null;
  status?: JobStatus;
  score?: number | null;
  score_success?: number | null;
  score_reason?: string | null;
  deep_analysis?: string | null;
  visa_sponsorship?: string | null;
  score_tags?: string[] | null;
  resume_tailored?: boolean | null;
  has_referral?: boolean | null;
  notes?: string | null;
  qa_flagged?: number;
  qa_notes?: string | null;
}
