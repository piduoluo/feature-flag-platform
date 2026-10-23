# 07: 滴滴场景演示 Flag 更新

**Type:** task
**Status:** resolved
**Blocked by:** None

## Goal

将旧的 4 条演示 Flag 替换为 4 个滴滴出行场景 Key、5 条跨环境 Flag。只更新演示数据和当前本地数据库，不增加通用 Key 编辑功能，不在其他已有数据库中自动删除数据。

## Acceptance

- [x] 新数据库幂等生成 5 条演示 Flag、对应有序规则和初始审计记录。
- [x] 当前本地数据库仅清理旧演示 Flag 及关联数据；操作前备份并确认没有额外数据受影响。
- [x] 当前 API 中的新演示集合为 5 条 Flag、4 个唯一 Key；旧演示记录已删除，新建记录不受清理影响。
- [x] 指定用户命中、规则优先级、默认回退、停用拦截和跨环境差异均按讨论方案验证。
- [x] 相关测试与面向使用者的示例内容更新并通过必要验证。

## Answer

- 种子改为 4 个虚构出行场景 Key、5 条跨环境 Flag；当前本地库删除旧 4 条演示 Flag、6 条规则及 6 条审计记录后，由新后端启动重新生成 5 条 Flag、5 条规则及 5 条初始审计记录。
- 清理前的完整数据库备份在 `.scratch/tmp/didi-demo-before-2026-10-23.dump`（本地忽略文件）。未自动清理其他已有数据库。
- 验证：`go test ./...`、前端构建、列表页 11 项测试、9 个真实 API 评估场景通过；重启后种子数量仍为 5 Flag / 4 Key / 5 Rule / 5 Audit；前端及代理 API 均返回 HTTP 200。
- 迁移完成后，通过创建接口新增了 ID 16 的 `checkout_v2`（development，名称“新版收银台冲突测试”）。用户随后明确要求删除；再次备份数据库至 `.scratch/tmp/before-checkout-v2-delete-2026-10-23.dump` 后，仅删除该 Flag、其 5 条关联审计记录（无关联规则）。验证当前 API 列表为 5 条，搜索 `checkout_v2` 返回 0 条。

## Comments

- 2026-10-23：用户确认采用 `ai_ride_assistant_enabled`、`robotaxi_r2_trial_enabled`、`safety_ai_upgrade_enabled`、`robotaxi_uae_pilot_enabled`；清理当前本地旧演示数据并重新生成。所有场景、用户 ID 与属性值均为虚构演示内容。
