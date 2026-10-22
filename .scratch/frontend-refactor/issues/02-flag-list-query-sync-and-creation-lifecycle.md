# 02: Flag 列表页 Query 双向同步、Flag 创建生命周期与行内启停

**What to build:**
改造 Feature Flag 列表页，支持环境切换与搜索关键字与浏览器 URL Query 参数（`?environment=...&search=...`）的双向绑定，深层链接访问或刷新时自动恢复过滤态。补齐并完善 Flag 新建生命周期（录入 Key、环境、名称、描述、默认返回值），对同环境重复 Key 冲突友好拦截，支持跨环境复用同名 Key；初次启动自动展示演示 Flag。在列表操作列提供原子启用/停用 Switch，防并发连击并用服务端返回实体单向同步状态。点击列表项整行或操作列“详情”平滑路由导航至 `/flags/:id` 全屏详情工作台。

**Blocked by:** 01: 客户端声明式路由体系、AppShell 全局骨架与测试脚手架

**Status:** resolved

- [x] Flag 列表页环境过滤选项卡（`development`/`staging`/`production`/`all`）与关键字搜索框双向同步至 URL Query（`?environment=...&search=...`）
- [x] 携带 Query 访问或按 F5 刷新时，页面自动还原过滤条件并向服务端发起过滤检索
- [x] 首次加载或启动时，列表正常展示演示数据中已初始化的 Flag（如 `checkout_v2`）
- [x] 新建 Flag 表单提交调用 `POST /api/v1/flags`，在同一环境下输入重复 Key 友好拦截并提示冲突错误（`FLAG_KEY_CONFLICT`）
- [x] 在不同环境下允许成功创建相同的 Flag Key，创建成功后无感知刷新列表
- [x] 列表操作列 Switch 启停切换即时调用 `PATCH /api/v1/flags/:id/toggle`，请求期间置为 loading 禁用防并发连击
- [x] 启停成功后必须使用服务端响应的最新 Flag 实体全量更新对应行状态，请求失败回滚 Switch 状态并提示错误
- [x] 确认后端 Flag 创建与启停均在数据库显式单事务内原子写入 Audit Log（引用真实后端测试 `TestFlagService_AtomicRollback_OnAuditFailure` 验证原子性）
- [x] 点击列表项整行或操作列“详情”按钮，平滑路由导航至全屏详情页 `/flags/:id`
- [x] 路由树集成测试覆盖 Query 同步、Flag 创建冲突与成功、行内启停及跳转详情

## Answer

1. **URL Query 双向同步与深层链接过滤恢复 (`frontend/src/pages/FlagListPage.tsx`)**:
   - 采用 React Router `useSearchParams` 驱动列表过滤条件：`environment`（`development`/`staging`/`production`/`all`）与 `search` 关键字；
   - 携带 Query 参数访问或刷新页面时，自动解析 URL 参数并在挂载时向后端发起匹配条件的 `api.getFlags` 请求，搜索框输入与 Segmented 切换即时同步至 URL；
   - 清除搜索或切回全部环境时平滑清理 URL 冗余参数，不影响浏览器正常前进后退。

2. **首次启动演示数据展示 (SPEC-US 35)**:
   - 列表正确展现系统初始化的核心演示 Flag（如 `checkout_v2`、`ai_copilot_assistant` 等），涵盖等宽 Key、复制操作、名称描述、运行环境彩色 Tag、启用状态 Badge 与默认布尔返回值。

3. **新建 Flag 生命周期与冲突友好拦截 (`frontend/src/components/CreateFlagDrawer.tsx`)**:
   - 表单录入 Key、环境、名称、描述与默认返回值，调用 `POST /api/v1/flags`；
   - 同一环境下重复创建 Key 时明确捕获 `FLAG_KEY_CONFLICT`（409 Conflict）错误码，在抽屉顶部渲染醒目的友好冲突警告 Alert；
   - 允许在不同环境下成功复用相同的 Flag Key（SPEC-US 02）；
   - 创建成功后抽屉自动关闭并无感知刷新列表数据。

4. **列表行内原子启停 Switch 与防并发连击 (SPEC-US 07, UI-R 06)**:
   - 点击列表 Switch 即时触发 `PATCH /api/v1/flags/:id/toggle`，请求期间置为 `loading` 并 `disabled`，杜绝并发双击；
   - 请求成功严格使用后端返回的最新 Flag 实体更新列表行；
   - 请求失败即时捕获错误弹出 `message.error`，Switch 状态保持原样回滚。

5. **后端数据库单事务原子性保障 (SPEC-US 32)**:
   - 确认后端创建 Flag 与启停 Toggle 均在 `s.flagRepo.WithTransaction` 数据库单事务中原子执行，数据修改与审计日志同时落盘或全量回滚；
   - 验证通过真实数据库事务回滚测试 `backend/internal/service/flag_service_test.go:TestFlagService_AtomicRollback_OnAuditFailure` 与种子数据测试 `backend/internal/repository/seed_test.go:TestSeedDemoData_Idempotency`。

6. **全屏详情工作台路由导航 (UI-R 04)**:
   - 点击操作列“详情”按钮或直接点击表格整行，平滑导航至全屏详情页 `/flags/:id`；
   - 点击“在线评估”按钮携带 `flag_key`、`environment` 及 `flag_id` 参数平滑导航至 `/evaluations`。

7. **自动化测试与全量套件验证**:
   - `frontend/src/pages/FlagListPage.test.tsx` 编写 11 个挂载完整路由树的集成测试，100% 绿灯；
   - 前端 5 个测试文件共 37 个测试全量通过；生产打包 `npm --prefix frontend run build` 成功。
