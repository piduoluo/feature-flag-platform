# AI 协同开发记录

> **时间**：2026-10-22 16:03 → 2026-10-24 07:32  
> **规模**：截至 `9b9dce1` 共 65 条提交、49 张工单（3 条工作流）、6 份 ADR、352 行 SPEC  
> **主力工具**：Antigravity；辅助：终端编码代理与其他 AI 工具；工程工具：Orca / git worktree  
> **记录形式**：任务级 Prompt 节选 + 关键决策 + 纠错记录 + 证据链接，不追求逐字转录

---

## 一、协作方式

1. **文档先行**：写代码前先形成 `GLOSSARY.md`、`docs/SPEC.md` 与 ADR 0001–0006，把术语、边界和不可让步的约束固定下来。
2. **工单驱动**：所有工作先落到 `.scratch/<工作流>/issues/NN-*.md`，状态从 `ready-for-agent` → `claimed` → `resolved`，`map.md` 记录决策与结论。
3. **隔离推进**：互不依赖的工单在独立 git worktree 中并行，合并回 `main` 后必须重跑全量测试。
4. **测试闸门**：`go vet`、`go test`、`tsc --noEmit`、`npm test`、Playwright 是固定闸门，绿灯才允许合并或交付。
5. **人机分工**：人类负责需求、验收标准、关键取舍确认与合并授权；AI 负责规格整理、实现、测试、文档初稿与验证执行。
6. **文档即事实**：代码与文档不一致时，修正文档是交付的一部分；未交付的能力不得写成“已支持”。

---

## 二、时间线

| 阶段 | 日期 | 目标 | 主要产出 | 验证 | 代表提交 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 领域与规格 | 10-22 下午 | 把题面收敛为术语、规格与架构边界 | `GLOSSARY.md`、`docs/SPEC.md`、ADR 0001–0006 | 文档评审、后端骨架编译 | `badf514`、`5ba63ce` |
| 后端核心 | 10-22 晚间 | 引擎、原子审计、批量规则、评估 API、种子数据 | `backend/internal/*`、`migrations/` | `go test ./...` 四包通过 | `1c8a28c`、`127d6ac`、`7e03554` |
| 前端路由重构 | 10-23 上午 | 把巨石抽屉拆成路由化详情工作台 | `frontend-refactor` 工单 01–10 | 页面级集成测试、`tsc`、构建 | `0d51821`、`a49aab2`、`3dc2627`、`c18cf18` |
| 视觉复刻与页面收口 | 10-23 下午–晚间 | 1:1 复刻、列表/宫格、审计台、合并治理 | `prototype-replica` 01–07、工单 10–23 | 全量测试、真实浏览器截图 | `0e42609`、`78b6f39`、`8151529` |
| 评估/审计重设计 | 10-24 凌晨 | 决策链路、默认值快照、审计时间轴 | 工单 22–23 | 前端全量测试、真实浏览器检查 | `01c3fd2`、`aeb4f28`、`e448963` |
| UI 统一与打磨 | 10-24 凌晨–早晨 | 字体、品牌橙、导航资产、设置层级、环境下拉 | 工单 24–31 | 148 项前端测试、13 条 e2e、多尺寸检查 | `d8690f3`、`ebf05b7` |
| 最终验收与清理 | 10-24 早晨 | 全量回归、核心链路 e2e、数据清理、仓库整理 | `core-flow.spec.ts`、`cleanup-e2e-data.sh` | 18 条 e2e、148 项前端、后端全量 | `f1ab5f7`、`9b9dce1` |

---

## 三、关键任务 Prompt 与决策

### 3.1 原子审计：业务与历史同生共死

> 工单 02 原文（节选）：“系统在同一个数据库事务中原子记录每次创建、修改与启停行为至操作历史（Audit Log）……”

- **AI 执行**：Service 层统一使用 `WithTransaction`，业务写入与 `audit_logs` 写入在同一事务内完成；审计记录冗余保存 Flag Key、环境、默认返回值快照与结构化 Diff。
- **人工约束**：不接受“先写业务、异步补审计”或“失败后补偿”；任何一步失败必须整单回滚。
- **证据**：`backend/internal/service/flag_service.go`、`flag_service_audit_test.go`；规则同步回滚测试 `TestRuleService_SyncRules_AtomicRollback_OnAuditFailure`。

### 3.2 批量规则同步：一次提交，精确 Diff

> 工单 03 原文（节选）：“所有规则变更通过单次批量提交保存，后端自动计算精确的三向差异（新增、修改、删除），并在同一数据库事务中原子同步规则表并记录 RULES_SYNCED 审计日志。”

