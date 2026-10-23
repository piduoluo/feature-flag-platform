import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const imageDir = path.resolve(__dirname, '../../image');

if (!fs.existsSync(imageDir)) {
  fs.mkdirSync(imageDir, { recursive: true });
}

async function run() {
  console.log('🚀 Starting screenshot capture suite...');
  console.log(`📁 Target directory: ${imageDir}`);

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // High resolution Retina screenshots
  });

  const page = await context.newPage();

  async function snap(filename, delayMs = 350) {
    if (delayMs > 0) {
      await page.waitForTimeout(delayMs);
    }
    const targetPath = path.join(imageDir, filename);
    await page.screenshot({ path: targetPath, fullPage: false });
    console.log(`📸 Saved: ${filename}`);
  }

  try {
    // ==========================================
    // 1. Flag 列表页相关
    // ==========================================
    console.log('\n--- 1. Flag List Page ---');
    await page.goto('http://localhost:3000/flags');
    await page.waitForSelector('.ant-table-row', { timeout: 10000 });
    await snap('01_flag_list_all.png');

    // 1.2 环境过滤: Production
    await page.locator('.ant-segmented-item:has-text("Production")').click();
    await page.waitForTimeout(400);
    await snap('02_flag_list_filter_production.png');

    // 1.3 环境过滤: Development
    await page.locator('.ant-segmented-item:has-text("Development")').click();
    await page.waitForTimeout(400);
    await snap('03_flag_list_filter_development.png');

    // 切回全部环境
    await page.locator('.ant-segmented-item:has-text("全部环境")').click();
    await page.waitForTimeout(400);

    // 1.4 搜索关键词 "ai_ride"
    const searchInput = page.locator('input[placeholder*="搜索 Flag Key 或名称"]');
    await searchInput.fill('ai_ride');
    await page.waitForTimeout(500);
    await snap('04_flag_list_search_query.png');
    await searchInput.fill('');
    await page.waitForTimeout(400);

    // 1.5 新建 Flag 抽屉 - 空表单
    await page.getByRole('button', { name: /新建 Flag/ }).click();
    await page.waitForSelector('.ant-drawer-content', { state: 'visible' });
    await page.waitForTimeout(400);
    await snap('05_flag_create_drawer_empty.png');

    // 1.6 新建 Flag 抽屉 - 填写表单
    await page.locator('#name').fill('优惠券立减活动');
    await page.locator('#key').fill('coupon_instant_discount');
    await page.locator('#description').fill('双十一期间专属折扣券灰度开关');
    await page.locator('#default_value').click(); // toggle switch
    await page.waitForTimeout(300);
    await snap('06_flag_create_drawer_filled.png');

    // 1.7 新建 Flag 抽屉 - 同环境 Key 冲突报错演示
    await page.locator('#name').fill('冲突测试');
    await page.locator('#key').fill('checkout_v2'); // checkout_v2 already exists in development
    await page.locator('.ant-drawer').getByRole('button', { name: /立即创建/ }).click();
    await page.waitForSelector('.ant-alert-error', { state: 'visible', timeout: 6000 });
    await page.waitForTimeout(400);
    await snap('07_flag_create_drawer_conflict_error.png');

    // 关闭抽屉
    await page.locator('.ant-drawer').getByRole('button', { name: /取\s*消/ }).click();
    await page.waitForTimeout(500);

    // 1.8 列表内行内启停 Switch 交互反馈
    const rowSwitch = page.locator('.ant-table-row:has-text("checkout_v2")').first().locator('.ant-switch');
    await rowSwitch.click(); // toggle
    await page.waitForSelector('.ant-message-notice', { state: 'visible', timeout: 5000 });
    await snap('08_flag_toggle_inline_feedback.png', 200);
    await page.waitForTimeout(1000);
    // 恢复状态
    await rowSwitch.click();
    await page.waitForTimeout(800);

    // ==========================================
    // 2. Flag 详情与规则配置工作台
    // ==========================================
    console.log('\n--- 2. Flag Detail & Rules Workspace ---');
    const flagsData = await page.evaluate(async () => {
      const res = await fetch('/api/v1/flags');
      return await res.json();
    });
    const prodFlag = flagsData.data.items.find(f => f.key === 'ai_ride_assistant_enabled' && f.environment === 'production') || flagsData.data.items[0];
    const flagId = prodFlag.id;
    console.log(`Using flagId ${flagId} (${prodFlag.name}) for detail views`);

    await page.goto(`http://localhost:3000/flags/${flagId}?tab=rules`);
    await page.waitForSelector('[data-testid="flag-detail-page"]', { timeout: 10000 });
    await page.waitForTimeout(600);
    await snap('09_flag_detail_rules_tab.png');

    // 2.2 添加规则弹窗 - 空表单
    await page.getByRole('button', { name: /添加规则/ }).click();
    await page.waitForSelector('.ant-modal-content', { state: 'visible' });
    await page.waitForTimeout(400);
    await snap('10_rule_add_modal_empty.png');

    // 2.3 添加规则弹窗 - 填写表单
    await page.locator('#attribute_name').fill('city_code');
    await page.locator('.ant-modal .ant-select').click();
    await page.locator('.ant-select-item-option-content:has-text("in")').click();
    await page.locator('#expected_value').fill('["010", "021", "0755"]');
    await page.locator('#return_value').click(); // toggle to true
    await page.waitForTimeout(300);
    await snap('11_rule_add_modal_filled.png');

    // 2.4 添加规则弹窗 - JSON 格式错误校验
    await page.locator('#expected_value').fill('["010", "021", 未加引号]');
    await page.locator('.ant-modal').getByRole('button', { name: /确\s*认/ }).click();
    await page.waitForSelector('.ant-form-item-explain-error', { state: 'visible', timeout: 3000 });
    await page.waitForTimeout(300);
    await snap('12_rule_add_modal_json_validation.png');

    // 关闭添加规则弹窗
    await page.locator('.ant-modal').getByRole('button', { name: /取\s*消/ }).click();
    await page.waitForTimeout(400);

    // 2.5 编辑规则弹窗
    await page.getByRole('button', { name: /编辑规则/ }).first().click();
    await page.waitForSelector('.ant-modal-content', { state: 'visible' });
    await page.waitForTimeout(400);
    await snap('13_rule_edit_modal.png');
    await page.locator('.ant-modal').getByRole('button', { name: /取\s*消/ }).click();
    await page.waitForTimeout(400);

    // 2.6 规则排序与未保存草稿提示条 (Dirty State)
    await page.getByRole('button', { name: /下移/ }).first().click();
    await page.waitForTimeout(400);
    await snap('14_rule_reorder_and_dirty_banner.png');

    // 2.7 前往评估拦截弹窗 (evaluationPrompt)
    await page.getByRole('button', { name: /前往在线评估/ }).click();
    await page.waitForSelector('.ant-modal:has-text("前往评估前处理未保存修改")', { state: 'visible' });
    await page.waitForTimeout(400);
    await snap('15_flag_detail_unsaved_eval_prompt.png');
    await page.locator('.ant-modal').getByRole('button', { name: /继续留在本页编辑/ }).click();
    await page.waitForTimeout(400);

    // 放弃规则修改以恢复初始
    await page.getByRole('button', { name: /放弃修改/ }).click();
    await page.waitForTimeout(400);

    // 2.8 删除规则确认弹窗
    await page.getByRole('button', { name: /删除规则/ }).first().click();
    await page.waitForSelector('.ant-modal:has-text("删除规则？")', { state: 'visible' });
    await page.waitForTimeout(300);
    await snap('16_rule_delete_confirm_modal.png');
    await page.locator('.ant-modal').getByRole('button', { name: /取\s*消/ }).click();
    await page.waitForTimeout(400);

    // 2.9 清空全部规则确认弹窗
    await page.getByRole('button', { name: /清空全部规则/ }).click();
    await page.waitForSelector('.ant-modal:has-text("清空全部规则？")', { state: 'visible' });
    await page.waitForTimeout(300);
    await snap('17_rule_clear_all_confirm_modal.png');
    await page.locator('.ant-modal').getByRole('button', { name: /取\s*消/ }).click();
    await page.waitForTimeout(400);

    // 2.10 Flag 详情页 - 变更历史 Tab
    await page.locator('.ant-tabs-tab:has-text("变更历史")').click();
    await page.waitForSelector('[data-testid="audit-timeline"]', { timeout: 6000 });
    await page.waitForTimeout(500);
    await snap('18_flag_detail_audit_tab.png');

    // 2.11 Flag 详情页 - 基本设置 Tab
    await page.locator('.ant-tabs-tab:has-text("基本设置")').click();
    await page.waitForSelector('#name', { state: 'visible' });
    await page.waitForTimeout(400);
    await snap('19_flag_detail_settings_tab.png');

    // ==========================================
    // 3. 在线规则评估控制台
    // ==========================================
    console.log('\n--- 3. Evaluation Console Page ---');
    await page.goto('http://localhost:3000/evaluations');
    await page.waitForSelector('button:has-text("发起在线评估")');
    await snap('20_evaluation_console_main.png');

    // 3.2 场景 1: 命中灰度规则 (ai_ride_assistant_enabled, production, user_id=10001)
    await page.locator('.ant-select').first().click();
    await page.locator('.ant-select-item-option-content:has-text("Production")').click();
    await page.waitForTimeout(300);

    await page.locator('#flag-key-input').fill('ai_ride_assistant_enabled');
    await page.waitForTimeout(300);

    const contextTextarea = page.locator('textarea[aria-label="用户属性上下文 Context JSON"]');
    await contextTextarea.fill(JSON.stringify({
      user_id: 10001,
      country: 'CN',
      plan: 'premium'
    }, null, 2));
    await page.waitForTimeout(300);

    await page.getByRole('button', { name: /发起在线评估/ }).click();
    await page.waitForSelector('[data-testid="result-card-rule-match"]', { timeout: 6000 });
    await page.waitForTimeout(500);
    await snap('21_evaluation_scenario_rule_match.png');

    // 3.3 场景 2: 未命中规则回退默认值 (user_id=99999, country=US, plan=free)
    await contextTextarea.fill(JSON.stringify({
      user_id: 99999,
      country: 'US',
      plan: 'free'
    }, null, 2));
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /发起在线评估/ }).click();
    await page.waitForSelector('[data-testid="result-card-default-fallback"]', { timeout: 6000 });
    await page.waitForTimeout(500);
    await snap('22_evaluation_scenario_default_fallback.png');

    // 3.4 场景 3: Flag 停用熔断返回 false (safety_ai_upgrade_enabled, production is disabled)
    await page.locator('#flag-key-input').fill('safety_ai_upgrade_enabled');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /发起在线评估/ }).click();
    await page.waitForSelector('[data-testid="result-card-disabled"]', { timeout: 6000 });
    await page.waitForTimeout(500);
    await snap('23_evaluation_scenario_disabled_flag.png');

    // 3.5 场景 4: JSON 语法错误行号校验
    await contextTextarea.fill('{\n  "user_id": 10001,\n  "country": "CN",\n  "syntax_error": \n}');
    await page.waitForSelector('[data-testid="context-json-error"]', { timeout: 4000 });
    await page.waitForTimeout(400);
    await snap('24_evaluation_json_syntax_error.png');

    // 3.6 场景 5: Flag 不存在报错
    await contextTextarea.fill(JSON.stringify({ user_id: 10001 }, null, 2));
    await page.locator('#flag-key-input').fill('non_existent_feature_flag');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /发起在线评估/ }).click();
    await page.waitForSelector('.ant-alert-error', { state: 'visible', timeout: 6000 });
    await page.waitForTimeout(500);
    await snap('25_evaluation_flag_not_found.png');

    // ==========================================
    // 4. 全局操作历史页面
    // ==========================================
    console.log('\n--- 4. Global Audit Logs Page ---');
    await page.goto('http://localhost:3000/audit-logs');
    await page.waitForSelector('.ant-table-row', { timeout: 8000 });
    await page.waitForTimeout(400);
    await snap('26_global_audit_logs_main.png');

    // 4.2 全局审计 - 筛选联动 (选择 Production 环境)
    await page.locator('.ant-select').first().click();
    await page.locator('.ant-select-item-option-content:has-text("Production")').click();
    await page.waitForTimeout(400);
    await snap('27_global_audit_logs_filtered.png');

    // ==========================================
    // 5. 移动端响应式布局
    // ==========================================
    console.log('\n--- 5. Mobile Responsive View ---');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 }, // iPhone 14 / modern smartphone
      deviceScaleFactor: 2,
    });
    const mobilePage = await mobileContext.newPage();

    await mobilePage.goto('http://localhost:3000/flags');
    await mobilePage.waitForSelector('.ant-table-wrapper');
    await mobilePage.waitForTimeout(400);
    const mobilePath1 = path.join(imageDir, '28_mobile_view_flag_list.png');
    await mobilePage.screenshot({ path: mobilePath1 });
    console.log(`📸 Saved: 28_mobile_view_flag_list.png`);

    // 打开移动端侧边抽屉菜单
    await mobilePage.locator('.app-shell-menu-button').click();
    await mobilePage.waitForSelector('.ant-drawer-content', { state: 'visible' });
    await mobilePage.waitForTimeout(400);
    const mobilePath2 = path.join(imageDir, '29_mobile_view_drawer_menu.png');
    await mobilePage.screenshot({ path: mobilePath2 });
    console.log(`📸 Saved: 29_mobile_view_drawer_menu.png`);

    await mobileContext.close();

    console.log('\n🎉 ALL 29 SCREENSHOTS CAPTURED SUCCESSFULLY!');
  } catch (error) {
    console.error('❌ Error during capture:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
