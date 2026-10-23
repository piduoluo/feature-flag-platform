# AI 协同开发记录与操作日志 (AI Collaboration Log)

本项目由 AI 编码助手在本地仓库内完成主要实现，人类负责需求决策、方向确认与合并授权。以下记录按实际发生的协作方式整理，不虚构工具与流程。

---

## 一、协作工具与角色分工

* **使用工具**：
  * **Codex** —— 终端内运行的 agentic 编码助手，负责读代码、改代码、跑测试与提交。
  * **Orca / git worktree** —— 多工作树管理，用于把互不依赖的工单并行推进，避免互相踩踏。
* **角色分工**：
  * **架构与领域建模**：产出 `GLOSSARY.md`、`docs/SPEC.md` 与 ADR `0001`~`0006`。
  * **后端**：Go + Gin + GORM，纯内存规则引擎、物理事务、Service/Handler 分层与测试。
  * **前端**：React 18 + TypeScript + Ant Design 5，零 Mock 直连真实 API。
  * **验证**：`go test ./...`、`vitest run`、`tsc --noEmit` 作为每次交付的闸门。

---

## 二、协作机制

1. **工单驱动**：所有工作先落到 `.scratch/<主题>/issues/<NN>-<slug>.md`，状态从 `ready-for-agent` → `claimed` → `resolved`，`map.md` 汇总全景与决策记录。
2. **一工单一切片**：每个 Ticket 在独立分支/工作树完成，提交信息带 Ticket 编号，合并回 `main` 后必须重跑全量测试。
3. **文档即事实**：`AGENTS.md` 规定实现前必读术语表、SPEC 与 ADR；文档与代码不一致时，以修正文档为交付的一部分（例如审计时间轴未交付就不得写成"已支持"）。
4. **测试闸门**：任何分支合并前跑前端全量 + 后端全量 + 类型检查，绿灯才允许进入 `main`。

---

## 三、关键阶段与决策轨迹

### 阶段 1：领域建模与架构决策

* **诉求**：先定术语、边界与不可让步的架构约束，再写代码。
* **产出**：`GLOSSARY.md`、`docs/SPEC.md`（24 条 User Story）、ADR `0001`~`0006`。
* **关键决策**：
  * 优先级数值越小越优先（`1` 最高），重复优先级严格拒绝 `PRIORITY_CONFLICT`。
  * JSON 严格类型隔离，`"1"` 与 `1` 绝不相等。
  * 业务写入与审计写入必须在同一物理事务内。

### 阶段 2：纯内存规则引擎

* **诉求**：引擎零 I/O、可穷举边界、可解释。
* **产出**：`backend/internal/engine`，`*big.Rat` 有理数比对避免浮点误差与跨类型误匹配；停用即短路返回 `false`（`FLAG_DISABLED`）。
* **验证**：`go test ./internal/engine/...` 覆盖停用短路、优先级抢占、缺失属性、类型隔离。

### 阶段 3：原子事务与批量规则同步

* **诉求**：客户端提交规则全集，后端在单事务内算 Diff 并写审计。
* **产出**：`PUT /api/v1/flags/:id/rules` 全量同步；对保留规则先施加 `+1,000,000` 临时优先级偏移，规避 `uq_rules_flag_priority` 的瞬态唯一键冲突。
* **验证**：真实数据库测试 `TestRuleService_SyncRules_AtomicRollback_OnAuditFailure` 验证审计写入失败时规则变更整体回滚。

### 阶段 4：前端 UI 迁移与重构

* **诉求**：把单体抽屉拆成路由化的详情工作台，并保证草稿态不被误丢。
* **产出**：
  * Ticket 01：`createBrowserRouter` 路由树、AppShell、面包屑、根路径重定向、Nginx `try_files`。
  * Ticket 02：列表过滤态与 `?environment=&search=` 双向同步、`FLAG_KEY_CONFLICT` 拦截与跨环境 Key 复用、行内启停以服务端实体回写。
  * Ticket 03~06：`/flags/:id` 全屏工作台、`?tab=rules|audit|settings` 绑定、规则卡片流以数组顺序为唯一优先级事实源、悬浮保存栏纯绑定 `isRulesDirty`、全域脏检查与 `useBlocker`/`beforeunload` 离开守卫。
