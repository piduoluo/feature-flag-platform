export type Environment = 'development' | 'staging' | 'production';

export type RuleOperator = 'equals' | 'in';

export interface Rule {
  id?: number;
  flag_id?: number;
  attribute_name: string;
  operator: RuleOperator;
  expected_value: unknown;
  return_value: boolean;
  priority: number;
  created_at?: string;
  updated_at?: string;
}

export interface Flag {
  id: number;
  key: string;
  name: string;
  description: string;
  environment: Environment;
  enabled: boolean;
  default_value: boolean;
  rules?: Rule[];
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: number;
  flag_id: number;
  flag_key: string;
  environment: Environment;
  action_type: 'FLAG_CREATED' | 'FLAG_UPDATED' | 'FLAG_TOGGLED' | 'RULES_SYNCED' | string;
  operator: string;
  diff_summary: Record<string, unknown>;
  created_at: string;
}

export interface ApiResponse<T> {
  code: string;
  message: string;
  data: T;
}

export interface CreateFlagPayload {
  key: string;
  name: string;
  description?: string;
  environment: Environment;
  default_value?: boolean;
}

export interface UpdateFlagPayload {
  name: string;
  description?: string;
  default_value: boolean;
}

export interface SyncRulesPayload {
  rules: {
    id?: number;
    attribute_name: string;
    operator: RuleOperator;
    expected_value: unknown;
    return_value: boolean;
    priority: number;
  }[];
}

export interface FlagListQuery {
  environment?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface FlagListResult {
  items: Flag[];
  total: number;
}
