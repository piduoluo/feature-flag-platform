# 03: Flag 详情全屏工作台框架、Tab-Query 双向同步与基本设置域

**What to build:**
构建独立全屏的 Flag 详情工作台页面（`/flags/:id`），替代原有巨石抽屉。页面顶部展示醒目 `FlagHeader`（名称、环境 Tag、等宽 Key 及复制按钮、最后更新时间）与启停 Switch（防并发连击、服务端返回值单向同步、失败回滚）；Header 下方提供轻量 `SummaryBar`。工作台划分为“规则配置”、“变更历史”和“基本设置”三大 Tab，且 Tab 激活状态与 URL Query 深度绑定（`?tab=rules|audit|settings`），刷新或历史栈回退能精准还原 Tab。实现 Tab 3 基本设置工作台，表单维护局部草稿并提供独立的“保存设置”提交端点（`PUT /api/v1/flags/:id`），与规则更新解耦，保存成功即时原子同步 Header 标题。

**Blocked by:** 01: 客户端声明式路由体系、AppShell 全局骨架与测试脚手架

**Status:** resolved

- [x] 浏览器直接访问 `/flags/:id` 正常拉取服务端 Flag 实体并完整渲染全屏工作台框架
- [x] 详情页三大 Tab 状态与 URL Query 深度绑定（`?tab=rules`、`?tab=audit`、`?tab=settings`），切换 Tab 实时更新 Query，页面刷新或浏览器后退前进精准恢复当前激活 Tab
- [x] FlagHeader 醒目展示 Flag 名称、环境徽标、等宽字体的 Flag Key 及更新时间，点击复制按钮可一键将 Key 写入剪贴板并提示成功
- [x] FlagHeader 集成启用/停用 Switch，点击调用 `PATCH /api/v1/flags/:id/toggle`，执行期间置为 loading 禁用，成功用服务端返回实体同步状态，失败回滚
- [x] SummaryBar 轻量展示规则总数、已生效默认返回值徽标及最后修改时间
- [x] Tab 3 基本设置工作台提供 Flag 名称、描述与默认布尔返回值的编辑表单与局部草稿 `basicDraft`
- [x] 点击 Tab 3 底部的“保存设置”按钮独立向 `PUT /api/v1/flags/:id` 发起更新，后端在显式单事务内原子更新 Flag 基本信息与 `FLAG_UPDATED` 审计记录
- [x] 基本设置保存成功后，原子更新 `savedFlag` 并清空 `basicDraft`，Header 标题与 SummaryBar 即时刷新为新生效值
- [x] 路由树集成测试覆盖深层链接加载、Tab-Query 状态同步、Header 启停熔断及基本设置独立保存

## Answer
Ticket 03 已完成并通过全量验证：

1. **全屏详情工作台**：`/flags/:id` 由 `FlagDetailPage` 拉取 `GET /api/v1/flags/:id`，渲染 Header、SummaryBar 与「规则配置 / 变更历史 / 基本设置」三大 Tab；非法 `?tab=` 回退 `rules`，加载失败展示错误 Alert。
2. **Tab 与 URL 双向绑定**：通过 `useSearchParams` 读写 `?tab=rules|audit|settings` 并写回历史栈，刷新、前进、后退均按 Query 精准还原激活 Tab。
3. **FlagHeader**：名称、环境 Tag、等宽 Key（`copyable` 复制并提示「Key 已复制」）、最后更新时间，以及受控启停 Switch；请求期间 `loading` + `disabled` 防止连击，成功后以服务端返回实体单向回填，失败保持原值（回滚）。
4. **SummaryBar**：规则总数、已生效默认返回值 `Tag` 徽标与最后修改时间，随 `savedFlag` 原子刷新。
5. **基本设置域**：`basicDraft` 局部草稿 + 独立「保存设置」提交 `PUT /api/v1/flags/:id`，后端在同一事务内更新 Flag 与 `FLAG_UPDATED` 审计；成功后更新 `savedFlag`、清空草稿，Header 与 SummaryBar 即时刷新。

**验证**：`FlagDetailPage.test.tsx` 12 项与 `router.test.tsx` 7 项覆盖深层链接、Tab 同步与历史栈、启停熔断回滚、基本设置独立保存；前端 7 文件 43 项全绿，后端 `go test ./...` 全绿，`npm run build` 通过。