* **验证**：`FlagListPage.test.tsx` 11 项、`FlagDetailPage.test.tsx` 12 项、`ruleDraft.test.ts` 3 项等。

### 阶段 5：并行工作树与合并治理

* **做法**：Ticket 02 与 Ticket 03~06 从同一基线 `main` 各开一条支线并行推进，两者文件集不重叠，先合并 02，再合并 03~06。
* **合并后回归暴露了两个 git 看不出来的真实问题，均已修复**：
  1. Ticket 02 的列表页导航测试会挂载真实 `/flags/:id`，而新详情页 mount 即调用 `api.getFlag`；旧 mock 返回 `undefined` 导致 `Cannot read properties of undefined (reading 'then')`，页面掉进路由错误边界。→ 补齐 `getFlag` 桩。
  2. Flag 创建流转测试稳定耗时 4.5~5s，紧贴 vitest 默认 5s 超时，全量并行时约 1/4 概率失败。→ 页面级集成测试超时提升至 20s。
* **结论**：文本零冲突 ≠ 行为无冲突，合并后必须跑全量测试才算真正合入。

### 阶段 6：最终验收、数据清理与交付

* **诉求**：按题面做最后一轮验收：全量测试 → 真实浏览器 e2e → 清理测试数据 → 整理可交付仓库。
* **执行**：
  1. `go vet ./...` + `go test -count=1 ./...` 全绿；`tsc --noEmit` + `npm test` 的 14 个测试文件 / 148 项全绿；`npm run build` 成功。
  2. 发现宿主 shell 预置 `NODE_ENV=production` 会让 Vitest 载入 React 生产构建，`act()` 不可用导致 120 项误报；在 `vite.config.ts` 依赖解析前固定测试环境，使 `npm test` 与宿主环境解耦。
  3. 新增核心链路 e2e `frontend/e2e/core-flow.spec.ts`：真实抽屉建 Flag → 启停 → 配规则（`country equals "CN"`）→ 评估命中 / 默认值回退 / 停用熔断 → 审计四类记录；与既有 13 条冒烟用例合计 18 条全部通过。
  4. 新增 `scripts/cleanup-e2e-data.sh` 与 `make e2e-clean`，按 `smoke_%` 前缀清理 Flag、规则与审计，5 条演示数据原样保留。

---

## 四、工程约束的实际执行

| 约束 | 落地方式 |
| :--- | :--- |
| 零 Mock 前端 | 运行时全部直连 Go API；`msw` 仅作为测试期依赖，不参与运行时 |
| 原子审计 | Service 层 `WithTransaction` 包裹业务写入与 `audit_logs` 写入 |
| 引擎纯洁性 | `internal/engine` 无 DB、无网络、无时钟依赖，纯 CPU 求值 |
| 错误契约 | 统一 `{code, message, data}` 信封与 `FLAG_KEY_CONFLICT` / `PRIORITY_CONFLICT` / `VALIDATION_ERROR` 等领域错误码 |
| 演示数据 | 由 `backend/internal/repository/seed.go` 幂等装载 4 组场景（含规则与初始审计），不再依赖 SQL 种子脚本 |

---

## 五、成效与评估

1. **测试规模**：前端 14 个测试文件、148 项组件/页面集成测试；后端覆盖 engine / handler / repository / service 四层（含真实 PostgreSQL 事务测试）；Playwright 18 条真实浏览器用例（13 条冒烟 + 5 条核心链路）。
2. **缺陷发现前移**：合并回归阶段拦下 mock 缺口与超时抖动；最终验收阶段拦下宿主 `NODE_ENV` 污染导致的全量误报。
3. **一致性**：术语、ADR、错误码与工单状态在文档与代码间保持同步，AI 在每个阶段都以"读文档 → 改代码 → 跑测试"闭环推进；测试数据与演示数据隔离，交付前数据库只保留演示数据。

---

## 六、已知边界

* 未实现登录与角色权限（题面允许固定操作者 `admin`）。
* 未实现百分比灰度，当前仅支持 `equals` / `in` 属性规则。
* 评估请求实时读取 PostgreSQL，未引入分布式缓存；符合轻量管理平台定位。
