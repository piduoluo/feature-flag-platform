# Feature Flag 与灰度规则平台 规范说明书 (Spec)

## Problem Statement

现代软件交付过程中，研发、运维与产品团队需要在不重新构建或发布应用的前提下，灵活控制功能在不同环境（development、staging、production）中的生效状态，并基于特定用户群体的属性执行精准的灰度放量。然而，缺乏统一的 Feature Flag 平台会导致硬编码配置混乱、多环境配置互相污染、灰度规则匹配逻辑黑盒化以及规则变更缺乏可信审计记录等风险。团队需要一个轻量、严谨且高可靠的 Feature Flag 与灰度规则平台，提供直观的 Flag 生命周期管理、确定性的有序匹配评估引擎、透明的在线评估控制台与全量原子审计能力。

## Solution

构建一套基于 Go 后端与 React 前端的轻量级单体系统（Monorepo），由 PostgreSQL 提供持久化存储：
1. **Flag 管理系统**：提供跨多环境的 Flag 配置面板，严格满足在同一环境下 Key 唯一（不同环境允许使用相同的 Flag Key），支持基础属性维护（名称、描述、默认返回值）、启停控制及详情展示。
2. **有序规则引擎**：为每个 Flag 绑定基于严格数值优先级（正整数，1 为最高优先级，同一 Flag 下严格禁止重复）的多条匹配规则，执行确定性类型比对（`equals` 与 `in` 操作符），保证匹配语义绝对确定。
3. **在线评估控制台**：允许输入 Flag Key、环境及用户属性 JSON，调用后端评估引擎，清晰呈现最终布尔值及三态原因（`FLAG_DISABLED`、`RULE_MATCH`、`DEFAULT_FALLBACK`）与命中明细。
4. **事务级审计流**：所有 Flag 变更与规则批量同步（精确计算新增、修改、删除 diff）均与 Audit Log 在同一数据库事务内原子提交，杜绝空变更审计，保障变更链路完全可溯。
5. **双重运行模式**：首要保证能够根据 README 指引在本地直接启动复现运行；同时提供推荐的容器化编排支持（Docker Compose + Nginx 反向代理），便于自动化评测。

---

## User Stories

### Flag 生命周期管理
1. 作为研发人员，我想要在特定环境（development、staging 或 production）下创建一个在当前环境下具备唯一 Key、名称、可选描述及默认返回值的 Flag，以便为新功能接入特性开关。
2. 作为研发人员，我想要在不同环境中使用相同的 Flag Key，以便在开发、测试与生产环境中保持一致的代码调用逻辑。
3. 作为配置管理员，我想要在试图于同一环境下创建重复 Flag Key 时收到明确的冲突提示（`FLAG_KEY_CONFLICT`），以便避免配置覆盖事故。
4. 作为配置管理员，我想要查看按环境筛选或按关键字搜索的 Flag 列表，以便快速定位需要维护的特性开关。
5. 作为配置管理员，我想要查看 Flag 的详细信息（包含基础信息、生效环境、启停状态、默认返回值、创建/更新时间），以便全面了解开关现状。
6. 作为配置管理员，我想要编辑 Flag 的基本信息（名称、描述、默认返回值），以便在业务策略调整时更新配置。
7. 作为运维人员，我想要一键切换 Flag 的启用或停用状态，以便在突发故障时实现毫秒级功能熔断。
8. 作为系统用户，我想要在停用 Flag 时确保系统始终返回 `false` 且评估原因标识为 `FLAG_DISABLED`，以便消除停用开关对下游业务的不确定影响。

