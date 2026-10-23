import React from 'react';
import { Environment } from '../types';

export const ENV_LABELS: Record<Environment, string> = {
  development: 'Development',
  staging: 'Staging',
  production: 'Production',
};

export const ENV_FILTER_OPTIONS: { label: string; value: 'all' | Environment }[] = [
  { label: '全部环境', value: 'all' },
  { label: ENV_LABELS.development, value: 'development' },
  { label: ENV_LABELS.staging, value: 'staging' },
  { label: ENV_LABELS.production, value: 'production' },
];

export const ENV_SELECT_OPTIONS: { label: string; value: Environment }[] = [
  { label: ENV_LABELS.development, value: 'development' },
  { label: ENV_LABELS.staging, value: 'staging' },
  { label: ENV_LABELS.production, value: 'production' },
];

export function formatEnvironmentLabel(env?: string): string {
  if (!env) return '—';
  const normalized = env.trim().toLowerCase() as Environment;
  return ENV_LABELS[normalized] ?? env;
}

export interface EnvironmentBadgeProps {
  environment?: Environment | string;
  className?: string;
}

/**
 * 统一的环境标识组件：小圆点 + 标准环境名称（Development / Staging / Production）。
 * 圆点与文字采用同色系低饱和配色，无彩色边框、彩色背景或额外图标。
 */
export const EnvironmentBadge: React.FC<EnvironmentBadgeProps> = ({ environment, className }) => {
  if (!environment) {
    return <span className="diff-empty-val">—</span>;
  }
  const normalized = environment.trim().toLowerCase();
  const isKnownEnv = normalized === 'development' || normalized === 'staging' || normalized === 'production';
  const envKey = isKnownEnv ? normalized : 'unknown';
  const label = isKnownEnv ? ENV_LABELS[normalized as Environment] : environment;

  return (
    <span
      className={`env-badge env-badge--${envKey}${className ? ` ${className}` : ''}`}
      data-env={envKey}
    >
      <span className="env-badge-dot" aria-hidden="true" />
      <span className="env-badge-label">{label}</span>
    </span>
  );
};

export interface StatusBadgeProps {
  enabled: boolean;
  className?: string;
}

/**
 * 统一的启停状态指示：小圆点 + 文字（已启用 / 已停用）。
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({ enabled, className }) => (
  <span className={`status${className ? ` ${className}` : ''}`}>
    <span className={`dot${enabled ? ' on' : ''}`} aria-hidden="true" />
    <span>{enabled ? '已启用' : '已停用'}</span>
  </span>
);

export interface BooleanValueTagProps {
  value: boolean;
  className?: string;
}

/**
 * 统一的布尔返回值标签：轻量、低对比度等宽字体样式，不使用高饱和红绿/青色胶囊。
 */
export const BooleanValueTag: React.FC<BooleanValueTagProps> = ({ value, className }) => (
  <span className={`bool-tag${className ? ` ${className}` : ''}`}>
    {value ? 'true' : 'false'}
  </span>
);
