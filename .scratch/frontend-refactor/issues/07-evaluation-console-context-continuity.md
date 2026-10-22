# 07: 在线评估控制台上下文联动、轻量校验与决策呈现

**What to build:**
重构在线评估控制台（`/evaluations`），打通与 Flag 详情页的双向上下文流转。页面挂载时自动读取 URL Query 参数（`flag_key`、`environment`）作为环境和 Key 输入框的默认初始值，绝不锁定字段，支持用户自由修改。当通过带参深层链接进入时，页面顶部展示上下文提示横幅并提供【返回 Flag 详情】快速回跳链接；从全局侧栏直接进入时展示空白就绪表单。用户属性 Context 输入框采用轻量原生文本域结合 `JSON.parse` 实时语法校验，畸变输入时红色标红、展示解析错误原因并禁用提交，杜绝引入重型富文本编辑器。评估结果根据后端评估原因清晰渲染三态卡片：规则命中（绿色高亮 + 命中规则明细）、回退默认（中性卡片 + 说明）、开关停用（橙色警示 + 熔断说明）。核心评估计算逻辑严格引用后端已有测试用例作为验收证据。

**Blocked by:** 01: 客户端声明式路由体系、AppShell 全局骨架与测试脚手架

**Status:** resolved

- [x] 访问 `/evaluations?flag_key=...&environment=...` 时，页面自动从 URL Query 读取参数并作为环境选择器和 Flag Key 输入框的默认初始值填入，字段保持可编辑状态
- [x] 带参进入时，控制台顶部渲染显式上下文提示横幅（如“正在评估特性开关：checkout_v2 [production]”）并提供【返回 Flag 详情】链接，点击一键平滑回跳至 `/flags/:id`
- [x] 从左侧全局导航点击进入 `/evaluations` 时，URL 无预置参数，表单处于空白就绪态，支持自由输入与测试
- [x] 用户属性 Context 输入框使用标准 TextArea 文本域，输入内容时通过原生 `JSON.parse` 实时校验语法
- [x] Context JSON 语法错误时，输入框即时标红、显示错误原因及行号，并禁用“开始评估”按钮（不额外引入 Monaco/CodeMirror 等重型依赖）
- [x] 提交评估调用 `POST /api/v1/evaluations`，请求期间展示 loading 并禁用重复提交
- [x] 评估结果根据返回的 `reason` 精准渲染三态决策卡片：
  - `RULE_MATCH`：绿色高亮卡片，展示返回值 `true`/`false`、命中原因及命中规则明细（属性名、操作符、期望值、优先级）
  - `DEFAULT_FALLBACK`：中性卡片，展示返回值、原因及“未命中任何规则，回退至 Flag 默认值”说明
  - `FLAG_DISABLED`：橙色警示卡片，展示返回值 `false`、原因及“特性开关已停用，评估引擎已熔断并强制返回 false”说明
- [x] 引用后端已有核心计算用例作为领域行为证据（`TestEvaluationEngine_DisabledFlag`、`TestEvaluationEngine_DefaultFallback`、`TestEvaluationEngine_PriorityAndShortCircuit`、`TestEvaluationEngine_StrictTypeIsolationAndNumericalComparison`、`TestEvaluationEngine_MissingAttributeSkipsToNextRule`）
- [x] 路由集成测试覆盖带参回填、返回链接跳转、自由评估、JSON 实时错误阻断及三态结果卡片渲染