### 有序规则配置与批量同步
9. 作为产品经理，我想要为 Flag 配置多条有序匹配规则，以便针对特定用户群体实施灰度放量。
10. 作为产品经理，我想要为规则指定属性名、操作符（`equals` 或 `in`）、期望值以及命中后的布尔返回值，以便精确描述灰度条件。
11. 作为配置管理员，我想要为每条规则指定唯一的正整数优先级（1 表示最高优先级），以便确定规则判断的执行次序。
12. 作为配置管理员，我想要在配置重复优先级时被前端界面与后端接口严格拦截（`PRIORITY_CONFLICT`），以便杜绝执行次序的歧义。
13. 作为配置管理员，我想要一次性批量提交 Flag 的全部规则更新（包括新增、修改、删除以及优先级的原子重排与互换），以便在单次操作中安全保存整组规则配置。
14. 作为配置管理员，我想要在清空 Flag 全部规则前进行二次确认，并在提交后安全删除全部规则且生成准确的删除审计记录，以便防止误操作导致所有灰度策略失效。
15. 作为安全审计员，我想要在批量更新规则时由系统自动校验规则 ID 归属（必须全量归属于当前 Flag，且请求内禁止存在重复规则 ID），以便防止恶意请求跨 Flag 篡改规则。
16. 作为系统用户，我想要在批量更新规则且内容无任何变动时（包括在无规则状态下重复提交空规则列表），系统自动跳过审计日志写入，以便避免产生无意义的冗余历史记录。

### 规则评估引擎
17. 作为调用方服务，我想要传入 Flag Key、环境和包含用户属性的 JSON 上下文发起评估，以便决定是否对该用户开放特性。
18. 作为调用方服务，我想要规则评估严格按照优先级数值升序逐条判断，并在第一条规则命中时立即短路返回，以便获得确定且高效的计算结果。
19. 作为调用方服务，我想要在没有规则命中时由系统自动回退返回 Flag 的默认布尔值，并标记原因为 `DEFAULT_FALLBACK`。
20. 作为测试人员，我想要 `equals` 操作符执行严格 JSON 类型隔离（string、number、boolean 严禁跨类型匹配）与数值大小精确匹配（如 `1` 与 `1.0` 相等、大整数无精度损失匹配，但 `1` 与 `"1"` 不等），期望值必须为非 null 标量；属性缺失或为 null 时判定不命中。
21. 作为测试人员，我想要 `in` 操作符在期望值为非空标量数组时执行精确类型与数值匹配；当属性缺失或为 null 时判定不命中。
22. 作为系统用户，我想要当用户属性缺失或属性类型与期望值不一致时，当前规则判定为不命中并平滑评估下一条规则，以便提高规则容错性。
23. 作为系统用户，我想要在传入非法 JSON、缺失必填字段或请求不存在的 Flag 时获得规范的错误响应（`VALIDATION_ERROR` 或 `FLAG_NOT_FOUND`），以便快速排查调用错误。

### 在线评估控制台
24. 作为产品经理或测试人员，我想要在控制台中选择环境、输入 Flag Key 并粘贴测试用户属性 JSON，以便直观验证灰度规则的配置效果。
25. 作为测试人员，我想要在控制台中清晰看到最终返回值（true/false），以便确认评估结果。
26. 作为测试人员，我想要在控制台中明确获知是否命中了规则，以及具体命中哪一条规则（显示属性名、操作符、期望值和优先级），以便解释决策链路。
27. 作为测试人员，我想要在未命中任何规则时看到明确说明“未命中规则，回退至默认返回值”，以便理解非命中原因。
28. 作为前端用户，我想要在输入不合法的 JSON 时获得前端实时的语法错误高亮提示与友好的错误反馈，以便及时修正输入。

### 变更历史与审计追溯
29. 作为合规审计员，我想要查看 Flag 的所有变更历史，包括创建、基本信息修改、规则批量同步及启停切换，以便追溯每次配置变更。
30. 作为合规审计员，我想要在规则批量同步的审计记录中清晰查看精确的规则差异摘要（新增了哪些规则、修改了哪些字段、删除了哪些规则），以便快速比对改动细节。
31. 作为合规审计员，我想要审计日志包含操作类型、发生时间、变更摘要以及冗余记录的 Flag Key 和环境，以便即使主配置演进也能保持审计记录的完整可读性。
32. 作为架构师，我想要确保业务数据持久化与 Audit Log 写入在同一个数据库显式事务中执行，任一环节失败全量回滚，以便保证审计与业务状态的绝对一致。

