# Feature Flag 与灰度规则管理平台

基于 **Go + Gin + GORM + PostgreSQL + React 18 + TypeScript + Ant Design 5** 的轻量 Feature Flag 平台，支持多环境开关、有序属性规则、在线评估与原子审计。

> 最后验证：2026-10-24，后端全量测试、前端 148 项、Playwright 18 条通过。详见 [`docs/ai/VERIFICATION_LOG.md`](docs/ai/VERIFICATION_LOG.md)。

---

## 1. 快速启动

### 方式 A：Docker Compose（推荐）

```bash
docker compose up --build -d
```

启动后：

| 服务 | 地址 | 说明 |
| :--- | :--- | :--- |
| 前端 | <http://localhost:3000>（同时映射 80） | Nginx 托管 SPA，`/api` 反向代理到后端 |
| 后端 | <http://localhost:8080/health> | Go API，健康检查返回 `{"status":"ok"}` |
| PostgreSQL | `localhost:5432` | 用户/密码 `postgres/postgres`，库 `feature_flag_db` |

首次启动会自动执行迁移并**幂等**载入演示数据，重复启动不会重复插入。

```bash
docker compose down          # 停止
docker compose down -v       # 停止并删除数据库卷（下次启动重新播种）
```

### 方式 B：本地开发

依赖：Go 1.25+、Node.js 20+、PostgreSQL 14+。

```bash
# 1. 建库
createdb feature_flag_db

# 2. 启动后端（自动迁移 + 演示数据）
cd backend
export DATABASE_URL="host=localhost port=5432 user=postgres password=postgres dbname=feature_flag_db sslmode=disable"
go run ./cmd/server

# 3. 新终端启动前端
cd frontend
npm install
npm run dev
```

前端开发服务器为 `http://localhost:3000`，`/api` 自动代理到 `8080`。如果本机 PostgreSQL 账号不同，改 `DATABASE_URL`，或使用 `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` / `DB_SSLMODE` 分段配置。

### 演示数据

| Key | 环境 | 说明 |
| :--- | :--- | :--- |
| `ai_ride_assistant_enabled` | production | 规则：`user_id in [10001,10002]` → true；默认 false |
| `ai_ride_assistant_enabled` | development | 无规则，默认 true |
| `robotaxi_r2_trial_enabled` | staging | 优先级 1：`pilot_paused equals true` → false；优先级 2：`user_id in [20001,20002]` → true |
| `safety_ai_upgrade_enabled` | production | 默认停用，用于演示停用熔断 |
| `robotaxi_uae_pilot_enabled` | staging | `pilot_cohort equals "uae_preview"` → true |

种子共 4 个 Key、5 条 Flag、5 条规则、5 条创建审计。

---

## 2. 目录结构

```text
backend/
├── cmd/server/              # 入口：加载配置、迁移、种子、注册路由
├── internal/
│   ├── domain/              # 实体、请求模型、错误码
│   ├── engine/              # 纯内存规则评估引擎（无 DB / 网络）
│   ├── handler/             # Gin 路由与统一 HTTP 响应
│   ├── repository/          # GORM 数据访问、迁移、演示数据
│   └── service/             # 业务编排、事务、审计
├── migrations/              # 建表与增量 SQL
└── Dockerfile

frontend/
├── src/
│   ├── api/                 # HTTP client 与统一响应解包
│   ├── components/          # 规则工作台、JSON 编辑器、决策链路等
│   ├── layout/              # AppShell、侧边栏与导航
│   ├── pages/               # 列表 / 详情 / 评估 / 审计
│   ├── styles/              # 全局样式与设计 Token
│   └── utils/
├── e2e/                     # Playwright 冒烟与核心链路用例
└── Dockerfile

docs/
├── SPEC.md                  # 需求、数据模型、API 与验收细则
├── adr/                     # 架构决策记录（0001–0006）
├── ai/                      # AI 协作记录与验收日志
└── task-brief.md            # 题面原文

scripts/cleanup-e2e-data.sh  # 清理 smoke_* 测试数据
output/playwright/           # 过程验收截图
.scratch/                    # 工单、工作流地图与决策记录
docker-compose.yml
Makefile
README.md
```

---

## 3. 页面与功能

| 页面 | 路由 | 功能 |
| :--- | :--- | :--- |
| 功能开关列表 | `/flags` | 搜索、环境筛选、状态统计、列表/宫格切换、新建抽屉、行内启停 |
| Flag 详情 | `/flags/:id`（Tab：规则配置 / 基本设置 / 变更历史） | 基本信息、启停、规则工作台、变更历史 |
| 在线评估 | `/evaluations?flag_key=&environment=` | 输入 Key / 环境 / JSON 上下文，查看返回值、命中规则与决策链路 |
| 全局操作历史 | `/audit-logs` | 跨 Flag 审计、按环境/Key/动作筛选、结构化 Diff 展开 |

详情页的三个 Tab 共用 `/flags/:id`；`?tab=` 与旧路径 `/flags/:id/rules` 等只作为初始深链入口，加载后会规范化为单一 URL。

---

## 4. 规则语义

