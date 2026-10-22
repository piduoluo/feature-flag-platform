import {
  ApiResponse,
  AuditLog,
  CreateFlagPayload,
  EvaluationPayload,
  EvaluationResult,
  Flag,
  FlagListQuery,
  FlagListResult,
  Rule,
  UpdateFlagPayload,
} from '../types';

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  let jsonResult: ApiResponse<T>;
  try {
    jsonResult = await response.json();
  } catch (err) {
    throw new ApiError('NETWORK_ERROR', '服务器响应异常，无法解析 JSON', response.status);
  }

  if (!response.ok || jsonResult.code !== 'SUCCESS') {
    throw new ApiError(
      jsonResult.code || 'UNKNOWN_ERROR',
      jsonResult.message || '请求执行失败',
      response.status
    );
  }

  return jsonResult.data;
}

export const api = {
  getFlags: async (query?: FlagListQuery): Promise<FlagListResult> => {
    const params = new URLSearchParams();
    if (query?.environment) params.append('environment', query.environment);
    if (query?.search) params.append('search', query.search);
    if (query?.page) params.append('page', String(query.page));
    if (query?.page_size) params.append('page_size', String(query.page_size));

    const qs = params.toString();
    return request<FlagListResult>(`/api/v1/flags${qs ? `?${qs}` : ''}`);
  },

  createFlag: async (payload: CreateFlagPayload): Promise<Flag> => {
    return request<Flag>('/api/v1/flags', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getFlag: async (id: number): Promise<Flag> => {
    return request<Flag>(`/api/v1/flags/${id}`);
  },

  updateFlag: async (id: number, payload: UpdateFlagPayload): Promise<Flag> => {
    return request<Flag>(`/api/v1/flags/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  toggleFlag: async (id: number, enabled: boolean): Promise<Flag> => {
    return request<Flag>(`/api/v1/flags/${id}/toggle`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
  },

  getAuditLogs: async (id: number): Promise<AuditLog[]> => {
    return request<AuditLog[]>(`/api/v1/flags/${id}/audit-logs`);
  },

  syncRules: async (flagId: number, rules: Rule[]): Promise<Rule[]> => {
    return request<Rule[]>(`/api/v1/flags/${flagId}/rules`, {
      method: 'PUT',
      body: JSON.stringify({
        rules: rules.map((r) => ({
          ...(r.id ? { id: r.id } : {}),
          attribute_name: r.attribute_name,
          operator: r.operator,
          expected_value: r.expected_value,
          return_value: r.return_value,
          priority: r.priority,
        })),
      }),
    });
  },

  evaluate: async (payload: EvaluationPayload): Promise<EvaluationResult> => {
    return request<EvaluationResult>('/api/v1/evaluations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
