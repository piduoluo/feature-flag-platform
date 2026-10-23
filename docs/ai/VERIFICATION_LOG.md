# 最终验收操作日志

> 本文件记录交付前的最后一次全量验证：执行了什么命令、得到什么结果、清理了哪些测试数据。
>
> **日期**：2026-10-24  
> **记录时提交**：`9b9dce1`  
> **环境**：macOS (arm64)、Go 1.27.3、Node 24.13.0、npm 11.6.2、Docker 29.7.2、PostgreSQL 16.14（容器）、Playwright 使用本机 Chrome

---

## 一、命令与结果

| 目的 | 命令 | 结果 |
| :--- | :--- | :--- |
| 后端静态检查 | `cd backend && go vet ./...` | 通过，无输出 |
| 后端测试 | `cd backend && go test -count=1 ./...` | engine / handler / repository / service 全部 `ok` |
| 前端类型检查 | `cd frontend && npx tsc --noEmit` | 通过 |
| 前端测试 | `cd frontend && npm test` | **14 个测试文件 / 148 项全部通过**（约 125s） |
| 前端生产构建 | `cd frontend && npm run build` | 成功（3085 modules，产物约 1.2MB JS + 85KB CSS） |
| 真实浏览器 e2e | `cd frontend && npx playwright test` | **18/18 通过**（5 条核心链路 + 13 条冒烟，约 49s） |
| e2e 数据清理 | `make e2e-clean` | 删除 28 个 `smoke_*` Flag 与 85 条审计记录 |
| 健康检查 | `curl :8080/health`、`curl :3000/flags` | `200` |
| 评估 API 冒烟 | `POST /api/v1/evaluations` | 规则命中 `true/RULE_MATCH`；空上下文 `false/DEFAULT_FALLBACK`；不存在的 Flag 返回 `404` |
| 干净克隆构建 | clone 后 `go build` + `npm ci` + `npm run build` | 通过（克隆自 `f1ab5f7`） |

---

## 二、验收过程中发现并修复的问题

| 问题 | 现象 | 修复 |
| :--- | :--- | :--- |
| 宿主 `NODE_ENV=production` 污染测试 | 前端 120 项失败，报 `act(...) is not supported in production builds of React` | 在 `vite.config.ts` 依赖解析前固定测试环境，`npm test` 不再依赖 shell |
| 新 e2e 审计断言写错 | 核心链路用例首次运行失败 | 审计接口 `data` 是数组，按真实契约改为 `body.data.map(...)` |
| e2e 测试数据无自动清理 | 累计 28 个 smoke Flag、85 条审计 | 新增 `scripts/cleanup-e2e-data.sh` 与 `make e2e-clean`，按前缀清理并核对前后计数 |
| 文档数字陈旧 | README / AI 日志仍写 52 项测试与未完成工单 | 统一更新为 148 项、18 条 e2e、49 张工单全部 resolved |

---

## 三、测试数据清理记录

清理规则：删除 `key` / `flag_key` 以 `smoke_` 开头的 Flag 与审计记录；规则随 Flag 级联删除；演示数据不受影响。

| 指标 | 清理前 | 清理后 |
| :--- | ---: | ---: |
| Flag 总数 | 33 | 5 |
| `smoke_*` Flag | 28 | 0 |
| 规则总数 | 10 | 7 |
| 审计记录总数 | 96 | 11 |
| `smoke_*` 审计记录 | 85 | 0 |
| 孤儿规则 | — | 0 |

说明：

- 清理后保留 4 个演示 Key / 5 条演示 Flag / 11 条演示审计，均为种子与演示操作产生。
- 规则为 7 条而非种子中的 5 条，是因为本机数据库早前手工补充了 `country`、`plan` 两条演示规则；它们不是冒烟数据，予以保留。
- 清理命令与 SQL 见 `scripts/cleanup-e2e-data.sh`。

---

## 四、清理后的复验

在删除旧构建产物、归档设计参考、移除未使用文件后重新执行：

| 检查 | 结果 |
| :--- | :--- |
| `go vet ./...` + `go test -count=1 ./...` | 通过 |
| `npm run build` | 成功 |
| `npm test` | 14 个文件 / 148 项通过 |
| `git status --short` | 空（工作区 clean） |
| 运行中的 Compose 栈 | 前端 `200`、后端 `health 200` |
| 远端 `main` | `9b9dce1` |

---

## 五、复现说明

### 1. 后端测试库

repository / service / handler 测试使用真实 PostgreSQL，需要先准备 `feature_flag_test` 库：

```bash
# Compose 栈已启动时
docker exec feature-flag-postgres createdb -U postgres feature_flag_test

# 测试 DSN（端口按实际映射调整）
export TEST_DATABASE_URL="host=localhost port=5432 user=postgres password=postgres dbname=feature_flag_test sslmode=disable"

cd backend && go test -count=1 ./...
```

若本机 5432 已被占用，可使用 e2e 覆盖文件把容器端口改到 15432，并相应修改 `TEST_DATABASE_URL` 的 `port`。

### 2. 前端测试与构建

```bash
cd frontend
npm test
npm run build
```

`vite.config.ts` 会在 Vitest 启动时固定测试环境，因此无需手动设置 `NODE_ENV`。

### 3. 真实浏览器 e2e

```bash
docker compose up -d --build
make e2e          # 18 条用例
make e2e-clean    # 清理 smoke_* 数据
```

### 4. 环境提示

- 本机 shell 曾导出 `NODE_ENV=production`，会导致 `npm ci` 省略 devDependencies；复现时如遇到 `tsc: command not found`，用 `env -u NODE_ENV npm ci` 重新安装。
- 本机 git 环境变量异常时，Go 构建会因 VCS stamping 失败；可用 `go build -buildvcs=false` 验证，不影响仓库本身。
