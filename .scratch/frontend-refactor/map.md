# Feature Flag 平台前端 UI 布局迁移与重构 任务全景图 (Map)

## Overview
本任务地图为 Feature Flag 平台前端 UI 布局迁移与渐进式重构（Spec v2.4）的工程执行全景图。将 35 条原始 User Stories 与 13 条 UI 架构规范（UI-R 01~13）完整解构为 11 个高内聚、边界清晰的纵向切片 Tickets，支持最大化并行实施并闭环质量保障。

## Tickets
- **[01-routing-foundation-and-appshell-layout.md](issues/01-routing-foundation-and-appshell-layout.md)**
  - Type: task
  - Status: resolved
  - Blocked by: None
  - Scope: 声明式客户端路由 (`createBrowserRouter`)、AppShell 全局骨架、面包屑、根路径重定向、Nginx SPA `try_files` 及路由树测试脚手架。
- **[02-flag-list-query-sync-and-creation-lifecycle.md](issues/02-flag-list-query-sync-and-creation-lifecycle.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 01
  - Scope: Flag 列表环境/搜索 Query 双向同步、Flag 创建生命周期（冲突拦截与跨环境复用）、行内启停防重与单向状态同步、详情跳转。
- **[03-flag-detail-workspace-and-basic-settings.md](issues/03-flag-detail-workspace-and-basic-settings.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 01
  - Scope: `/flags/:id` 全屏工作台、Header 启停防重、`?tab=rules|audit|settings` 状态与 URL 双向绑定、Tab 3 基本设置独立表单与提交。
- **[04-rule-card-stream-and-priority-sorting.md](issues/04-rule-card-stream-and-priority-sorting.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 03
  - Scope: Tab 1 规则卡片流、内存数组顺序即执行优先级、首尾越界禁用、调回原状脏状态自动复原、只读兜底卡片草稿警告。
- **[05-rule-bulk-sync-and-floating-save-bar.md](issues/05-rule-bulk-sync-and-floating-save-bar.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 04
  - Scope: 悬浮保存栏显示纯粹绑定 `isRulesDirty`、调回原状自动收起、空变更不发请求、清空经危险确认仅入草稿统一提交、保存时根据数组顺序生成连续优先级、补充后端规则事务回滚测试。
- **[06-unsaved-draft-state-machine-and-navigation-guards.md](issues/06-unsaved-draft-state-machine-and-navigation-guards.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 05, 03
  - Scope: 全域真实深比对脏检查、Tab 切换静默保留草稿、离开 Flag 路由拦截、前往评估按照“先基本设置后规则”顺序执行与部分失败容错。
- **[07-evaluation-console-context-continuity.md](issues/07-evaluation-console-context-continuity.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 01
  - Scope: 控制台 Query 默认回填不锁定字段、上下文横幅与返回详情链接、原生 `JSON.parse` 实时语法阻断拦截、三态卡片呈现。
- **[08a-flag-audit-history-and-structured-diff.md](issues/08a-flag-audit-history-and-structured-diff.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 03
  - Scope: Tab 2 垂直时间轴展示真实操作人与时间、建立共享 `parseAuditDiff` 契约、`RULES_SYNCED` 增删改三向 Diff 结构化展开比对。
- **[08b-global-audit-api-and-operations-console.md](issues/08b-global-audit-api-and-operations-console.md)**
  - Type: task
  - Status: claimed
  - Blocked by: 01
  - Scope: 后端交付 `GET /api/v1/audit-logs`（支持 `action_type` 过滤与返回 `flag_id`）、前端全功能表格支持多维过滤、展开行查看变更 Diff、直达 `?tab=audit`。
- **[10-legacy-flag-detail-drawer-cleanup.md](issues/10-legacy-flag-detail-drawer-cleanup.md)**
  - Type: task
  - Status: ready-for-agent
  - Blocked by: 06, 08A
  - Scope: 原 8 项关键测试迁移完整度核查、安全删除 `FlagDetailDrawer.tsx` 及其旧测试文件、清理死代码与旧引用、验证全套测试 100% 绿灯。
- **[09-real-browser-e2e-smoke-verification.md](issues/09-real-browser-e2e-smoke-verification.md)**
  - Type: task
  - Status: ready-for-agent
  - Blocked by: 02, 07, 08B, 10
  - Scope: 本地启动与 Docker Compose 验证、首次启动演示数据就绪验证、Playwright 真实浏览器端到端冒烟测试（动态随机 Flag、深层链接直达 `?tab=audit`、Nginx SPA 刷新 try_files 回退、历史栈前进后退、beforeunload 防误关）。

## Decisions-so-far
- 严格遵循 `GLOSSARY.md`、`docs/SPEC.md` 与 ADR 0001~0006。
- 详情工作台拆分为三个独立 Tab，状态深度绑定 URL Query `?tab=rules|audit|settings`。
- 脏检查统一采用内容深比较模型（`isBasicDirty` 与 `isRulesDirty`），调回原状保存栏自动平滑收起。
- 规则执行优先级严格由草稿卡片数组顺序推导，保存时自动生成连续唯一的合法数值（`priority: index + 1`）。
- 前往评估【保存并前往】执行确定性串行顺序：先基本设置，后规则配置；部分失败阻断跳转并切换至失败 Tab，保护草稿不丢单。
- 后端数据库事务原子性（SPEC-US 32）由真实后端数据库测试承载，补充规则批量同步回滚测试。
- Ticket 08A 与 08B 通过 `frontend/src/utils/diffParser.ts` 共享接口契约，保持并行开发并在 Ticket 09 最终集成闭环。
- 真实浏览器端到端测试禁止硬编码 `/flags/1`，采用动态创建测试 Flag 与随机 Key。
- [01-routing-foundation-and-appshell-layout.md](issues/01-routing-foundation-and-appshell-layout.md): 声明式路由与 AppShell 全局骨架落地，以 `react-router-dom` 搭建包含 `/flags`、`/flags/:id`、`/evaluations`、`/audit-logs` 的完整路由树，固定左侧 Sider 导航与顶部动态 Breadcrumb，根路径 `/` 自动重定向至 `/flags`，Node undici Request 与 jsdom 信号对齐并通过 7 组路由集成测试。
- [02-flag-list-query-sync-and-creation-lifecycle.md](issues/02-flag-list-query-sync-and-creation-lifecycle.md): 列表过滤态与 URL Query 双向同步（`?environment=&search=`，深链与刷新自动还原），创建生命周期拦截同环境 `FLAG_KEY_CONFLICT` 并允许跨环境复用同一 Key，行内启停以服务端返回实体单向回写且失败回滚，`FlagListPage.test.tsx` 11 项覆盖 Query 同步、创建冲突与详情跳转。
- [03-flag-detail-workspace-and-basic-settings.md](issues/03-flag-detail-workspace-and-basic-settings.md): 全屏详情工作台落地，Header（名称/环境/等宽 Key 复制/最后更新时间/启停防重）、SummaryBar 与 `?tab=` 双向绑定；基本设置以独立 `basicDraft` 提交 `PUT /flags/:id` 并复用单事务审计，`FlagDetailPage.test.tsx` 12 项覆盖。
- [04-rule-card-stream-and-priority-sorting.md](issues/04-rule-card-stream-and-priority-sorting.md): 规则卡片流以草稿数组顺序为唯一优先级事实源，`moveRule`/`rulesEqual`/`parseExpected` 纯函数承载重排、深比对与严格标量/数组校验，`ruleDraft.test.ts` 3 项单测。
- [05-rule-bulk-sync-and-floating-save-bar.md](issues/05-rule-bulk-sync-and-floating-save-bar.md): 悬浮保存栏纯绑定 `isRulesDirty`，保存时生成 `priority = index + 1` 全量同步；清空经危险确认后仍须统一保存；后端新增真实库事务回滚测试 `TestRuleService_SyncRules_AtomicRollback_OnAuditFailure`。
- [06-unsaved-draft-state-machine-and-navigation-guards.md](issues/06-unsaved-draft-state-machine-and-navigation-guards.md): 全域脏检查 + 确定性「先基本设置后规则」保存 + 部分失败就地收敛与失败 Tab 聚焦 + `useBlocker`/`beforeunload` 守卫，并覆盖浏览器后退（POP）拦截。
- [07-evaluation-console-context-continuity.md](issues/07-evaluation-console-context-continuity.md): URL Query 仅挂载时读取一次作为初始值（`environment` 白名单、`flag_key` 去空格、`flag_id` 仅数字），字段始终可编辑；返回链接优先 `flag_id`、否则按 Key 反查；原生 TextArea + `JSON.parse` 实时阻断并给出行号定位；`RULE_MATCH` 缺明细时降级为中性兜底而非误标默认；`EvaluationConsolePage.test.tsx` 13 项覆盖。
- [08a-flag-audit-history-and-structured-diff.md](issues/08a-flag-audit-history-and-structured-diff.md): 新建共享契约 `frontend/src/utils/diffParser.ts` 的 `parseAuditDiff`（输入 `unknown`、永不抛错、畸形降级为可读摘要），`FlagAuditHistoryTab` 消费 `GET /flags/:id/audit-logs` 渲染垂直时间轴；兼容真实 `rules_synced` 三向 Diff、种子 `rules_seed_synced`、`before/after` 与 `old/new` 多种历史形状；`diffParser.test.ts` 19 项 + 组件 7 项 + 路由深链 3 项。
