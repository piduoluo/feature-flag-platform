# 08B: 全局操作审计后端 API 与跨 Flag 全功能运维控制台

**What to build:**
协同交付全局操作审计后端端点与前端全功能运维控制台（`/audit-logs`）。后端在 `AuditRepository`、`FlagService` 与 `FlagHandler` 中实现 `GET /api/v1/audit-logs`，支持分页、环境过滤、Flag Key 模糊搜索及**操作类型 (`action_type`) 筛选**，响应项显式返回 `flag_id`。前端构建运维表格，支持多条件筛选过滤、分页加载；表格**支持行展开 (Expandable Rows)**，引用 `frontend/src/utils/diffParser.ts` 契约渲染规则与配置变更 Diff 摘要；表格中的 Flag Key 渲染为可点击链接，点击**直接直达对应 Flag 详情的变更历史 Tab (`/flags/:id?tab=audit`)**。

**Blocked by:** 01: 客户端声明式路由体系、AppShell 全局骨架与测试脚手架

**Status:** ready-for-agent

**Progress:** 后端部分已于 `melody/ticket-08b-audit-api` 完成（AuditRepository.ListAll、GET /api/v1/audit-logs、Handler/Service/Repository 真实库测试）；前端条目待 Wave 2。

- [x] 后端在 `AuditRepository` 中实现 `ListAll(ctx, query)`，支持分页、环境过滤、Flag Key 模糊匹配及 `action_type`（`FLAG_CREATED`、`FLAG_UPDATED`、`FLAG_TOGGLED`、`RULES_SYNCED`）筛选
- [x] 后端注册并实现 `GET /api/v1/audit-logs` 端点，返回标准信封 `{ code: "SUCCESS", data: { items, total, page, page_size } }`，且 items 中每项显式包含 `flag_id`、`flag_key`、`environment`、`action_type`、`operator`、`diff_summary` 与 `created_at`
- [x] 编写 Go Handler & Service 针对真实 PostgreSQL 的单元测试，验证分页、各筛选条件及数据完整性
- [ ] 前端构建 `GlobalAuditLogPage` 挂载于 `/audit-logs` 路由，接入真实 API Client 分页表格
- [ ] 前端筛选区提供环境选择器、Flag Key 搜索输入框及**操作类型下拉筛选框**，变更过滤项实时向后端发起分页查询
- [ ] 全局审计表格支持行展开（`expandable`），引用共享的 `parseAuditDiff` 契约高亮呈现变更 Diff 摘要
- [ ] 表格中 Flag Key 渲染为超链接，点击直接平滑路由跳转至对应详情页变更历史 Tab `/flags/:id?tab=audit`
- [ ] 路由集成测试覆盖全局审计页面加载、多维度过滤、行展开 Diff 阅读及详情页直达跳转
