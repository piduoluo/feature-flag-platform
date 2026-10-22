export type Environment = 'development' | 'staging' | 'production';

export interface Flag {
  id: number;
  key: string;
  name: string;
  description: string;
  environment: Environment;
  enabled: boolean;
  default_value: boolean;
  created_at: string;
  updated_at: string;
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
