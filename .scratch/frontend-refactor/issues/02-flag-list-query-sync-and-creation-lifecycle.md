# 02: Flag 列表页 Query 双向同步、Flag 创建生命周期与行内启停

**What to build:**
改造 Feature Flag 列表页，支持环境切换与搜索关键字与浏览器 URL Query 参数（`?environment=...&search=...`）的双向绑定，深层链接访问或刷新时自动恢复过滤态。补齐并完善 Flag 新建生命周期（录入 Key、环境、名称、描述、默认返回值），对同环境重复 Key 冲突友好拦截，支持跨环境复用同名 Key；初次启动自动展示演示 Flag。在列表操作列提供原子启用/停用 Switch，防并发连击并用服务端返回实体单向同步状态。点击列表项整行或操作列“详情”平滑路由导航至 `/flags/:id` 全屏详情工作台。

**Blocked by:** 01: 客户端声明式路由体系、AppShell 全局骨架与测试脚手架

**Status:** ready-for-agent

- [ ] Flag 列表页环境过滤选项卡（`development`/`staging`/`production`/`all`）与关键字搜索框双向同步至 URL Query（`?environment=...&search=...`）
- [ ] 携带 Query 访问或按 F5 刷新时，页面自动还原过滤条件并向服务端发起过滤检索
- [ ] 首次加载或启动时，列表正常展示演示数据中已初始化的 Flag（如 `checkout_v2`）
- [ ] 新建 Flag 表单提交调用 `POST /api/v1/flags`，在同一环境下输入重复 Key 友好拦截并提示冲突错误（`FLAG_KEY_CONFLICT`）
- [ ] 在不同环境下允许成功创建相同的 Flag Key，创建成功后无感知刷新列表
- [ ] 列表操作列 Switch 启停切换即时调用 `PATCH /api/v1/flags/:id/toggle`，请求期间置为 loading 禁用防并发连击
- [ ] 启停成功后必须使用服务端响应的最新 Flag 实体全量更新对应行状态，请求失败回滚 Switch 状态并提示错误
- [ ] 确认后端 Flag 创建与启停均在数据库显式单事务内原子写入 Audit Log（引用真实后端测试 `TestFlagService_AtomicRollback_OnAuditFailure` 验证原子性）
- [ ] 点击列表项整行或操作列“详情”按钮，平滑路由导航至全屏详情页 `/flags/:id`
- [ ] 路由树集成测试覆盖 Query 同步、Flag 创建冲突与成功、行内启停及跳转详情