### 运行复现与部署
33. 作为评测人员，我想要通过 README 提供的少量明确命令在本地顺利启动前后端与数据库，以便低成本直接复现与调试系统。
34. 作为评测人员，我想要支持使用推荐的 Docker Compose 一键拉起全栈服务，以便在纯净容器环境中自动化验证系统功能。
35. 作为评测人员，我想要在系统首次启动时自动加载演示数据（包含不同环境下的 Flag、有序规则及初始审计记录），以便开箱即用验证核心业务链路。

---

## Implementation Decisions

### 1. 架构分层与模块边界 (Layered Architecture & Boundaries)
遵循 [ADR 0006](adr/0006-clean-layered-package-layout.md)，后端划分为四个单向依赖层次：
- **Presentation Layer (Handler)**：负责 HTTP 参数解析、请求格式校验、统一响应包装及传输层 HTTP 状态码映射。
- **Business Logic Layer (Service)**：内聚核心业务用例，包括 `FlagService`（生命周期与启停）、`RuleService`（批量 Diff 比对、事务内规则变更与审计记录写入）、`EvaluationService`（数据组装与引擎调度）。
- **Evaluation Engine (Engine)**：纯内存领域计算引擎，无外部 I/O 与存储依赖，仅接收 Flag 实体、Rule 列表及用户属性 Map，输出结构化评估结果。
  - **规则排序职责明确**：
    - 持久化层（Repository）在根据 Flag 查询 Rules 时，执行 `ORDER BY priority ASC`；
    - **领域评估引擎（Engine）作为核心评估接缝，内部保证按 `priority` 严格升序（数值 1 优先于 2）执行有序匹配**。即使调用方传入未经排序的切片，Engine 依然通过升序处理确保评估确定性，使得该接缝对外部行为承担完全的自包含责任。
- **Persistence Layer (Repository)**：负责数据库交互，按实体划分 `FlagRepository`、`RuleRepository`、`AuditRepository`，并在 Service 协调下支持单数据库事务（Unit of Work）。

前端采用模块化单页结构（[ADR 0001](adr/0001-tech-stack-and-monorepo.md)）：
- **API Client**：统一封装请求层，统一使用 `/api/v1` 路由前缀，统一处理全大写 `ErrorCode` 与业务响应解包。
- **前后端路由与转发一致性**：前后端调用接口严格统一使用 `/api` 前缀。本地独立运行模式下，Vite 开发服务器通过代理配置将 `/api` 请求转发至 Go 后端端口；容器化部署模式下，由 Nginx 反向代理将 `/api` 请求转发至后端容器，确保前端代码不包含环境分支逻辑。
- **Views / Components**：涵盖 Flag 列表、创建/编辑抽屉、Flag 详情与规则配置工作台、在线评估控制台以及审计历史抽屉。

### 2. 领域模型与数据库模式 (Domain Schema Decisions)
遵循 [ADR 0002](adr/0002-atomic-audit-and-priority-integrity.md)、[ADR 0003](adr/0003-strict-type-rule-matching-and-evaluation.md)、[ADR 0004](adr/0004-bulk-rule-sync-diff-audit-and-deployment.md)：
- **Flag 实体**：
  - 核心属性：
    - `id` (主键, 整型)
    - `key` (字符串, 必填, 标识符)
    - `name` (字符串, 必填, 显示名称)
    - `description` (字符串, 可选, 默认为空字符串 `""`，需求与模型完全统一)
    - `environment` (枚举字符串: `development`, `staging`, `production`, 必填)
    - `enabled` (布尔, 必填, 默认 `false`)
    - `default_value` (布尔, 必填, 默认 `false`)
    - `created_at` (时间戳)
    - `updated_at` (时间戳)
  - 约束：数据库物理级 `UNIQUE (key, environment)` 复合唯一索引。**明确：同一环境下 Key 严格唯一；不同环境允许使用相同的 Flag Key**。
