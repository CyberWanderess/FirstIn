export interface SearchConfig {
  id: number;
  name: string;
  platform: string;
  query_params: Record<string, unknown>;
  schedule: string | null;
  enabled: number;
  last_run_at: string | null;
  last_run_result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface SearchConfigInsert {
  name: string;
  platform?: string;
  query_params: Record<string, unknown>;
  schedule?: string | null;
  enabled?: number;
}

export interface SearchConfigUpdate {
  name?: string;
  platform?: string;
  query_params?: Record<string, unknown>;
  schedule?: string | null;
  enabled?: number;
  last_run_at?: string | null;
  last_run_result?: Record<string, unknown> | null;
}
