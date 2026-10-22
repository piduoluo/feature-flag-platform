# 02: Flag 详情、基本信息修改、一键启停与原子操作历史

**What to build:**
配置管理员和运维人员可以在前端点击查看 Flag 的详细信息（基础信息、生效环境、启停状态、默认返回值、创建与更新时间），能够在线编辑 Flag 的名称、描述与默认返回值，并可通过详情页或列表页的一键开关（Switch）对 Flag 进行毫秒级启用与停用切换。系统在同一个数据库事务中原子记录每次创建、修改与启停行为至操作历史（Audit Log），用户可在操作历史面板中按时间倒序追溯每一次变更明细。

**Blocked by:** 01: Monorepo 基础脚手架与 Flag 列表及创建

**Status:** resolved

- [x] 配置管理员能够查看 Flag 的详细信息卡片与基础属性
- [x] 配置管理员能够编辑 Flag 的基本信息（名称、描述、默认返回值）并保存生效
- [x] 运维人员能够在前端一键切换 Flag 的启用或停用状态，带有直观的加载反馈
- [x] 系统记录 Flag 的创建（FLAG_CREATED）、基本信息修改（FLAG_UPDATED）及启停切换（FLAG_TOGGLED）操作历史
- [x] 业务变更与 Audit Log 在单一数据库显式事务内原子提交，任何一方失败全量回滚
- [x] 操作历史面板按时间倒序展示发生时间、操作类型、固定操作者及变更摘要
- [x] 自动化测试覆盖业务变更与审计记录的事务原子性回滚以及启停状态切换

## Answer
已完整实现并验证 Ticket 02 纵向切片：
1. **Flag 详情与状态查询**：
   - 后端实现 `GET /api/v1/flags/:id`，前端 `FlagDetailDrawer` 实时拉取最新详情，包含 Key、名称、环境、描述、默认值、启停状态及精确时间戳，展示加载状态（Spin）。
2. **基本信息修改与原子审计**：
   - 后端实现 `PUT /api/v1/flags/:id`：校验非空与长度，在单一显式数据库事务中持久化变更与 `FLAG_UPDATED` 审计流水（包含变更前与变更后准确 diff 摘要）。无实际属性变更时自动跳过审计写入，杜绝空变更审计。
   - 前端详情抽屉提供“基本信息修改”表单，支持在线修改名称、描述及默认值，带校验和成功 Toast 提示。
3. **一键启停熔断控制**：
   - 后端实现 `PATCH /api/v1/flags/:id/toggle`：在显式事务内原子更新状态并写入 `FLAG_TOGGLED` 审计记录（包含 `old_enabled` 与 `new_enabled` diff）。
   - 前端支持列表页与详情页一键 Switch 开关切换，带有行级 loading 状态，切换后即时联动更新。
4. **操作历史流时间线追溯**：
   - 后端实现 `GET /api/v1/flags/:id/audit-logs`，按 `created_at DESC` 倒序返回审计流水。
   - 前端详情抽屉提供“操作历史”时间线面板，呈现发生时间、操作类型彩色 Tag（`FLAG_CREATED`、`FLAG_UPDATED`、`FLAG_TOGGLED`）、操作者（`admin`）及结构化差异明细；包含加载中、空状态占位与网络异常友好 Alert。
5. **自动化测试覆盖 (TDD & 事务回滚)**：
   - 后端 `flag_service_test.go`：新增 `TestFlagService_UpdateFlag_Success`、`TestFlagService_ToggleFlag_Success`、`TestFlagService_AuditSuppression_NoOp`（空变更审计抑制验证）及 `TestFlagService_AtomicRollback_OnAuditFailure`（显式验证审计写入异常时业务数据原子回滚）。
   - 后端 `flag_handler_test.go`：覆盖 `PUT /:id`、`PATCH /:id/toggle`、`GET /:id/audit-logs` 接口。
   - 前端 `FlagDetailDrawer.test.tsx`：覆盖详情渲染、基础信息保存更新、启停开关交互、操作历史时间线渲染及异常告警展示。全量测试通过。