- **Rule 实体**：
  - 核心属性：
    - `id` (主键, 整型)
    - `flag_id` (外键关联 Flag, 必填)
    - `attribute_name` (字符串, 必填)
    - `operator` (枚举字符串: `equals`, `in`, 必填)
    - `expected_value` (PostgreSQL JSONB, 必填, 非 null)
    - `return_value` (布尔, 必填)
    - `priority` (整型, 必填, 取值范围 `priority >= 1` 正整数)
    - `created_at` (时间戳)
    - `updated_at` (时间戳)
  - 约束：数据库物理级 `UNIQUE (flag_id, priority)` 复合唯一索引，杜绝同一 Flag 下优先级重复。
- **AuditLog 实体**：
  - 核心属性：
    - `id` (主键, 整型)
    - `flag_id` (弱关联外键, 必填)
    - `flag_key` (冗余字符串, 必填)
    - `environment` (冗余字符串, 必填)
    - `action_type` (枚举字符串: `FLAG_CREATED`, `FLAG_UPDATED`, `FLAG_TOGGLED`, `RULES_SYNCED`)
    - `operator` (固定操作者标识，如 `"admin"`)
    - `default_value` (布尔快照，操作发生时的默认返回值；升级前未记录快照的旧记录保留 `null`，不得使用当前 Flag 默认值回填)
    - `diff_summary` (JSONB 结构化摘要)
    - `created_at` (时间戳)
  - 约束：由事务管理器保证与业务变更在单一事务内原子持久化。

### 3. 规则匹配与评估计算决策 (Evaluation Mechanics)
遵循 [ADR 0003](adr/0003-strict-type-rule-matching-and-evaluation.md)：
- **优先级次序**：按 `priority` 严格升序（1 优先于 2，数值越小优先级越高）。
- **短路求值**：按序评估，首条命中的规则直接返回其 `return_value`，原因为 `RULE_MATCH`，并附带命中规则的元数据。
- **停用拦截**：若 `flag.enabled == false`，直接返回 `false`，原因为 `FLAG_DISABLED`，不执行任何规则匹配。
- **默认回退**：若所有规则均未命中，返回 `flag.default_value`，原因为 `DEFAULT_FALLBACK`。
- **边界约束与严格类型及数值比对**：
  - **JSON 类型隔离**：string、number、boolean 属于不同类型，严禁跨类型隐式转换匹配（例如布尔 `true` 与字符串 `"true"` 不匹配，数字 `1` 与字符串 `"1"` 不匹配）。
  - **数值精确比对 (Exact Numerical Comparison)**：
    - JSON 数字按照数值大小进行精确比较，因此 `1` 与 `1.0` 判定为相等。
    - 实现层必须避免大整数因浮点数精度损失而产生错误匹配，确保大整数能准确匹配。
  - **`expected_value` 严格约束**：
    - `operator == "equals"`：`expected_value` 必须为非 null 的 JSON 标量（string、number 或 boolean），禁止为 null、数组或对象。
    - `operator == "in"`：`expected_value` 必须为非空标量 JSON 数组（元素只能是非 null 的 string、number 或 boolean 标量，禁止空数组 `[]`、禁止嵌套对象、禁止包含 null）。
  - **用户属性比对语义与 `null` 处理**：
    - 若用户传入的属性在上下文中缺失，或者其取值显式为 `null`，当前规则一律判定为不命中，静默继续评估下一优先级规则。
    - `equals`：当且仅当用户属性与 `expected_value` 属于同一标量类型且数值/字符串值完全相等时命中。
    - `in`：当且仅当用户属性与数组中某一元素属于同一标量类型且数值/字符串值完全相等时命中。

