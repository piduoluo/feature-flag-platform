# 12: Flag 详情顶部两行结构与默认值语义修正

**Type:** task
**Status:** resolved
**Blocked by:** 11

## Goal

修正 Feature Flag 详情页的两个 UI/UX 问题，保持既有技术栈、视觉风格与业务逻辑不变：

1. 顶部概要区拆成稳定的两行：第一行只放身份信息与独立操作容器，第二行放元数据；启停开关和「前往在线评估」的位置不随启停状态或文案长度变化。
2. 删除「规则配置」Tab 底部重复的默认值卡片；默认值唯一编辑入口保留在「基本设置」；重写规则空状态，明确区分配置默认值、启停状态与实际评估结果。

## Acceptance

- [x] 顶部第一行只有身份信息 + 独立操作容器；第二行是规则总数 / 配置默认值 / 最后修改。
- [x] 桌面端切换启停、元数据文案变长时，开关和「前往在线评估」不换行、不位移。
- [x] 启用/停用的元数据标签完全一致；状态差异只通过 Badge、Switch 和 hint 表达。
- [x] 停用 + 默认 true 时，顶部仍显示配置默认值 true，并明确提示评估始终返回 false。
- [x] 规则 Tab 底部不再有 `.default-card`，也没有换一种样式重复展示默认值。
- [x] 基本设置中仍可查看/修改默认值，保存 payload 仍包含 `default_value`，保存后摘要和审计正常刷新。
- [x] 空状态标题/说明与校准版 prompt 第 4.3 节逐字一致；默认 true/false 不改变文案；插画和 `.empty-box` 风格保留。
- [x] 停用/重新启用不修改持久化默认值和规则；后端回归测试通过。
- [x] 规则优先级匹配、命中返回值、未命中回退、停用熔断全部保持原逻辑。
- [x] `NODE_ENV=test npm test`、`go test -count=1 ./...`、`npm run build` 通过。
- [x] 未改动列表页、创建抽屉、在线评估页、全局审计页、路由、后端业务代码与参考稿。

## Answer

**顶部结构**

- `.detail-head` 拆为两个同级块：`.detail-head-row`（身份 + 操作）与 `.detail-meta`（元数据）。
- 第一行左侧只有标题、环境 Tag、状态 Badge、Key；右侧 `detail-side` 只保留启停控制与「前往在线评估」。
- 删除 `.detail-sub` 内重复的「最后更新」；时间只在第二行「最后修改」出现一次。
- 状态 Badge 复用列表页的 `Badge status=success/default` + 「已启用/已停用」。

**CSS 稳定性**

- `.detail-head-row` 桌面端 `space-between`，不换行；`.detail-main` 为 `flex: 1 1 auto; min-width: 0`；`.detail-side` 为 `flex: 0 0 auto; flex-wrap: nowrap`。
- `.detail-meta` 作为第二行占满整行，长文案只影响自身换行；标题使用 `overflow-wrap: anywhere` 在左栏内换行。
- 980px 断点沿用纵向排列与 100% 操作区；700px 允许操作区换行，并把失效的 `.detail-side .btn` 修正为 `.detail-side .ant-btn`。

**默认值语义**

- 删除 `RuleWorkspace` 底部的 `.default-card` 与对应 CSS，以及不再使用的 `defaultValue` prop。
- 「基本设置中有未保存的默认值草稿，保存后才会影响评估结果」改为工具栏下方的独立警告，仅 `defaultDirty` 时显示。
- 默认值编辑入口仍是基本设置的 `default_value` 字段；补充 `extra` 说明其与顶部「配置默认值」是同一个持久化配置。
- 顶部固定显示 `savedFlag.default_value`，停用时通过 hint 明确「停用期间评估始终返回 false」，不把摘要替换成评估结果。

**空状态**

- 复用 AntD `Empty` 插画与 `.empty-box` / `.empty-title` / `.empty-desc`：启用时为「暂无灰度规则」，停用时为「当前 Flag 已停用」；默认 true/false 文案完全一致。

**验证**

- `NODE_ENV=test npm test`：13 个文件、120 个测试全部通过。
- `go test -count=1 ./...`：全部通过；生命周期测试新增停用/重新启用回归断言。
- `npm run build`：TypeScript 与 Vite 构建通过。
- Playwright 实际浏览器在 1440 / 1100 / 1000 / 980 / 700 宽度下核对启停切换前后开关与按钮坐标差 ≤1px、无横向滚动、长名称仅在左栏换行、停用 + 默认 true 时摘要与 hint 同时存在；临时验证 Flag 已从本地运行库清理。

