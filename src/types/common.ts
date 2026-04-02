export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
}

export interface ParseResult<T> {
  items: T[];
  warnings: string[];
}

export type OperationType =
  | 'status_change'
  | 'crawl'
  | 'jd_fetch'
  | 'import'
  | 'evaluate'
  | 'company_update'
  | 'company_merge'
  | 'score_update'
  | 'visa_scan'
  | 'merge';

export type OperationEntityType = 'job' | 'company' | 'batch';

export type OperationTrigger = 'system' | 'user' | 'crawl' | 'import' | 'rule_engine';

export interface OperationLog {
  id: number;
  operation: OperationType;
  entity_type: OperationEntityType;
  entity_id: number | null;
  trigger: OperationTrigger;
  details: Record<string, unknown>;
  created_at: string;
  job_title?: string | null;
  company_name?: string | null;
}

export interface OperationLogInsert {
  operation: OperationType;
  entity_type: OperationEntityType;
  entity_id?: number | null;
  trigger: OperationTrigger;
  details?: Record<string, unknown>;
}

export interface RuleResult {
  action: 'exclude' | 'include' | 'flag' | 'protect' | 'pass';
  matchedRules: Array<{ id: number; name: string; action: string }>;
  reason?: string;
}

export interface DedupResult {
  isDuplicate: boolean;
  matchType: 'source_id' | 'exact' | 'fuzzy' | 'content' | null;
  matchedJobId?: number;
  /** When true, the candidate has new location(s) that should be merged into the matched job */
  mergeLocations?: string[];
}