### 4. 批量规则同步边界约束与 Diff 审计策略 (Bulk Rule Sync & Diff)
遵循 [ADR 0002](adr/0002-atomic-audit-and-priority-integrity.md)、[ADR 0004](adr/0004-bulk-rule-sync-diff-audit-and-deployment.md) 与 [ADR 0005](adr/0005-api-contract-and-error-handling.md)：
- 同步端点为 `PUT /api/v1/flags/:id/rules`，采用全量替换策略契约。
- **请求载荷与空列表契约**：
  - 请求体必须为包含 `"rules"` 数组字段的 JSON 对象：
    - `{"rules": []}` 为合法有效请求，表示**删除（清空）该 Flag 下全部已有规则**。
    - 若请求体缺少 `"rules"` 字段或传入 `"rules": null`，必须拒绝并返回 `VALIDATION_ERROR`（HTTP 400），不得将其解释为清空规则。
- **边界校验与优先级约束**：
  1. **优先级取值与排重**：每条规则的 `priority` 必须为 `>= 1` 的整数；同一 Flag 下优先级必须严格唯一。请求数组内存在重复优先级或非法数值时，拒绝并返回 `PRIORITY_CONFLICT` 或 `VALIDATION_ERROR`。
  2. **优先级交换 (Swap) 语义**：用户进行优先级互换（例如规则 A 从 1 变 2，规则 B 从 2 变 1）属于完全合法的业务操作，系统必须保证原子更新成功。最终违反唯一约束的规则集合必须被拒绝。具体更新机制由实现阶段保证，不触发瞬时唯一索引冲突。
  3. **规则 ID 防重与归属**：请求数组中存在的规则 `id` 必须全量归属于当前 `flag_id`；数组内禁止出现重复的规则 `id`（违规返回 `VALIDATION_ERROR`）。
  4. **原子事务一致性**：规则变更与对应的 Audit Log 必须在同一个数据库显式事务内提交，任何一方失败全量回滚。
- **差异比对 (Diff) 与审计抑制**：
  - 计算精确三向 Diff：`added`（新增规则）、`updated`（修改规则）、`deleted`（删除规则）。
  - **清空已有规则**：若原 Flag 包含现有规则，传入 `{"rules": []}` 将生成精确的 `deleted` Diff 列表并写入一条审计记录。
  - **审计空白抑制**：若 `added`、`updated`、`deleted` 均为空（包括原本无规则时再次提交 `{"rules": []}`，或规则内容与排序完全未变），直接提交事务并**跳过 Audit Log 写入**，严禁产生空白审计记录。

### 5. 核心 API 最小输入输出契约 (API Contracts)
遵循 [ADR 0005](adr/0005-api-contract-and-error-handling.md)：
- 统一外壳：
  ```json
  {
    "code": "SUCCESS",
    "message": "Operation successful",
    "data": {}
  }
  ```
  业务错误响应示例（HTTP 400 / 404 / 409 / 500）：
  ```json
  {
    "code": "FLAG_KEY_CONFLICT",
    "message": "Flag key already exists in this environment",
    "data": null
  }
  ```
  标准错误码枚举：`VALIDATION_ERROR`、`FLAG_NOT_FOUND`、`FLAG_KEY_CONFLICT`、`PRIORITY_CONFLICT`、`INTERNAL_ERROR`。

