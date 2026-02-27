export type ApplicationStrategy = 'open' | 'cautious' | 'blocked' | 'no_h1b';

export const APPLICATION_STRATEGIES: readonly ApplicationStrategy[] = [
  'open', 'cautious', 'blocked', 'no_h1b',
] as const;

export type CompanyInfoStatus = 'pending' | 'complete';

export interface Company {
  id: number;
  name: string;
  display_name: string;
  website: string | null;
  industry: string | null;
  size: string | null;
  description: string | null;
  ai_summary: string | null;
  application_strategy: ApplicationStrategy;
  strategy_reason: string | null;
  application_limit: number | null;
  info_status: CompanyInfoStatus;
  chinese_affinity: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyInsert {
  name: string;
  display_name: string;
  website?: string | null;
  industry?: string | null;
  size?: string | null;
  description?: string | null;
  ai_summary?: string | null;
  application_strategy?: ApplicationStrategy;
  strategy_reason?: string | null;
  application_limit?: number | null;
  chinese_affinity?: number | null;
  info_status?: CompanyInfoStatus;
  notes?: string | null;
}

export interface CompanyUpdate {
  display_name?: string;
  website?: string | null;
  industry?: string | null;
  size?: string | null;
  description?: string | null;
  ai_summary?: string | null;
  application_strategy?: ApplicationStrategy;
  strategy_reason?: string | null;
  application_limit?: number | null;
  chinese_affinity?: number | null;
  info_status?: CompanyInfoStatus;
  notes?: string | null;
}
