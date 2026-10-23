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
  /** 操作发生时的默认返回值快照；升级前的旧记录可能为 null。 */
  default_value: boolean | null;
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
  /** 按启停状态筛选；统计汇总不受该参数影响。 */
  enabled?: boolean;
  page?: number;
  page_size?: number;
}

/** GET /api/v1/flags 在环境与搜索条件上的启停统计，不受 enabled 筛选影响。 */
export interface FlagStats {
  all: number;
  enabled: number;
  disabled: number;
}

export interface FlagListResult {
  items: Flag[];
  total: number;
  stats: FlagStats;
}

/** 全局审计接口支持的 action_type 过滤值（SPEC 第 9 条）。 */
export type AuditActionType = 'FLAG_CREATED' | 'FLAG_UPDATED' | 'FLAG_TOGGLED' | 'RULES_SYNCED';

/** GET /api/v1/audit-logs 的查询参数；未设置的过滤条件不出现在 URL 上。 */
export interface GlobalAuditLogQuery {
  page?: number;
  page_size?: number;
  environment?: Environment;
  flag_key?: string;
  action_type?: AuditActionType;
}

/** GET /api/v1/audit-logs 的响应体，分页信息以服务端返回为准。 */
export interface GlobalAuditLogResult {
  items: AuditLog[];
  total: number;
  page: number;
  page_size: number;
}

export type EvaluationReason = 'RULE_MATCH' | 'DEFAULT_FALLBACK' | 'FLAG_DISABLED';

export interface MatchedRuleInfo {
  id: number;
  priority: number;
  attribute_name: string;
  operator: RuleOperator;
  expected_value: unknown;
  return_value: boolean;
}

export interface EvaluationPayload {
  flag_key: string;
  environment: Environment;
  context: Record<string, unknown>;
}

export interface EvaluationResult {
  flag_key: string;
  environment: Environment;
  enabled: boolean;
  result: boolean;
  reason: EvaluationReason;
  matched_rule: MatchedRuleInfo | null;
}

