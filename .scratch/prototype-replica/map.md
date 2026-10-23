# 1:1 复刻前端原型全景图 (Map)

## Overview
本任务地图为 Feature Flag 平台前端 1:1 复刻独立原型效果的工程执行全景图。将视觉、组件、API 联动及质量验收完整解构为 7 个纵向切片 Tickets。

## Tickets
- **[01-design-system-and-appshell-layout.md](issues/01-design-system-and-appshell-layout.md)**
  - Type: task
  - Status: resolved
  - Blocked by: None
  - Scope: 全局 Design Tokens、滴滴橙品牌色、AppShell 侧边栏折叠/移动端抽屉、顶部面包屑与头像下拉菜单、全局 Toast 容器与 Tooltip 悬浮气泡委托。
- **[02-flag-list-dual-view-and-create-drawer.md](issues/02-flag-list-dual-view-and-create-drawer.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 01
  - Scope: Flag 列表工具栏、Table/Grid 双重视图切换、行操作气泡菜单（在线评估/启停）、新建 Flag 抽屉（表单校验、409 冲突展示、Loading 防重）、自定义分页栏。
- **[03-flag-detail-workspace-and-rules-engine.md](issues/03-flag-detail-workspace-and-rules-engine.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 01
  - Scope: Flag 详情概览、Tab 标题脏星号联动、规则序号卡片流、原子重排上移/下移、添加/编辑规则 Modal、删除/清空二次确认 Modal、底部吸底保存栏。
- **[04-settings-form-and-unsaved-draft-guards.md](issues/04-settings-form-and-unsaved-draft-guards.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 03
  - Scope: Tab 3 基本设置独立表单提交、离开详情页路由拦截弹窗、前往在线评估拦截弹窗（先基本设置后规则原子保存容错）、beforeunload 原生告警。
- **[05-evaluation-console-and-preloaded-combobox.md](issues/05-evaluation-console-and-preloaded-combobox.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 01
  - Scope: 评估控制台左右双栏、环境切换自动预载 Flag 下拉 Combobox、Context JSON 语法错误行号高亮与辅助操作、三态决策卡片（熔断/规则命中明细/回退默认）。
- **[06-global-audit-logs-and-structured-diff.md](issues/06-global-audit-logs-and-structured-diff.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 01
  - Scope: 全局审计页工具栏与过滤、表格展开行、Flag Key 下钻至详情 Tab 2、复刻原型创建快照/启停流转/规则增删改/基本设置修改结构化 Diff 卡片。
- **[07-test-suite-route-aliases-and-pixel-polish.md](issues/07-test-suite-route-aliases-and-pixel-polish.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 02, 04, 05, 06
  - Scope: 路由别名与参数兼容（/evaluation, /audit）、全部 101 个 Vitest 单元/集成测试 100% 通过、Playwright E2E 测试全绿、全分辨率响应式核验。