- 核心端点契约：
  1. `GET /api/v1/flags`
     - Query: `environment` (可选: `development`|`staging`|`production`), `search` (可选字符串), `page` (默认 1), `page_size` (默认 20)
     - Data: `{ "items": [Flag], "total": 10 }`
  2. `POST /api/v1/flags`
     - Body: `{ "key": "string", "name": "string", "description": "string", "environment": "string", "default_value": boolean }`
     - Data: `Flag` 实体
  3. `GET /api/v1/flags/:id`
     - Data: `Flag` 实体（附带按 `priority ASC` 排序后的 `rules` 列表）
  4. `PUT /api/v1/flags/:id`
     - Body: `{ "name": "string", "description": "string", "default_value": boolean }`
     - Data: `Flag` 实体
  5. `PATCH /api/v1/flags/:id/toggle`
     - Body: `{ "enabled": boolean }`
     - Data: `Flag` 实体
  6. `PUT /api/v1/flags/:id/rules`
     - Body:
       ```json
       {
         "rules": [ // 必须显式提供数组；传入 [] 表示清空该 Flag 下全部规则；缺少该字段或传入 null 必须返回 VALIDATION_ERROR
           {
             "id": 1, // 可选，新建规则不传
             "attribute_name": "country",
             "operator": "equals",
             "expected_value": "CN",
             "return_value": true,
             "priority": 1
           }
         ]
       }
       ```
     - Data: `[Rule]` 规则列表（已按 `priority ASC` 排序；若已清空则返回空数组 `[]`）
  7. `POST /api/v1/evaluations`
     - Body:
       ```json
       {
         "flag_key": "ai_ride_assistant_enabled",
         "environment": "production",
         "context": {
           "user_id": 10001
         }
       }
       ```
     - Data:
       ```json
       {
         "flag_id": 12,
         "default_value": false,
         "rule_count": 2,
         "rule_trace": [
           {
             "id": 1,
             "priority": 1,
             "attribute_name": "user_id",
             "operator": "in",
             "expected_value": [10001, 10002],
             "return_value": true,
             "attribute_present": true,
             "actual_value": 10001,
             "matched": true,
             "reason": "MATCHED"
           }
         ],
         "flag_key": "ai_ride_assistant_enabled",
         "environment": "production",
         "enabled": true,
         "result": true,
         "reason": "RULE_MATCH", // "RULE_MATCH" | "DEFAULT_FALLBACK" | "FLAG_DISABLED"
         "matched_rule": {
           "id": 1,
           "priority": 1,
           "attribute_name": "user_id",
           "operator": "in",
           "expected_value": [10001, 10002],
           "return_value": true
         }
       }
       ```
       *(注：当 `reason` 为 `DEFAULT_FALLBACK` 或 `FLAG_DISABLED` 时，`matched_rule` 为 `null`；若停用则 `enabled: false, result: false`)*
     - `rule_trace` 只记录实际执行过的规则，按 `priority ASC` 排列；首条命中后停止执行，后续规则不出现在链路中。Flag 停用或没有执行任何规则时返回空数组 `[]`。
     - `rule_count` 是本次加载的规则总数；已执行数量等于 `rule_trace.length`，两者之差即未执行规则数。
     - 未命中原因枚举：`ATTRIBUTE_MISSING`（Context 未提供属性）、`NULL_VALUE`（显式 `null`）、`TYPE_MISMATCH`（严格 JSON 类型不同；`in` 没有任何同类型候选项）、`VALUE_MISMATCH`（`equals` 同类型但值不同）、`NOT_IN_SET`（`in` 有同类型候选但均不相等）、`INVALID_RULE`（规则 JSON 或操作符非法，评估时跳过）、`MATCHED`（命中规则）。
     - `flag_id`、`default_value`、`rule_count`、`rule_trace` 为向后兼容的新增字段；评估结果、三态原因和命中短路行为保持不变。
  8. `GET /api/v1/flags/:id/audit-logs`
     - Data: `[AuditLog]` 列表（按 `created_at DESC` 排序）
  9. `GET /api/v1/audit-logs?page=1&page_size=20&environment=&flag_key=&action_type=`
     - 跨 Flag 全局审计分页查询；`environment`、`flag_key`（大小写不敏感子串）、`action_type`（`FLAG_CREATED` / `FLAG_UPDATED` / `FLAG_TOGGLED` / `RULES_SYNCED`）均为可选过滤条件
     - Data: `{ "items": [AuditLog], "total": 12, "page": 1, "page_size": 20 }`，按 `created_at DESC, id DESC` 排序；`items` 每项显式包含 `flag_id`、`flag_key`、`environment`、`default_value`（操作时的默认返回值快照）、`action_type`、`operator`、`diff_summary` 与 `created_at`，其中 `flag_id` 供前端跳转 `/flags/:id?tab=audit`
     - 非法参数（`page < 1`、`page_size` 不在 `1..100`、未知 `environment` 或 `action_type`）返回 `VALIDATION_ERROR`

