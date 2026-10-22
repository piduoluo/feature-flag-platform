# 08A: 当前 Flag 变更历史垂直时间轴与结构化 Diff 呈现

**What to build:**
实现 Flag 详情的 Tab 2 变更历史（`FlagAuditHistoryTab`），消费已就绪的单 Flag 审计接口（`GET /api/v1/flags/:id/audit-logs`）。在公共工具库 `frontend/src/utils/diffParser.ts` 中建立共享解析契约并实现 `parseAuditDiff` 结构化解析器，供当前工单与 Ticket 08B 共享。以垂直时间轴清晰呈现操作人标识（`operator`，如 `admin`）、操作动作及发生时间。针对 `RULES_SYNCED` 结构化展开 `added`（新增规则）、`updated`（修改前后字段对比高亮）与 `deleted`（删除快照）；针对 `FLAG_UPDATED` 呈现名称/描述/默认值修改前后对比；针对 `FLAG_TOGGLED` 呈现启停状态变更。支持直接通过 `/flags/:id?tab=audit` 深层链接直达。

**Blocked by:** 03: Flag 详情全屏工作台框架、Tab-Query 双向同步与基本设置域

**Status:** ready-for-agent

- [ ] 访问 `/flags/:id?tab=audit` 正常拉取服务端单 Flag 审计日志，并在 Tab 2 渲染垂直时间轴列表
- [ ] 在 `frontend/src/utils/diffParser.ts` 中建立标准的 `parseAuditDiff` 纯函数与数据类型契约，导出供当前组件与 Ticket 08B 全局审计复用
- [ ] 编写 `diffParser.test.ts` 单元测试，覆盖 `RULES_SYNCED`（增删改三向 Diff）、`FLAG_UPDATED` 与 `FLAG_TOGGLED` 的解析逻辑
- [ ] 时间轴卡片中真实展示服务端返回的操作人标识（`operator`）与发生时间
- [ ] `RULES_SYNCED` 卡片结构化展开 Diff 摘要：新增规则显示条件属性与返回值；修改规则显示各字段 before 与 after 的并排比对；删除规则展示快照
- [ ] `FLAG_UPDATED` 卡片比对展示名称、描述、默认返回值变更前后取值
- [ ] `FLAG_TOGGLED` 卡片展示启用/停用状态流转
- [ ] 路由集成测试覆盖 Tab 2 时间轴加载、空状态占位、异常 Alert 提示及结构化 Diff 呈现