- **优先级方向**：正整数，`1` 最高，按数值升序执行。
- **匹配顺序**：第一条命中的规则立即决定结果，后续规则不再计算。
- **未命中**：返回 Flag 的 `default_value`。
- **停用**：Flag 停用时始终返回 `false`，不执行规则，原因标记为 `FLAG_DISABLED`。
- **重复优先级**：拒绝。数据库有 `(flag_id, priority)` 唯一约束，API 返回 `409 PRIORITY_CONFLICT`。
- **严格类型**：`equals` 与 `in` 不做跨类型转换，`"1"` 不等于 `1`，`1` 等于 `1.0`；数值使用高精度有理数比较，大整数不丢精度。
- **缺失/null**：属性缺失或为 `null` 时该条规则不命中，不影响后续规则。

`equals` 的期望值是单个 JSON 标量；`in` 的期望值是 JSON 数组，按标量严格比对。

| 场景 | 上下文 | 结果 |
| :--- | :--- | :--- |
| 命中规则 | `{"user_id": 10001}`（production AI 助手） | `true`，`RULE_MATCH` |
| 首条规则优先 | `{"pilot_paused": true, "user_id": 20001}`（staging R2） | `false`，优先级 1 先命中 |
| 未命中回退 | `{}` | `false`，`DEFAULT_FALLBACK` |
| 停用短路 | 任意上下文（`safety_ai_upgrade_enabled`） | `false`，`FLAG_DISABLED` |

评估响应同时返回 `rule_count` 与 `rule_trace`，逐条记录实际值、期望值、是否命中及未命中原因（缺失、null、类型不匹配、值不匹配、不在集合内、规则无效）。

---

## 5. 数据模型与迁移

| 表 | 关键字段 | 约束 |
| :--- | :--- | :--- |
| `flags` | `id`、`key`、`name`、`description`、`environment`、`enabled`、`default_value`、`created_at`、`updated_at` | `UNIQUE (key, environment)` |
| `rules` | `id`、`flag_id`、`attribute_name`、`operator`、`expected_value`（jsonb）、`return_value`、`priority`、时间戳 | `UNIQUE (flag_id, priority)`；`flag_id` 外键级联删除 |
| `audit_logs` | `id`、`flag_id`、`flag_key`、`environment`、`action_type`、`operator`、`default_value`（快照，可空）、`diff_summary`（jsonb）、`created_at` | 保留历史，`flag_id` 不设外键 |

- 迁移文件：`backend/migrations/000001_init.up.sql`、`000002_audit_log_default_value.up.sql`，启动时按文件名顺序执行，语句幂等；GORM `AutoMigrate` 兜底。
- 审计动作：`FLAG_CREATED`（新建开关）、`FLAG_UPDATED`（修改信息）、`FLAG_TOGGLED`（启停）、`RULES_SYNCED`（规则变更）。
- 演示数据由 `backend/internal/repository/seed.go` 幂等插入：只补充缺失的 Flag，不覆盖已存在的配置。

---

## 6. API 一览

业务 API 以 `/api/v1` 为前缀（健康检查为 `/health`），统一响应信封：

```json
{ "code": "SUCCESS", "message": "Operation successful", "data": {} }
```

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| GET | `/health` | 健康检查 |
| GET | `/api/v1/flags?environment=&search=&enabled=&page=&page_size=` | Flag 列表，含状态统计 `stats` |
| POST | `/api/v1/flags` | 新建 Flag |
| GET | `/api/v1/flags/:id` | Flag 详情（含按优先级排序的规则） |
| PUT | `/api/v1/flags/:id` | 修改名称、描述、默认值 |
| PATCH | `/api/v1/flags/:id/toggle` | 启用 / 停用 |
| PUT | `/api/v1/flags/:id/rules` | 整组规则同步（新增 / 修改 / 删除） |
| GET | `/api/v1/flags/:id/audit-logs` | 单个 Flag 的审计记录 |
| GET | `/api/v1/audit-logs?environment=&flag_key=&action_type=&page=&page_size=` | 全局审计列表 |
| POST | `/api/v1/evaluations` | 按 Key、环境与上下文评估 |

错误码：`VALIDATION_ERROR`（400）、`FLAG_NOT_FOUND`（404）、`FLAG_KEY_CONFLICT`（409）、`PRIORITY_CONFLICT`（409）、`INTERNAL_ERROR`（500）。

评估示例：

```bash
curl -X POST http://localhost:8080/api/v1/evaluations \
  -H 'Content-Type: application/json' \
  -d '{"flag_key":"ai_ride_assistant_enabled","environment":"production","context":{"user_id":10001}}'
```

---

## 7. 测试

### 后端

后端 repository / service / handler 测试使用真实 PostgreSQL，需要先准备测试库：

```bash
docker exec feature-flag-postgres createdb -U postgres feature_flag_test

export TEST_DATABASE_URL="host=localhost port=5432 user=postgres password=postgres dbname=feature_flag_test sslmode=disable"
cd backend && go test -count=1 ./...
```

如果本机 5432 已被占用，可用 `docker-compose.e2e.yml` 把容器库映射到 15432，并同步修改 `TEST_DATABASE_URL` 的端口。

