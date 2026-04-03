export type RuleOperator =
  | 'contains'
  | 'not_contains'
  | 'regex'
  | 'lt'
  | 'gt'
  | 'eq'
  | 'in'
  | 'not_in'
  | 'any_in';

export const RULE_OPERATORS: readonly RuleOperator[] = [
  'contains', 'not_contains', 'regex', 'lt', 'gt', 'eq', 'in', 'not_in', 'any_in',
] as const;

export type RuleAction = 'exclude' | 'include' | 'flag' | 'protect';

export const RULE_ACTIONS: readonly RuleAction[] = ['exclude', 'include', 'flag', 'protect'] as const;

export interface FilterRule {
  id: number;
  name: string;
  field: string;
  operator: RuleOperator;
  value: string;
  action: RuleAction;
  priority: number;
  enabled: number; // SQLite boolean: 0 or 1
  created_at: string;
}

export interface FilterRuleInsert {
  name: string;
  field: string;
  operator: RuleOperator;
  value: string;
  action: RuleAction;
  priority: number;
  enabled?: number;
}

export interface FilterRuleUpdate {
  name?: string;
  field?: string;
  operator?: RuleOperator;
  value?: string;
  action?: RuleAction;
  priority?: number;
  enabled?: number;
}
