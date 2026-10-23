# 30: 在线评估结果区精简与底部操作对齐

Type: task
Status: resolved

## Goal

精简在线评估结果区的视觉噪音：结果摘要压缩为「来源 + 返回值」单行，去掉胶囊、原因码与描述小字；false 标红、true 标绿；移除「下一步」标题，保留三个后续操作并与左侧「发起在线评估」对齐在同一水平线。

## Acceptance

- [x] 结果摘要只保留一行：返回值 + `来源：...`，不再有彩色容器、胶囊标签、`RULE_MATCH` / `DEFAULT_FALLBACK` 原因码。
- [x] 摘要下方「命中优先级 #…」「未命中任何规则…」「Flag 已停用…」等描述小字全部移除。
- [x] 决策链路保留标题、三步状态与逐条规则明细，但移除每一步下面的解释性小字。
- [x] `true` 使用绿色 `#168653`，`false` 使用红色 `#c2403a`。
- [x] 移除「下一步」标题；查看规则 / 复制请求 / 查看默认值配置三个操作保留。
- [x] 1440px 下左侧「发起在线评估」与右侧操作行的盒子完全对齐（top 871 / bottom 923 / center 897），按钮中心同线。
- [x] 390px 下摘要、链路与三个操作纵向排列，无横向溢出。
- [x] 前端单测、类型检查、生产构建、真实浏览器 E2E 全部通过。

## Answer

**结果摘要**

- `EvaluationDecision` 的摘要从「大号返回值 + 胶囊 + 原因码 + 描述 + 来源」改为单个 `section`：
  ```tsx
  <strong className="evalc-summary-value is-true|is-false" aria-label="最终返回值">true|false</strong>
  <span className="evalc-summary-source">来源：命中规则 | Flag 默认值配置 | 停用状态 | 未知</span>
  ```
- 删除 `evalc-summary-head`、`evalc-summary-tag`、`evalc-summary-code`、`evalc-summary-foot` 及相关 tone 背景样式；摘要不再有卡片容器。
- 返回值字号 26px（移动端 24px），字重 600；`is-true` → `var(--green)` `#168653`，`is-false` → `var(--red)` `#c2403a`。
- 来源仍由原有 `source` 逻辑给出：停用状态 / 命中规则 / Flag 默认值配置 / 未知。

**决策链路**

- 三个步骤只保留标题、状态与步骤节点：开关状态、规则匹配（N 条规则 / 已评估 M 条）、返回/回退结果。
- 删除每步下方的解释性 `<p>`，以及旧的 `remaining` 计算。
- 逐条规则明细（`#优先级 属性`、操作符与期望值、原因、实际值/期望值/返回值）保留。
- 停用状态下「规则匹配」步骤增加 `is-stopped`，节点与状态显示为琥珀色，避免移除说明后语义丢失。

**后续操作与对齐**

- 删除「下一步」标题及 `aria-labelledby`，section 改为 `aria-label="后续操作"`，三个操作按钮保留。
- `.evalc-decision` 改为纵向 flex 并撑满结果区；`.evalc-next` 使用 `margin-top: auto` 固定在右卡底部。
- `.evalc-actions` 行高 52px 且垂直居中，与左侧 52px 主按钮的 top / bottom / center 完全一致；三个 40px 次级按钮在行内居中，视觉中心与主按钮同线。
- 移动端 `.evalc-actions` 恢复纵向撑满、行高取消，三个操作全宽堆叠。

**验证**

- 单测 14 个文件 148 项通过；更新了摘要、命中、回退、停用、缺明细和后续操作相关断言。
- `tsc --noEmit` 与 `npm run build` 通过。
- Playwright 真实浏览器 13 项通过；新增断言：false 的计算颜色为 `rgb(194, 64, 58)`，摘要显示「来源：Flag 默认值配置」。
- 1440px 实测：主按钮与右侧操作行 top 871、bottom 923、center 897；390px 截图无横向溢出。
- 前端镜像已重建，localhost:3000 为最新结果区。