### 6. 前端状态与交互验收标准 (Frontend Acceptance Criteria)
原题明确要求“清晰的信息层级、表单校验、加载状态、空状态、成功或失败反馈”，具体验收基准如下：
1. **信息层级 (Information Hierarchy)**：
   - 涵盖 Flag 列表、创建/编辑抽屉、Flag 详情与规则配置工作台、在线评估控制台。
   - 关键元素层级清晰，Flag 状态具备显式视觉标识（如启停 Tag 状态徽标、环境区分标识）。
2. **表单校验与操作防误触 (Form Validation & Safety Confirmation)**：
   - Flag 基础表单：Key、Name、Environment 必填校验；Key 命名格式规范；前端防重校验。
   - 规则配置表单：属性名必填；操作符必选；`priority` 校验正整数且前端禁止提交重复优先级；`expected_value` 语法检查（`equals` 校验非 null 标量，`in` 必须校验为有效非空标量 JSON 数组）。
   - **清空规则二次确认**：前端清空 Flag 下全部规则或删除最后一条规则提交前，必须弹出二次确认框（Modal / Popconfirm），防止误操作导致线上全部流量回退默认值。
   - 评估控制台 Context：实时检验合法 JSON 格式，语法错误时提供红色高亮及错误提示，拦截非法提交。
3. **加载状态 (Loading State)**：
   - 列表拉取、详情拉取、表单保存、启停切换开关、评估计算等异步交互必须展示加载动画或 Loading 遮罩。
   - 提交期间禁用操作按钮，防止重复提交。
4. **空状态 (Empty State)**：
   - Flag 列表过滤或搜索无结果时展示规范 Empty 组件。
   - Flag 规则列表为空时展示显式空状态提示（例如：“当前暂无灰度规则，将直接返回默认值”）。
   - 审计日志无记录时展示空状态占位。
5. **成功与失败反馈 (Success & Failure Feedback)**：
   - 操作成功展示全局 Toast/Message 提示。
   - 业务冲突（`FLAG_KEY_CONFLICT`、`PRIORITY_CONFLICT`）及校验失败（`VALIDATION_ERROR`）精准解析后端响应并在表单或页面提供清晰的错误警示（Alert），严禁静默失败。
   - 评估控制台根据评估返回结果呈现三种鲜明反馈卡片：
     - 命中规则：展示绿色成功态、最终返回值与命中规则明细（属性名、操作符、期望值、优先级）；
     - 回退默认：展示中性提示态，明确说明“未命中任何规则，回退至 Flag 默认值”；
     - 开关停用：展示警示态，明确说明“Flag 已停用，强制返回 false”。

---

## Testing Decisions

### 1. 测试原则
- **仅测试外部行为，不测试实现细节**：测试用例只通过公开契约输入特定参数，断言返回结果与状态变更，不耦合内部私有函数。
- **用例自包含且确定性**：每个测试具备独立且可复现的输入数据集，无全局状态泄漏。

### 2. 测试接缝设计 (Seams)
系统设立两个精简且高内聚的测试接缝：
- **Seam 1: Evaluation Engine 纯内存领域接缝 (最高纯领域接缝)**
  - **位置**：`Engine.Evaluate(flag, rules, attributes)`
  - **责任与特征**：纯内存算法，负责根据优先级升序排序与规则匹配。零 I/O、零数据库依赖。
  - **测试覆盖点**：
    1. 乱序传入规则时，引擎仍能按 `priority` 严格升序（1 优先于 2）确定性匹配并短路返回。
    2. Flag 停用时始终返回 `false` 与 `FLAG_DISABLED`。
    3. 全量规则未命中时回退默认布尔值与 `DEFAULT_FALLBACK`。
    4. `equals` 严格类型隔离与精确数值匹配（断言 `1` 与 `1.0` 命中，大整数无精度损失正确匹配；断言数字 `1` 与字符串 `"1"` 不匹配，布尔 `true` 与字符串 `"true"` 不匹配）。
    5. `in` 严格标量数组包含匹配（支持精确数值匹配），期望值非数组或包含非标量时的防御行为。
    6. 属性在上下文中缺失或显式为 `null` 时的静默跳过行为。