- **AI 执行**：`PUT /api/v1/flags/:id/rules` 接收规则全集；后端在事务内比对新增/修改/删除；对保留规则先施加 `+1,000,000` 临时优先级偏移，避免调序时的瞬态唯一键冲突；内容无变化时跳过审计。
- **人工约束**：不采用单条 CRUD，保证调序过程没有中间态；空提交不得产生空白审计。
- **证据**：`backend/internal/service/rule_service.go`、`rule_service_test.go`；ADR 0004。

### 3.3 严格类型评估引擎：不做 JS 式隐式转换

> 工单 04 原文（节选）：“规则匹配执行严格类型隔离与精确数值比对（1 与 1.0 相等、大整数无精度损失、严禁跨类型匹配，null 或缺失属性安全跳过）。”

- **AI 执行**：`internal/engine` 作为纯内存模块，按 priority 升序逐条匹配，首条命中立即短路；停用直接返回 `false`（`FLAG_DISABLED`）；未命中回退默认值；数值使用 `*big.Rat` 精确比较，`"1"` 与 `1` 不相等。
- **人工约束**：引擎零 DB、零网络、零时钟依赖，保证可穷举测试与确定性。
- **证据**：`backend/internal/engine/engine.go`、`engine_test.go`；ADR 0003。

### 3.4 前端路由重构：单一 URL 与草稿守卫

> Spec v2.4 问题陈述（节选）：“没有浏览器路由体系支持，用户无法通过 URL 直接分享、收藏或刷新定位页面……浏览器前进后退失效，刷新即丢失当前视图与选中 Tab。”  
> 同一份规格还指出：未保存草稿与导航逻辑矛盾，切换 Tab 或跳转控制台容易误丢修改。

- **AI 执行**：引入 `createBrowserRouter` 与 AppShell；详情页 `/flags/:id?tab=rules|audit|settings` 绑定 URL；规则草稿与已生效值分离；`useBlocker` + `beforeunload` 拦截误离开。
- **人工约束**：Tab 不再使用独立路由，避免一个详情出现多个 URL；返回导航必须保留来源列表与筛选。
- **证据**：`frontend/src/router.tsx`、`FlagDetailPage.tsx`、`AppShell.tsx`；`frontend-refactor` 工单 01–10。

### 3.5 视觉复刻与 UI 收口：先对齐，再统一

> Prototype Spec（节选）：“基于提供的独立前端高保真交互原型……进行 1:1 像素级视觉与交互复刻。”  
> 工单 26（节选）：“将评估结果重排为摘要、真实决策链路、下一步操作；后端补充逐条规则解释。”

- **AI 执行**：迁移设计 Token 与导航资产；评估结果区改为“来源 + 返回值”单行摘要，链路按实际执行顺序展示；环境筛选改为触发器 + 下拉面板；字体与品牌橙全站统一。
- **人工约束**：所有状态变更必须继续走真实 API；视觉改动不得回退已有交互契约与测试。
- **证据**：工单 24–31、`output/playwright/` 截图、`EvaluationDecision.tsx`、`RuleWorkspace` 相关测试。

### 3.6 最终验收：测试、清数、交付

> 用户指令原文（2026-10-24）：“参照这个要求，再做最后一班检验与测试，跑e2e，如果没有问题，删除掉所有冒烟测试的数据，准备打包成可交付的形态，并上传github，执行完给我汇报一下。”

- **AI 执行**：全量回归 → 新增 5 条核心链路 e2e → 修复 `NODE_ENV` 导致的 120 项误报 → `make e2e-clean` 清理 28 个 smoke Flag 与 85 条审计 → 整理仓库并推送。
- **人工约束**：清理只删测试数据，演示数据不得受影响；交付前工作区必须 clean。
- **证据**：`docs/ai/VERIFICATION_LOG.md`；提交 `f1ab5f7`、`9b9dce1`。

---

## 四、AI 输出被纠正的记录

