# 07: 全量测试验证、路由别名兼容与像素级验收

**What to build:** 建立路由别名与参数兼容机制，全量执行并回归所有现有测试用例（包括 91 个 Vitest 单元/集成测试与 Playwright E2E Smoke 测试），并完成全分辨率响应式视觉核对，确保整个复刻过程零功能回归、零视觉降级。

**Blocked by:** 02: Flag 列表页双视图与新建抽屉 1:1 落地, 04: 基本设置独立表单与跨页/评估未保存卫视 1:1 落地, 05: 规则评估控制台双栏交互与 Flag 预载 1:1 落地, 06: 全局操作历史与结构化差异可视化 1:1 落地

**Status:** resolved

- [x] 路由别名与参数兼容：
  - 访问 `/evaluation` 自动重定向至 `/evaluations`，访问 `/audit` 自动重定向至 `/audit-logs`；
  - 评估控制台同时兼容 `flag_key` / `key` 以及 `environment` / `env` 查询参数输入；
  - 详情页深度路由同时支持 `/flags/:id` 默认进入 rules，以及 `/flags/:id/:tab`（rules/audit/settings）。
- [x] 前端测试套件全量绿色通过：
  - 运行 `npm --prefix frontend test`（覆盖 `router.test.tsx`、`FlagListPage.test.tsx`、`FlagDetailPage.test.tsx`、`EvaluationConsolePage.test.tsx`、`GlobalAuditLogsPage.test.tsx`、`FlagAuditHistoryTab.test.tsx`、`CreateFlagDrawer.test.tsx`、`diffParser.test.ts`、`ruleDraft.test.ts`）；
  - 确保全部 101 个 Vitest 测试用例 100% 通过，无遗漏无跳过。
- [x] 端到端测试回归：
  - 运行 `npm --prefix frontend run test:e2e` 执行 Playwright 端到端 Smoke 测试套件（全部 7 个端到端测试 100% 通过），保证核心链路（列表、新建、详情、规则重排、评估、审计）正常运作。
- [x] 像素级与响应式体验验收：
  - 针对桌面端（>1240px、981~1240px）、平板端（701~980px）与移动端（<=700px）逐一核验断点表现；
  - 验证侧边栏平滑折叠、吸底脏状态操作栏、顶部 Toast 浮层堆叠及悬浮气泡定位无偏移。
