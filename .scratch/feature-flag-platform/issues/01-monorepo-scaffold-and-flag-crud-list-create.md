# 01: Monorepo 基础脚手架与 Flag 列表及创建

**What to build:**
一个完整的垂直切片：配置管理员和研发人员能够访问平台前端，查看按环境（development、staging、production）筛选或按关键字搜索的 Feature Flag 列表，并可以通过新建抽屉在指定环境下创建一个全新的 Flag。若在同一环境下尝试创建已存在的 Flag Key，系统会给出清晰的冲突提示（FLAG_KEY_CONFLICT）；在不同环境下创建相同的 Flag Key 则能顺利成功。所有 Flag 数据持久化到 PostgreSQL 数据库中。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 研发人员可以在特定环境（development、staging 或 production）下创建一个具备唯一 Key、名称、可选描述及默认布尔返回值的 Flag
- [x] 研发人员可以在不同环境中使用相同的 Flag Key
- [x] 在同一环境下试图创建重复 Flag Key 时，系统返回明确的业务冲突错误码（FLAG_KEY_CONFLICT）并在前端展示友好警示
- [x] 前端 Flag 列表支持按环境筛选及按名称/Key 搜索，展示 Flag 启停徽标与默认返回值，包含清晰的加载状态与空状态占位
- [x] 创建 Flag 表单具备前端必填项与格式校验，提交期间禁用按钮防止重复提交
- [x] 自动化测试覆盖 Flag 在同一环境下 Key 唯一的物理约束校验及创建/检索接口功能

## Answer
已完整实现 Ticket 01 纵向切片：
1. **Monorepo 脚手架搭建**：
   - 后端：Go 1.27 + Gin + GORM + PostgreSQL，严格遵循 `Handler -> Service -> Repository -> Database` 单向分层。
   - 前端：Vite + React 18 + TypeScript + Ant Design 5，配置 `/api` 代理至后端端口。
2. **数据库模式与物理约束**：
   - 编写 `backend/migrations/000001_init.up.sql`，建立 `flags`、`rules`、`audit_logs` 表，为 `(key, environment)` 建立物理级复合唯一索引约束。
3. **后端业务与 API 实现**：
   - 统一响应外壳 `{ code, message, data }` 与全大写业务错误码（`FLAG_KEY_CONFLICT`, `VALIDATION_ERROR`, `FLAG_NOT_FOUND`）。
   - `POST /api/v1/flags`：校验非空、slug 格式、环境有效性；同一环境重复返回 409 `FLAG_KEY_CONFLICT`，不同环境允许复用同名 Key；在单事务中原子持久化 Flag 与初始 AuditLog。
   - `GET /api/v1/flags`：支持环境过滤、Key/Name 模糊搜索及分页查询，零命中返回空数组 `[]`。
4. **前端交互与状态呈现**：
   - `FlagListPage`：支持按环境筛选、关键字搜索、加载状态（Spin/Skeleton）、空状态占位、启停状态 Badge 及更新时间展示；提供全局错误 Alert 捕获。
   - `CreateFlagDrawer`：提供环境、Key、名称、描述及默认返回值表单；前端即时查重预检与必填/正则校验；提交中禁用按钮防重；精确捕获 `FLAG_KEY_CONFLICT` 提示友好警示。
5. **自动化测试覆盖 (TDD)**：
   - 后端：`flag_service_test.go`（5 个用例）与 `flag_handler_test.go`（5 个用例）直连真实 PostgreSQL，覆盖同环境唯一冲突、跨环境复用、字段校验与检索。
   - 前端：`CreateFlagDrawer.test.tsx`（4 个用例）与 `FlagListPage.test.tsx`（2 个用例）全量通过。