| 问题 | 发现方式 | 根因 | 修复 | 防再犯 |
| :--- | :--- | :--- | :--- | :--- |
| 合并后详情页测试报 `Cannot read properties of undefined (reading 'then')`，掉进路由错误边界 | 合并后跑全量前端测试 | 列表导航测试挂载真实详情页，`getFlag` mock 缺失 | 补齐 `getFlag` 桩 | 合并闸门固定跑全量，不看单文件绿灯 |
| 创建流转测试稳定 4.5–5s，贴近 Vitest 5s 默认超时，全量并行约 1/4 失败 | 全量测试抖动 | 页面级集成测试耗时长且与默认超时贴边 | 页面级超时提升至 20s，最终全局 60s | 超时按最慢路径设计，不按空载时长设计 |
| 前端 120 项失败，报 `act(...) is not supported in production builds of React` | 最终验收执行 `npm test` | 宿主 shell 导出 `NODE_ENV=production`，Vitest 载入 React 生产构建 | `vite.config.ts` 在依赖解析前固定测试环境 | 配置内固化，不依赖执行者 shell |
| 新增核心链路 e2e 的审计断言失败 | 该用例首次运行 | 误以为审计接口返回 `{ items }`，实际 `data` 直接是数组 | 按真实响应改为 `body.data.map(...)` | 断言前先看一次真实响应 |
| 文档测试规模与工单状态陈旧（写作 52 项 / 仍有待办） | 最终验收逐项核对 | 文档未随迭代同步 | 更新为 148 项、18 条 e2e、全部 resolved | 最终验收统一回写文档 |
| 旧 `image/` 截图与最终橙色 UI 不一致 | 整理交付物时对比 | 截图采于早期蓝色主题 | 设计参考归档至仓库外，截图不进入交付 | 截图只从最终构建采集 |
| e2e 注释声称会自动清理，实际没有；累计 28 个 smoke Flag、85 条审计 | 清理测试数据时统计 | 注释与实现不一致，缺少 afterAll | 新增 `scripts/cleanup-e2e-data.sh` 与 `make e2e-clean` | 清理作为独立可验证步骤，核对前后计数 |

---

## 五、工程约束的落地证据

| 约束 | 落地方式 | 证据 |
| :--- | :--- | :--- |
| 零 Mock 前端 | 运行时全部直连 Go API；`msw` 仅测试期依赖 | `frontend/src/api/client.ts`；Playwright 真实全栈 |
| 原子审计 | Service 层 `WithTransaction` 包裹业务与审计写入 | `flag_service.go`；原子回滚测试 |
| 引擎纯洁性 | `internal/engine` 无 DB/网络/时钟依赖 | `engine.go`；引擎单元测试 |
| 错误契约 | 统一 `{code, message, data}` 信封与领域错误码 | `handler/response.go`；`domain/errors.go` |
| 严格类型 | `*big.Rat` 数值比较 + 标量类型隔离 | `engine.go`；`engine_test.go` |
| 演示数据 | `seed.go` 幂等装载 4 个 Key / 5 条 Flag | `seed_test.go`；`docs/ai/VERIFICATION_LOG.md` |

---

## 六、结果与边界

- **交付结果**：截至 `9b9dce1` 共 65 条提交、49 张工单全部 resolved；后端 4 个测试包、前端 14 个文件 / 148 项、Playwright 18 条全部通过。
- **数据状态**：e2e 写入的 28 个 `smoke_*` Flag 与 85 条审计已清理，数据库只保留演示数据；清理前后计数见验收日志。
- **未完成项**：登录/RBAC、百分比灰度、配置版本与回滚、规则拖拽排序、环境间复制、乐观锁与分布式缓存。题面允许固定操作者，因此未引入登录系统。
- **已知限制**：Flag 不支持删除（保留审计可追溯）；评估实时读 PostgreSQL，未加缓存；测试库需单独准备 `feature_flag_test`。
- 功能与语义细节以根目录 `README.md` 与 `docs/SPEC.md` 为准。

---

## 七、证据索引

| 证据 | 位置 |
| :--- | :--- |
| 原始任务轨迹（49 张工单、3 张地图） | `.scratch/` |
| 题目原文 | `docs/task-brief.md` |
| 规格与架构决策 | `docs/SPEC.md`、`docs/adr/` |
| 最终验收命令与结果 | `docs/ai/VERIFICATION_LOG.md` |
| 过程截图（71 张） | `output/playwright/` |
| 代码演进 | `git log`（截至 `9b9dce1` 共 65 条提交，2026-10-22 → 10-24） |

---

## 八、记录边界

- 本记录是**整理稿**，不是逐字对话转录；原始会话分散在 Antigravity 与其他工具中，未逐条导出。
- 引用的 Prompt 均来自仓库内工单、规格文档或用户指令原文，并已标注来源；未虚构对话。
- 工具署名以本版为准：Antigravity 为主力，Orca 是工作树管理工具而非 AI 模型。
- 如需补充原始会话，放在 `docs/ai/sessions/`，单文件控制在 100 行以内并脱敏。
