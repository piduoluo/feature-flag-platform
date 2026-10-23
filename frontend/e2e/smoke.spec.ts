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
  // This suite creates a flag per run, so the list is not guaranteed to show
  // the seeded demo flag on page 1 forever. Search proves it is still served.
  await expect(page.getByText(flagKey).first()).toBeVisible();
  await page.getByPlaceholder('搜索 Flag Key 或名称...').fill('ai_ride_assistant_enabled');
  await expect(page.getByText('ai_ride_assistant_enabled').first()).toBeVisible();
});

test('Ticket 20: the console shows live stats without a page heading or global breadcrumb', async ({ page, request }) => {
  const response = await request.get(`${API_BASE}/flags?page_size=1`);
  const stats = (await response.json()).data.stats;

  await page.goto('/flags');
  await expect(page.getByTestId('app-breadcrumb')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '功能开关管理' })).toHaveCount(0);
  await expect(page.getByText('管理各环境的功能开关，支持灰度发布与快速回滚。')).toHaveCount(0);
  await expect(page.locator('.app-shell-header')).toHaveCount(0);

  const statsGroup = page.getByRole('group', { name: 'Flag 状态统计' });
  await expect(page.getByRole('button', { name: /全部 Flag/ })).toContainText(String(stats.all));
  await expect(page.getByRole('button', { name: /已启用/ })).toContainText(String(stats.enabled));
  await expect(page.getByRole('button', { name: /已停用/ })).toContainText(String(stats.disabled));

  await page.getByRole('button', { name: /已启用/ }).click();
  await expect(page).toHaveURL(/enabled=true/);
  await expect(page.getByRole('button', { name: /已启用/ })).toHaveAttribute('aria-pressed', 'true');
  // The summary is computed before status filtering, so it stays stable.
  await expect(page.getByRole('button', { name: /全部 Flag/ })).toContainText(String(stats.all));
  await expect(statsGroup).toBeVisible();

  // Status filtering lives in the stat buttons; no standalone filter exists.
  await expect(page.getByRole('button', { name: /^筛选/ })).toHaveCount(0);
});

test('Ticket 10: the narrow layout keeps the nav button and every toolbar action', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/flags');

  await expect(page.locator('.app-shell-mobile-bar')).toBeVisible();
  await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible();
  await expect(page.locator('.app-shell-sidebar')).toBeHidden();

  await expect(page.getByRole('group', { name: 'Flag 状态统计' })).toBeVisible();
  await expect(page.getByPlaceholder('搜索 Flag Key 或名称...')).toBeVisible();
  await expect(page.getByRole('button', { name: '宫格视图' })).toBeVisible();
  await expect(page.getByRole('button', { name: '刷新列表' })).toBeVisible();
  await expect(page.getByRole('button', { name: /新建 Flag/ })).toBeVisible();

  await page.getByRole('button', { name: '打开导航菜单' }).click();
  await expect(page.locator('.mobile-nav-drawer')).toBeVisible();
});

test('SPEC-US 33/UI-R 04: a legacy tab deep link opens audit on one canonical URL', async ({ page }) => {
  await page.goto(`/flags/${flagId}?tab=audit`);

  await expect(page.getByTestId('flag-detail-page')).toBeVisible();
  await expect(page.getByRole('tab', { name: '变更历史' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(new RegExp(`/flags/${flagId}$`));
  // Creating the flag wrote an audit row through the same transaction.
  await expect(page.getByText('创建 Flag').first()).toBeVisible();
});

test('SPEC-US 34: Nginx serves the legacy path link and the canonical URL survives reload', async ({ page }) => {
  const response = await page.goto(`/flags/${flagId}/audit`);
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`/flags/${flagId}$`));
  await expect(page.getByRole('tab', { name: '变更历史' })).toHaveAttribute('aria-selected', 'true');

  const reload = await page.reload();
  expect(reload?.status()).toBe(200);
  await expect(page.getByTestId('flag-detail-page')).toBeVisible();
  // Tabs are local view state now, so a hard refresh of the single URL starts on rules.
  await expect(page.getByRole('tab', { name: '规则配置' })).toHaveAttribute('aria-selected', 'true');
});

test('UI-R 09: tabs share one URL and browser back returns to the list', async ({ page }) => {
  await page.goto('/flags');
  await page.getByText(flagKey).click();
  await expect(page).toHaveURL(new RegExp(`/flags/${flagId}$`));

  await page.getByRole('tab', { name: '变更历史' }).click();
  await expect(page).toHaveURL(new RegExp(`/flags/${flagId}$`));
  await page.getByRole('tab', { name: '基本设置' }).click();
  await expect(page).toHaveURL(new RegExp(`/flags/${flagId}$`));

  await page.goBack();
  await expect(page).toHaveURL(/\/flags$/);
  await expect(page.getByText(flagKey)).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/flags/${flagId}$`));
  await expect(page.getByRole('tab', { name: '规则配置' })).toHaveAttribute('aria-selected', 'true');
});

test('Ticket 11: the top-left back nav returns to the source list with its filters', async ({ page }) => {
  await page.goto('/flags?environment=development');
  await page.getByText(flagKey).first().click();
  await expect(page.getByTestId('detail-back-nav')).toHaveText(/功能开关/);

  await page.getByTestId('detail-back-nav').click();
  await expect(page).toHaveURL(/\/flags\?environment=development$/);
  await expect(page.getByText(flagKey)).toBeVisible();
});

test('Ticket 13: list filters do not stack browser history entries', async ({ page }) => {
  await page.goto('/audit-logs');
  await expect(page.getByTestId('global-audit-logs-page')).toBeVisible();
  await page.goto('/flags');
  await page.waitForSelector('.ant-table-row');

  await page.locator('.ant-segmented-item:has-text("Development")').click();
  await expect(page).toHaveURL(/environment=development/);
  await page.getByRole('button', { name: /已启用/ }).click();
  await expect(page).toHaveURL(/enabled=true/);

  // Both filter changes replaced the list entry, so one back leaves the list.
  await page.goBack();
  await expect(page).toHaveURL(/\/audit-logs$/);
});

test('SPEC-US 27: the evaluation console accepts the deep-linked context', async ({ page }) => {
  await page.goto(`/evaluations?flag_key=${flagKey}&environment=development`);

  await expect(page.getByTestId('context-banner')).toBeVisible();
  await expect(page.getByLabel('Flag Key')).toHaveValue(flagKey);

  await page.getByRole('button', { name: '发起在线评估' }).click();
  await expect(page.getByText('回退至默认返回值 (DEFAULT_FALLBACK)')).toBeVisible();
});

test('UI-R 08: an unsaved draft triggers the native beforeunload prompt', async ({ page }) => {
  await page.goto(`/flags/${flagId}`);
  await page.getByRole('tab', { name: '基本设置' }).click();
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
  await expect(page).toHaveURL(new RegExp(`/flags/${flagId}$`));
  await expect(page.getByRole('tab', { name: '变更历史' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('detail-back-nav')).toHaveText(/全局操作历史/);
});
