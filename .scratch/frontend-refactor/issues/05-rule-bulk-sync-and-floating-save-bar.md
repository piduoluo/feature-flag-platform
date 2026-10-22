# 05: 规则批量同步、悬浮保存栏与清空草稿

**What to build:**
实现规则配置工作台的批量同步、悬浮保存栏与清空草稿机制。底部悬浮保存栏的显示完全由 `isRulesDirty` 实际计算结果驱动：检测到实际规则变更时平滑浮现；若用户修改后又调回原状，保存栏自动收起；无实质变动时禁用保存，不发网络请求，天然杜绝空变更审计（SPEC-US 16）。悬浮栏提供“放弃修改”（一键撤销恢复服务端最新规则）与“保存规则配置”（根据当前数组顺序自动生成连续唯一的合法优先级 `priority = index + 1`，全量批量提交至 `PUT /api/v1/flags/:id/rules`）。点击“清空全部规则”经二次危险确认后，仅将本地草稿置为 `[]` 并触发脏状态，必须由用户在悬浮栏点击保存才正式发出空规则数组请求，保持批量保存心智的一致性。补充后端真实数据库事务测试验证原子性（SPEC-US 32）。

**Blocked by:** 04: 规则卡片流、数组顺序排序与只读兜底联动

**Status:** resolved

- [x] 底部平滑浮现悬浮保存栏（`FloatingSaveBar`），其显示完全由 `isRulesDirty` 实际计算结果决定；若用户将规则调回原状，保存栏自动平滑收起
- [x] 当 `!isRulesDirty` 时禁用保存提交，不发起任何网络请求，杜绝冗余空审计记录写入
- [x] 悬浮保存栏提供“放弃修改”按钮，点击一键撤销所有未提交草稿，恢复至服务端最新已生效规则并收起保存栏
- [x] 点击“保存规则配置”按钮时，前端遍历草稿数组，严格根据当前数组索引自动生成合法且无重复的优先级列表（`priority = index + 1`），全量提交至 `PUT /api/v1/flags/:id/rules`
- [x] 保存成功后原子更新 `savedFlag.rules`，清空 `rulesDraft` 并收起悬浮保存栏；网络或服务端报错时弹出错误 Alert 并保留草稿不丢单
- [x] 点击“清空全部规则”弹出危险二次确认模态框，警示“清空后所有流量将回退为默认返回值，此改动将在保存后生效”
- [x] 清空二次确认后仅将本地草稿置为 `[]` 并触发 `isRulesDirty = true`，工作台展示空状态占位，必须点击悬浮栏“保存规则配置”才向后端发送载荷 `{"rules": []}`
- [x] 落实 SPEC-US 32 后端真实数据库事务责任：在 `backend/internal/service/rule_service_test.go` 中补充 `TestRuleService_SyncRules_AtomicRollback_OnAuditFailure`，验证审计写入失败时规则批量更新与优先级偏移全量回滚
- [x] 路由集成测试覆盖悬浮保存栏激活/自动收起、放弃修改重置、批量同步 Payload 校验与清空规则空数组提交

## Answer
1. 悬浮保存栏的可见性完全由 `isRulesDirty` 计算结果驱动，通过 `grid-template-rows`/`opacity`/`visibility` 过渡平滑浮现与收起；`!isRulesDirty` 时保存按钮禁用且不发起任何请求。
2. 「放弃修改」把 `rulesDraft` 重置为 `undefined`，恢复到服务端最新生效规则并收起保存栏。
3. 「保存规则配置」按当前草稿数组顺序生成 `priority = index + 1` 的连续唯一序列，全量提交 `PUT /api/v1/flags/:id/rules`；成功后原子更新 `savedFlag.rules`、清空草稿并收起保存栏。
4. 服务端或网络报错由顶层 `run` 捕获，展示错误 Alert 且保留草稿不丢单。
5. 「清空全部规则」先弹危险二次确认（提示清空后回退默认值），确认后仅把本地草稿置为 `[]` 并触发脏状态；必须再点悬浮栏保存才发送 `{"rules": []}`，保存后以 `Empty` 空状态占位。
6. 后端新增 `TestRuleService_SyncRules_AtomicRollback_OnAuditFailure`：连接真实 PostgreSQL，注入写入失败的审计仓库发起批量同步，断言规则新增、删除、更新与优先级偏移全部回滚，审计记录数与内容不变。

**验证**：`FlagDetailPage.test.tsx` 覆盖保存栏激活/自动收起、保存 Payload 连续优先级（`[[2,1],[1,2]]`）、放弃修改重置、清空空数组提交与失败保留草稿；后端 `internal/service` 测试通过。
