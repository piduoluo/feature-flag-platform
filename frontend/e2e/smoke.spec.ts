import { expect, test } from '@playwright/test';

/**
 * Full-stack smoke test for the Feature Flag platform (Ticket 09).
 *
 * Every case runs against the real browser + real Nginx-served SPA + real Go
 * API + real PostgreSQL. No `/flags/1` is ever hardcoded: the suite creates a
 * flag with a random key, drives the UI through it, and the harness cleans the
 * `smoke_` rows afterwards.
 */

const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:8080/api/v1';
const runId = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
const flagKey = `smoke_${runId}`;
const flagName = `冒烟测试 Flag ${runId}`;

let flagId = 0;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  const response = await request.post(`${API_BASE}/flags`, {
    data: {
      key: flagKey,
      name: flagName,
      description: 'Created by the Playwright smoke suite',
      environment: 'development',
      default_value: false,
    },
  });
  expect(response.ok(), `creating ${flagKey} via the API`).toBeTruthy();
  const body = await response.json();
  flagId = body.data.id;
  expect(flagId).toBeGreaterThan(0);

  // New flags start disabled, which would short-circuit evaluation to
  // FLAG_DISABLED. Enable it so the console exercises rule/fallback logic.
  const toggle = await request.patch(`${API_BASE}/flags/${flagId}/toggle`, {
    data: { enabled: true },
  });
  expect(toggle.ok(), `enabling ${flagKey}`).toBeTruthy();
});

test('SPEC-US 35: the seeded demo flag is visible on a cold start', async ({ page }) => {
  await page.goto('/flags');
  await expect(page.getByText('checkout_v2').first()).toBeVisible();
  await expect(page.getByText(flagKey)).toBeVisible();
});

test('SPEC-US 33/UI-R 04: a deep link opens the audit tab with real data', async ({ page }) => {
  await page.goto(`/flags/${flagId}?tab=audit`);

  await expect(page.getByTestId('flag-detail-page')).toBeVisible();
  await expect(page.getByRole('tab', { name: '变更历史' })).toHaveAttribute('aria-selected', 'true');
  // Creating the flag wrote an audit row through the same transaction.
  await expect(page.getByText('创建 Flag').first()).toBeVisible();
});

test('SPEC-US 34: Nginx try_files serves the deep link on a hard refresh', async ({ page }) => {
  const response = await page.goto(`/flags/${flagId}?tab=audit`);
  expect(response?.status()).toBe(200);

  const reload = await page.reload();
  expect(reload?.status()).toBe(200);
  await expect(page.getByTestId('flag-detail-page')).toBeVisible();
  await expect(page.getByRole('tab', { name: '变更历史' })).toHaveAttribute('aria-selected', 'true');
});

test('UI-R 09: browser back and forward keep URL and active tab in sync', async ({ page }) => {
  await page.goto('/flags');
  await page.getByText(flagKey).click();
  await expect(page).toHaveURL(new RegExp(`/flags/${flagId}$`));

  await page.getByRole('tab', { name: '变更历史' }).click();
  await expect(page).toHaveURL(new RegExp(`/flags/${flagId}\\?tab=audit$`));

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/flags/${flagId}$`));
  await expect(page.getByRole('tab', { name: '规则配置' })).toHaveAttribute('aria-selected', 'true');

  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/flags/${flagId}\\?tab=audit$`));
  await expect(page.getByRole('tab', { name: '变更历史' })).toHaveAttribute('aria-selected', 'true');
});

test('SPEC-US 27: the evaluation console accepts the deep-linked context', async ({ page }) => {
  await page.goto(`/evaluations?flag_key=${flagKey}&environment=development`);

  await expect(page.getByTestId('context-banner')).toBeVisible();
  await expect(page.getByLabel('Flag Key')).toHaveValue(flagKey);

  await page.getByRole('button', { name: '发起在线评估' }).click();
  await expect(page.getByText('回退至默认返回值 (DEFAULT_FALLBACK)')).toBeVisible();
});

test('UI-R 08: an unsaved draft triggers the native beforeunload prompt', async ({ page }) => {
  await page.goto(`/flags/${flagId}?tab=settings`);
  await page.getByLabel('Flag 名称').fill(`${flagName} changed`);

  const dialogPromise = page.waitForEvent('dialog', { timeout: 10_000 });
  await page.close({ runBeforeUnload: true });
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
});

test('Ticket 08B: the global audit console lists and expands this flag', async ({ page }) => {
  await page.goto('/audit-logs');
  await page.getByLabel('Flag Key 搜索').fill(flagKey);
  // The link wraps <Text code>, whose accessible name Chromium reports as
  // empty, so address it by its exact destination instead.
  // Creating and then enabling the flag leaves two audit rows, both linking
  // to the same destination.
  const detailLink = page.locator(`a[href="/flags/${flagId}?tab=audit"]`).first();
  await expect(detailLink).toBeVisible();

  await detailLink.click();
  await expect(page).toHaveURL(new RegExp(`/flags/${flagId}\\?tab=audit$`));
  await expect(page.getByRole('tab', { name: '变更历史' })).toHaveAttribute('aria-selected', 'true');
});
