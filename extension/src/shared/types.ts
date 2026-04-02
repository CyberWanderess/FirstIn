export interface JobPayload {
  title: string;
  company_name: string;
  location?: string[];
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  work_mode?: string;
  jd_url?: string;
  apply_url?: string;
  jd_full_text?: string;
  source: 'linkedin' | 'indeed';
  source_id?: string;
  posted_at?: string;
}

export interface SaveResponse {
  saved: boolean;
  duplicate: boolean;
  jobId?: number;
  status?: string;
  matchType?: string;
  matchedJobId?: number;
}

export interface CheckResponse {
  exists: boolean;
  jobId?: number;
  status?: string;
  statusLabel?: string;
  matchType?: string;
}

export interface StatsResponse {
  statusCounts: Record<string, number>;
  recentJobs: Array<{
    id: number;
    title: string;
    company_name: string;
    status: string;
    created_at: string;
  }>;
}

export interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
