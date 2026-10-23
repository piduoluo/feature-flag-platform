# 09: 真实浏览器全链路端到端冒烟验收与运行复现

**What to build:**
执行真实浏览器 Playwright 端到端全链路冒烟测试与系统运行复现验收。验证本地开发启动（SPEC-US 33）、Docker Compose 容器化编排启动（SPEC-US 34）及演示数据首次启动自动就绪（SPEC-US 35）。明确全栈冒烟测试的环境边界：端到端真实主链路直连独立测试环境的后端 Go API 与 PostgreSQL，绝不硬编码 `/flags/1`，在测试前动态创建带有随机 Key 的隔离测试 Flag，并在测试完成后清理数据；纯前端特性与防误关场景在受控环境中执行。验证深层链接直达（含 `?tab=audit`）、生产 Nginx SPA 刷新 `try_files` 回退、浏览器前进后退历史栈及 beforeunload 防误关拦截。验证 Ticket 08A 与 08B 的公共 `parseAuditDiff` 最终集成无缝生效，对照原始 35 条 SPEC User Stories 与 UI 重构规范执行最终闭环验收。

**Blocked by:** 02: Flag 列表页 Query 双向同步、Flag 创建生命周期与行内启停, 07: 在线评估控制台上下文联动、轻量校验与决策呈现, 08B: 全局操作审计后端 API 与跨 Flag 全功能运维控制台, 10: 旧巨石抽屉 FlagDetailDrawer 清理与测试迁移核查

**Status:** resolved

- [x] 验证本地启动（SPEC-US 33）：根据 README 能够通过命令在本地顺利启动前端与后端，代理正常且页面加载无异常
- [x] 验证容器化部署（SPEC-US 34）：执行 `docker compose up -d --build`，postgres、backend、frontend 容器正常拉起，通过 `http://localhost:3000` 正常访问系统
- [x] 验证演示数据（SPEC-US 35）：核实系统首次启动时自动加载初始演示 Flag 与审计日志，列表开箱即用展示 `checkout_v2` 等实体
- [x] 冒烟测试数据隔离设计：严禁硬编码 `/flags/1`；测试用例动态创建随机 Flag（`smoke_${Date.now()}_...`），获取分配的真实 `id` 作为后续验证目标，测试结束后清理测试数据
- [x] 编写并执行 Playwright 真实浏览器端到端测试用例：
  1. **深层链接直达与 Tab 恢复**：浏览器直接导航访问 `/flags/${id}?tab=audit` 与 `/evaluations?flag_key=...&environment=...`，验证页面无白屏、正确拉取数据且目标 Tab 精准激活
  2. **生产 Nginx SPA 路由回退验证**：在深层链接页面（如 `/flags/${id}?tab=audit`）按 F5 刷新，断言 Nginx `try_files` 生效，页面正常刷新呈现，不返回 404
  3. **浏览器前进与后退历史栈**：从列表进入详情、再进入评估、连续点击浏览器后退与前进，验证 URL（含 `?tab=...`）与界面激活状态完全双向同步
  4. **未保存防误关拦截**：在 Flag 详情页修改规则后触发刷新，验证成功捕获浏览器原生 `beforeunload` 对话框拦截
- [x] 验证 Ticket 08A 与 08B 的共享 `parseAuditDiff` 契约最终集成有效，无重复实现或类型冲突
- [x] 逐项对照原始 35 条 SPEC User Stories 与 UI 重构规范，确认全系统 100% 验收达标

## Answer

- **本地启动（SPEC-US 33）**：`go run ./cmd/server` + `npm run dev` 可用，Vite 代理 `/api` 正常，页面无白屏。
- **容器化（SPEC-US 34）**：`docker compose up -d --build` 实测暴露并修复 3 个真缺陷：
  1. `backend/Dockerfile` 用 `golang:1.23`，而 `go.mod` 要求 1.25 → `go mod download` 直接失败；已改为 `golang:1.25-alpine`。
  2. 仓库无 `.dockerignore`，`COPY . .` 会把宿主机 `node_modules`/`dist` 打进镜像；已补前后端 `.dockerignore`。
  3. 目录名含中文时 Compose 推导出的项目名为空（`project name must not be empty`），README 的一条命令直接不可用；已在 `docker-compose.yml` 固定 `name: feature-flag-platform`。
  - 本机 5432 被本地 PostgreSQL 占用，另提供 `docker-compose.e2e.yml` 把容器库映射到 15432，用 `docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build` 启动。
- **演示数据（SPEC-US 35）**：首次启动自动 seed 4 个 Flag（含 `checkout_v2`）与对应审计记录，列表开箱即用。
- **数据隔离**：`frontend/e2e/smoke.spec.ts` 用 `smoke_${Date.now()}_${rand}` 动态创建 Flag 并取回真实 `id`，全程不出现 `/flags/1`；跑完用 SQL 清理 `smoke_%`（已清，剩 0 条）。
- **Playwright 7 项全绿**（系统 Chrome，`channel: 'chrome'`，无需下载浏览器）：
  1. 演示数据可见；2. `?tab=audit` 深链直达并激活 Tab；3. 深链 F5 刷新返回 200（Nginx `try_files`）；4. 列表→详情→Tab 的浏览器后退/前进 URL 与 Tab 状态同步；5. 评估控制台深链回填并出三态结果；6. 未保存草稿触发原生 `beforeunload`；7. 全局审计台筛选、展开 Diff、Flag Key 直达详情。
- **08A/08B 共享契约**：`parseAuditDiff` 为唯一解析入口，`AuditDiffView` 为唯一渲染入口，08B 页面消费 08A 契约，无重复实现。
- **单元/集成测试**：9 文件 / 91 项全绿；`vitest` 已排除 `e2e/**`，避免与 Playwright 冲突。