- **Seam 2: Service / Repository 事务与业务契约接缝**
  - **位置**：`FlagService`、`RuleService`
  - **责任与特征**：连接测试数据库，验证 Unit of Work 事务原子性与数据完整性。
  - **测试覆盖点**：
    1. 同一环境 Flag Key 重复被拦截，返回 `FLAG_KEY_CONFLICT`。
    2. 规则批量同步时新增、修改、删除的 Diff 准确性。
    3. 批量规则同步时优先级互换（Swap）成功且不触发唯一索引冲突。
    4. 同一 Flag 规则优先级重复被拦截，返回 `PRIORITY_CONFLICT`。
    5. 规则清空契约：原有规则时提交 `{"rules": []}` 成功删除全部规则并生成包含完整 `deleted` 的审计记录；原本为空规则时再次提交 `{"rules": []}` 静默跳过，不生成空白 Audit Log。
    6. 缺失 `"rules"` 字段或传入 `"rules": null` 拒绝并返回 `VALIDATION_ERROR`。
    7. 跨 Flag 篡改规则 ID 被拦截，返回 `VALIDATION_ERROR`。
    8. 业务操作失败或审计写入失败时，事务整体原子回滚。

### 3. 先前实践与参考模式 (Prior Art)
- Go 标准库表格驱动测试（Table-driven tests），利用输入用例矩阵覆盖各种规则与属性匹配组合。
- 事务回滚型集成测试：每个测试用例启动独立事务并在测试结束时回滚，保持测试数据库清洁。

---

## Out of Scope

以下特性在当前阶段明确排除在范围之外（遵循 [ADR 0004](adr/0004-bulk-rule-sync-diff-audit-and-deployment.md) 及题目要求）：
1. **Flag 的删除操作**：当前不提供删除 Flag 功能，避免引入过度设计的软删除逻辑或复杂的级联审计孤儿问题。
2. **多租户与用户认证/权限系统 (RBAC)**：不实现多租户与完整登录体系，操作人采用固定审计标识。
3. **基于 Hash 的百分比灰度分布算法**：本次仅实现基于属性匹配的有序确定性规则，百分比流量分桶不列入核心交付。
4. **规则可视化拖拽排序**：前端通过直观的数字优先级输入框和列表重排序交互完成，不引入重型第三方拖拽库。
5. **跨环境配置一键复制或全量流水线发布**：各环境配置互相隔离，暂不支持一键环境克隆。

---

## Further Notes

1. **部署要求与 API 路由一致性**：
   - **首要复现基准**：依据题面通用要求，系统首先保证可在本地通过 README 说明的少量命令（例如后端 `go run`、前端 `npm run dev`，配置环境变量连接 PostgreSQL）正常启动复现。本地开发时 Vite 开发服务器通过代理配置将 `/api` 请求转发至 Go 后端端口。
   - **推荐容器化交付**：遵循 [ADR 0004](adr/0004-bulk-rule-sync-diff-audit-and-deployment.md)，提供 `docker-compose.yml` 作为推荐交付与开箱评测手段（Nginx 反向代理统一暴露前端构建物并将 `/api` 转发至后端，Postgres 强健康检查，后端启动执行幂等迁移与 Demo 数据种子写入），前后端交互均统一使用 `/api` 路径，代码内部无环境差异分支。但不将 Docker 作为强制本地运行的唯一排他方式。
2. **术语合规**：所有代码、文档、UI 文本及错误提示严格遵守 [GLOSSARY.md](../GLOSSARY.md) 命名规范，杜绝 Switch/Toggle/Condition/Rank 等混淆术语。
3. **交付完整性**：项目需附带完整 README（启动方式、设计取舍、已完成功能与测试运行指南）及 AI 辅助开发日志。
