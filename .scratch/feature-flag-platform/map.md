# Feature Flag 与灰度规则平台 任务全景图 (Map)

## Overview
本任务地图为 48 小时中级全栈测试题（题目 A）的工程实现全景图。将 24 条 User Stories 严格解构为 5 个纵向切片（Vertical Slices）Tickets，按次序步步推进、增量交付。

## Tickets
- **[01-monorepo-scaffold-and-flag-crud-list-create.md](issues/01-monorepo-scaffold-and-flag-crud-list-create.md)**
  - Type: task
  - Status: resolved
  - Blocked by: None
  - Scope: Monorepo 基础脚手架、PostgreSQL 迁移、Flag 列表、环境筛选与创建抽屉。
- **[02-flag-detail-toggle-and-atomic-audit-log.md](issues/02-flag-detail-toggle-and-atomic-audit-log.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 01
  - Scope: Flag 详情、启停状态切换、基本信息修改与单事务原子审计日志。
- **[03-rule-batch-sync-atomic-diff-and-workbench.md](issues/03-rule-batch-sync-atomic-diff-and-workbench.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 02
  - Scope: 规则配置工作台、拖拽/数字优先级排序、原子批量同步（Diff 计算与审计）。
- **[04-evaluation-engine-and-online-console.md](issues/04-evaluation-engine-and-online-console.md)**
  - Type: task
  - Status: ready-for-agent
  - Blocked by: 03
  - Scope: 纯内存规则评估引擎、严格类型比对、在线控制台与三态原因反馈。
- **[05-demo-seed-docker-compose-and-verification.md](issues/05-demo-seed-docker-compose-and-verification.md)**
  - Type: task
  - Status: ready-for-agent
  - Blocked by: 04
  - Scope: 演示种子数据注入、Docker Compose 编排、端到端验证与自测报告。

## Decisions-so-far
- 遵循 [docs/SPEC.md](../../docs/SPEC.md) 与 [docs/adr/](../../docs/adr/) 中的 ADR 0001~0006。
- 架构采用 `Handler -> Service -> Repository -> Database` 单向流，纯内存 `Engine`。
- [Ticket 01 完成](issues/01-monorepo-scaffold-and-flag-crud-list-create.md)：打通 Monorepo 骨架、Postgres 物理唯一索引 `(key, environment)`、Flag 创建/检索接口与前端列表及防重新建抽屉，测试全绿。
- [Ticket 02 完成](issues/02-flag-detail-toggle-and-atomic-audit-log.md)：打通 Flag 详情卡片、在线编辑与一键 Switch 启停控制，实现单事务原子审计流水（FLAG_CREATED、FLAG_UPDATED、FLAG_TOGGLED）及空变更抑制与失败原子回滚验证。
- [Ticket 03 完成](issues/03-rule-batch-sync-atomic-diff-and-workbench.md)：完成规则配置工作台、原子优先级互换（ShiftPriorities 彻底规避物理唯一索引瞬时冲突）、三向精确 Diff 审计与 RULES_SYNCED、清空规则二次确认防护与空白审计抑制。
