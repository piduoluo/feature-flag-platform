import { expect, test } from '@playwright/test';

/**
 * Mandatory-path end-to-end coverage for the Feature Flag platform.
 *
 * `smoke.spec.ts` proves the shell, routing and read-side contracts. This file
 * proves the four graded flows against the real stack — create a flag in the
 * drawer, persist an ordered rule, evaluate it through the console, disable the
 * flag (short-circuit), and read the audit trail written by the same
 * transactions. No API call is stubbed and no fixture rows are inserted
 * directly into PostgreSQL; the only cleanup is `make e2e-clean`, which removes
 * every row whose key starts with `smoke_`.
 */

const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:8080/api/v1';
const runId = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
const flagKey = `smoke_core_${runId}`;
const flagName = `核心流程 Flag ${runId}`;
const missingKey = `smoke_missing_${runId}`;

let flagId = 0;

test.describe.configure({ mode: 'serial' });

test('creates a flag through the drawer and finds it with the list search', async ({ page }) => {
  await page.goto('/flags');
  await page.getByRole('button', { name: /新建 Flag/ }).first().click();
  await expect(page.getByText('新建 Feature Flag')).toBeVisible();

  await page.getByLabel('Flag Key').fill(flagKey);
  await page.getByLabel('Flag 名称').fill(flagName);
  await page.getByRole('button', { name: '立即创建' }).click();

  await expect(page.getByText(`Feature Flag [${flagKey}] 创建成功`)).toBeVisible();

  await page.getByPlaceholder('搜索 Flag Key 或名称...').fill(flagKey);
  await expect(page.getByText(flagKey).first()).toBeVisible();

  // The API is the source of truth for this flag, not just the rendered list.
  const response = await page.request.get(`${API_BASE}/flags?search=${encodeURIComponent(flagKey)}`);
  const body = await response.json();
  expect(body.data.total).toBe(1);
  flagId = body.data.items[0].id;
  expect(flagId).toBeGreaterThan(0);
  expect(body.data.items[0].environment).toBe('development');
  expect(body.data.items[0].enabled).toBe(false);
});

test('opens the detail page, enables the flag and persists an ordered rule', async ({ page }) => {
  await page.goto(`/flags/${flagId}`);
  await expect(page.getByTestId('flag-detail-page')).toBeVisible();

  const toggle = page.getByRole('switch', { name: '启停控制' });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(page.getByText('启停状态已更新').first()).toBeVisible();
  await expect(toggle).toBeChecked();

  await page.getByRole('tab', { name: '规则配置' }).click();
  await page.getByRole('button', { name: '添加规则' }).click();
  await expect(page.getByRole('dialog').getByText('添加规则')).toBeVisible();

  await page.getByLabel('属性名').fill('country');
  await page.getByLabel('期望值（JSON）').fill('"CN"');
  await expect(page.getByLabel('命中返回值')).toBeChecked();
  await page.getByRole('dialog').getByRole('button', { name: /^确\s*认$/ }).click();

  await expect(page.getByText('规则 01 · 优先级 1')).toBeVisible();
  await page.getByRole('button', { name: '保存规则配置' }).click();
  await expect(page.getByText('规则配置已保存').first()).toBeVisible();

  const response = await page.request.get(`${API_BASE}/flags/${flagId}`);
  const body = await response.json();
  expect(body.data.enabled).toBe(true);
  expect(body.data.rules).toHaveLength(1);
  expect(body.data.rules[0]).toMatchObject({
    attribute_name: 'country',
    operator: 'equals',
    expected_value: 'CN',
    return_value: true,
    priority: 1,
  });
});

test('evaluates a rule hit and the default fallback', async ({ page }) => {
  await page.goto(`/flags/${flagId}`);
  await page.getByRole('button', { name: '前往在线评估' }).click();
  await expect(page).toHaveURL(new RegExp(`/evaluations\\?.*flag_key=${flagKey}`));

  const context = page.getByLabel('用户属性上下文 (Context JSON)');
  await context.fill('{"country": "CN"}');
  await page.getByRole('button', { name: '发起在线评估' }).click();

  await expect(page.getByLabel('最终返回值')).toHaveText('true');
  await expect(page.getByText('来源：命中规则')).toBeVisible();
  await expect(page.getByText('规则命中').first()).toBeVisible();
  await expect(page.getByTestId('result-card-rule-match')).toBeVisible();

  await context.fill('{"country": "US"}');
  await page.getByRole('button', { name: '发起在线评估' }).click();
  await expect(page.getByLabel('最终返回值')).toHaveText('false');
  await expect(page.getByText('来源：Flag 默认值配置')).toBeVisible();
  await expect(page.getByText('回退默认值')).toBeVisible();
  await expect(page.getByTestId('result-card-default-fallback')).toBeVisible();
});

test('reports malformed JSON before submission and unknown flags from the API', async ({ page }) => {
  await page.goto(`/evaluations?flag_key=${flagKey}&environment=development`);
  const context = page.getByLabel('用户属性上下文 (Context JSON)');

  await context.fill('{"country": ');
  await expect(page.getByText(/JSON 语法错误/)).toBeVisible();
  await expect(page.getByRole('button', { name: '发起在线评估' })).toBeDisabled();

  await context.fill('{}');
  await page.getByLabel('特性开关标识 (Flag Key)').fill(missingKey);
  await page.getByRole('button', { name: '发起在线评估' }).click();
  await expect(page.getByText('评估调用失败')).toBeVisible();
  await expect(page.getByText(new RegExp(`${missingKey}.*not found`, 'i'))).toBeVisible();
});

test('disabling the flag forces false and the audit trail records every change', async ({ page }) => {
  await page.goto(`/flags/${flagId}`);
  await page.getByRole('switch', { name: '启停控制' }).click();
  await expect(page.getByText('启停状态已更新').first()).toBeVisible();
  await expect(page.getByRole('switch', { name: '启停控制' })).not.toBeChecked();

  await page.goto(`/evaluations?flag_key=${flagKey}&environment=development`);
  await page.getByLabel('用户属性上下文 (Context JSON)').fill('{"country": "CN"}');
  await page.getByRole('button', { name: '发起在线评估' }).click();
  await expect(page.getByLabel('最终返回值')).toHaveText('false');
  await expect(page.getByText('来源：停用状态')).toBeVisible();
  await expect(page.getByText('强制返回')).toBeVisible();

  await page.goto(`/flags/${flagId}?tab=audit`);
  await expect(page.getByRole('tab', { name: '变更历史' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('新建开关').first()).toBeVisible();
  await expect(page.getByText('启停').first()).toBeVisible();
  await expect(page.getByText('规则变更').first()).toBeVisible();

  const response = await page.request.get(`${API_BASE}/flags/${flagId}/audit-logs`);
  const body = await response.json();
  const actions = body.data.map((item: { action_type: string }) => item.action_type);
  expect(actions).toEqual(
    expect.arrayContaining(['FLAG_CREATED', 'FLAG_TOGGLED', 'RULES_SYNCED'])
  );
});
