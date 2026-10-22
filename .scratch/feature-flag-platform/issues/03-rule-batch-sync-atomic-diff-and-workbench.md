# 03: 规则批量同步、原子 Diff 审计与规则配置工作台

**What to build:**
产品经理与配置管理员可以在 Flag 详情页的规则配置工作台中，为 Flag 维护多条基于数值优先级（正整数，1 为最高优先级）的有序灰度规则。用户可以配置属性名、操作符（equals 与 in）、期望值及命中返回值，并能自由增删、调整单条规则或进行优先级原子互换（Swap）。所有规则变更通过单次批量提交保存，后端自动计算精确的三向差异（新增、修改、删除），并在同一数据库事务中原子同步规则表并记录 RULES_SYNCED 审计日志。若内容无任何变动则自动跳过审计写入；清空全部规则前必须进行前端二次确认，清空后正确生成包含删除明细的审计记录。

**Blocked by:** 02: Flag 详情、基本信息修改、一键启停与原子操作历史

**Status:** resolved

- [x] 产品经理能够为 Flag 配置多条有序匹配规则（属性名、equals/in 操作符、期望值、布尔返回值及正整数优先级）
- [x] 前端与后端严格拦截同一 Flag 下的重复优先级（PRIORITY_CONFLICT）及非法正整数校验（VALIDATION_ERROR）
- [x] 支持规则优先级的原子互换（Swap，如规则 A 与规则 B 互换次序），更新过程中不触发瞬时唯一索引冲突
- [x] 批量保存接口在单事务内比对原规则与新规则，精确持久化变更并写入包含新增、修改、删除差异的 RULES_SYNCED 审计记录
- [x] 当提交的规则内容与排序完全无变动时，系统静默跳过审计日志写入，不产生空白审计记录
- [x] 提供清空规则功能，前端执行二次确认弹窗防误触，提交后安全删除全部规则并产生包含完整 deleted 差异的审计日志
- [x] 校验规则 ID 全量归属于当前 Flag 且请求内无重复 ID，杜绝跨 Flag 篡改
- [x] Flag 详情接口与规则同步接口均返回按优先级严格升序排列的规则列表
- [x] 自动化测试覆盖三向 Diff 计算准确性、优先级互换无冲突、重复优先级拦截、空规则清空契约与空白审计抑制

## Answer

### 1. 架构与领域模型实现
- **领域模型与请求契约** (`backend/internal/domain/models.go`): 定义 `RuleItemPayload` 与 `SyncRulesRequest`，支持 `equals`（单标量严格类型比对）与 `in`（非空标量数组）规则载荷。
- **仓储层** (`backend/internal/repository/rule_repo.go`): 实现 `RuleRepository`，提供 `ListByFlagID`（按优先级升序排序）、`Create`、`Update`、`Delete` 与 `ShiftPriorities`。
- **业务服务层** (`backend/internal/service/rule_service.go`):
  - 严格校验属性非空、操作符有效性、标量类型隔离与正整数优先级合法性。
  - 请求 ID 归属性校验与排重，杜绝跨 Flag 篡改。
  - 精确计算三向 Diff（`added`, `updated`, `deleted`）。若无任何内容或顺序变更，触发空白审计抑制（无操作不写 Audit Log）。
  - 在同一事务中先执行 `ShiftPriorities(flagID, 1000000)` 偏移优先级，彻底规避 PostgreSQL `UNIQUE (flag_id, priority)` 临时更新冲突，确保优先级原子互换（Swap）。
  - 所有保留规则的目标状态在事务内全量恢复与更新，杜绝部分同步时的优先级污染。
  - 同一事务原子记录 `RULES_SYNCED` 审计日志，包含结构化变更摘要。
- **HTTP 处理层** (`backend/internal/handler/flag_handler.go`): 暴露 `PUT /api/v1/flags/:id/rules`，严格返回升序规则列表。

### 2. 前端规则配置工作台
- **类型定义与 API 客户端** (`frontend/src/types/index.ts`, `frontend/src/api/client.ts`): 扩展 `Rule`、`SyncRulesPayload` 及 `api.syncRules` 接口。
- **规则工作台交互** (`frontend/src/components/FlagDetailDrawer.tsx`):
  - 集成「规则配置工作台」Tab，展示按优先级升序排列的规则表格。
  - 支持原子优先级互换（上移/下移）与动态编辑/删除。
  - 新增/编辑规则弹窗支持 `equals`（string, number, boolean）与 `in`（string[], number[], boolean[]）标量类型配置。
  - 提供「清空全部规则」按钮并配备 Popconfirm 二次确认弹窗；在工作台清空至 0 条规则并点击批量保存时同样触发二次确认保护，防止误触回退默认值。
  - 操作历史 Tab 高保真格式化渲染 `RULES_SYNCED` 审计日志的新增、修改、删除明细。

### 3. 自动化测试验证
- **后端测试** (`backend/internal/service/rule_service_test.go`, `backend/internal/handler/flag_handler_test.go`): 覆盖升序返回、优先级互换无冲突、重复优先级 409 拦截、非法参数 400 校验、空白变更审计抑制、ID 归属校验及未变更规则优先级保持。后端 17 个真实数据库测试全部通过。
- **前端测试** (`frontend/src/components/FlagDetailDrawer.test.tsx`): 覆盖规则列表渲染、优先级互换与批量保存、Popconfirm 清空确认与状态同步，14 个单元测试全绿。生产构建编译通过。