### 前端

```bash
cd frontend
npm test          # 14 个测试文件 / 148 项
npm run build     # 类型检查 + 生产构建
```

### 真实浏览器 e2e

需要先拉起 Compose 全栈，并使用本机 Chrome：

```bash
docker compose up -d --build
make e2e          # 18 条：13 条冒烟 + 5 条核心链路
make e2e-clean    # 清理 smoke_* Flag、规则与审计
```

`make test` 会依次执行后端与前端测试，同样需要上面的测试库。

---

## 8. 已完成 / 未完成 / 已知限制

**已完成**

- Flag 列表、搜索、环境筛选、状态统计、新建、编辑、启停、详情。
- 有序规则：属性名、`equals` / `in`、期望值、返回值、优先级；整组原子同步与 Diff 审计。
- 在线评估：JSON 上下文、三态结果、命中规则、逐条决策链路、JSON 语法与不存在 Flag 的错误提示。
- 操作历史：单 Flag 变更时间轴与全局审计表格，业务变更与审计同事务提交。
- 数据库迁移、幂等演示数据、Docker Compose 一键启动。
- 后端单元/集成测试、前端组件与页面测试、18 条 Playwright e2e。

**未完成**

- 登录与角色权限（题面允许固定操作者 `admin`）。
- 百分比灰度、配置版本与回滚、规则拖拽排序、环境间配置复制。
- 在线部署与 CI 流水线。
- Flag 删除接口（当前只支持停用，保留审计可追溯）。

**已知限制**

- 后端集成测试依赖单独的 `feature_flag_test` 数据库，首次运行需按第 7 节创建。
- 演示数据只补充缺失项，不会更新已存在的 Flag；修改 seed 后需清空数据库卷或手工调整。
- 并发编辑采用最后写入生效，未实现乐观锁。
- 评估请求实时读取 PostgreSQL，未引入缓存；适合轻量管理平台。
- 导航图片约 3MB；生产包 JS 约 1.2MB、CSS 约 85KB，未做代码分割。

---

## 9. 设计取舍

- **规则整组同步**：`PUT /api/v1/flags/:id/rules` 一次提交全量规则，后端在同一事务内计算新增、修改、删除。调序是一次完整状态变更，整组提交能保证原子性与顺序一致性。证据：`backend/internal/service/rule_service.go`、`rule_service_test.go`。
- **业务与审计同事务**：创建、修改、启停、规则同步都在 `WithTransaction` 内同时写业务表与 `audit_logs`，避免业务成功而历史丢失。证据：`flag_service.go`、原子回滚测试。
- **优先级严格唯一**：用数据库唯一约束 `(flag_id, priority)` 保证确定性，冲突直接返回 `409`；前端用上移/下移维持 `1..N` 连续序列。证据：迁移脚本、`PRIORITY_CONFLICT` 测试。
- **严格 JSON 类型**：`equals` / `in` 按标量类型隔离，数值用 `*big.Rat` 精确比较，避免 JavaScript 式隐式转换。证据：`backend/internal/engine/engine.go`、`engine_test.go`。
- **单一详情 URL**：详情页三个 Tab 共用 `/flags/:id`，切换 Tab 不新增 URL 或历史记录；`?tab=` 仅作为深链入口。证据：`frontend/src/router.tsx`、`FlagDetailPage.test.tsx`。

---

## 10. AI 协作记录

本项目由 AI 辅助完成需求拆解、实现、测试与交付：主力工具为 **Antigravity**，辅以其他 AI 工具与终端代理，工程侧使用 Orca / git worktree 管理并行工作树。

- [`docs/ai/README.md`](docs/ai/README.md)：索引、工具分工、阶段与证据地图
- [`docs/ai/AI_COLLABORATION_LOG.md`](docs/ai/AI_COLLABORATION_LOG.md)：协作方式、关键 Prompt、纠错记录
- [`docs/ai/VERIFICATION_LOG.md`](docs/ai/VERIFICATION_LOG.md)：最终验收命令、结果与数据清理

记录为整理稿，不追求逐字转录；原始会话分散在多个工具中。可核对证据以 `.scratch/` 工单、git 提交、测试结果与 `output/playwright/` 截图为准。

---

## 11. 常见问题

**端口被占用怎么办？**
前端默认 `3000` 与 `80`，后端 `8080`，PostgreSQL `5432`。改 `docker-compose.yml` 的端口映射即可；若只是本机 5432 被本地 PostgreSQL 占用，用 `docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d` 把容器库映射到 `15432`。

**`go test` 报数据库连接失败？**
先按第 7 节创建 `feature_flag_test` 并设置 `TEST_DATABASE_URL`。

**为什么本地 `npm test` 不用设置 `NODE_ENV`？**
`vite.config.ts` 会在 Vitest 启动时固定测试环境，避免宿主环境变量影响 React 构建。

**如何恢复初始演示数据？**
`docker compose down -v` 后重新 `up`；注意这会删除数据库卷中的全部数据。

**演示数据定义在哪里？**
`backend/internal/repository/seed.go`。
