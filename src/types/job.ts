export type JobStatus =
  | 'new'
  | 'pending_eval'
  | 'pending_deep_analysis'
  | 'analyzed'
  | 'ready_to_apply'
  | 'applied'
  | 'interviewing'
  | 'offer'
  | 'rejected'
  | 'archived_filtered'
  | 'archived_low_match'
  | 'archived_no_response';

export const JOB_STATUSES: readonly JobStatus[] = [
  'new', 'pending_eval', 'pending_deep_analysis', 'analyzed',
  'ready_to_apply', 'applied', 'interviewing', 'offer', 'rejected',
  'archived_filtered', 'archived_low_match', 'archived_no_response',
] as const;

export type JdFetchStatus = 'pending' | 'success' | 'failed';

export interface Job {
  id: number;
  company_id: number;
  title: string;
  location: string[];
  salary_min: number | null;
  salary_max: number | null;
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
  score_reason: string | null;
  deep_analysis: string | null;
  visa_sponsorship: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  status_changed_at: string;
}

export interface JobWithCompany extends Job {
  company_name: string;
  company_display_name: string;
  application_strategy: string;
  strategy_reason: string | null;
  application_limit: number | null;
  chinese_affinity: number | null;
}

export interface JobInsert {
  company_id?: number;
  company_name?: string;
  title: string;
  location: string[];
  salary_min?: number | null;
  salary_max?: number | null;
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
  score_reason?: string | null;
  deep_analysis?: string | null;
  visa_sponsorship?: string | null;
  notes?: string | null;
}

export interface JobUpdate {
  title?: string;
  location?: string[];
  salary_min?: number | null;
  salary_max?: number | null;
  work_mode?: string | null;
  commitment?: string | null;
  jd_url?: string | null;
  apply_url?: string | null;
  jd_full_text?: string | null;
  jd_fetch_status?: JdFetchStatus;
  jd_content_hash?: string | null;
  status?: JobStatus;
  score?: number | null;
  score_reason?: string | null;
  deep_analysis?: string | null;
  visa_sponsorship?: string | null;
  notes?: string | null;
}
