# 01: 客户端声明式路由体系、AppShell 全局骨架与测试脚手架

**What to build:**
构建前端客户端声明式路由体系与企业级 AppShell 全局骨架。配置管理员和研发人员访问系统时，具备左侧固定的主工作区导航栏（功能开关 `/flags`、规则评估 `/evaluations`、全局操作历史 `/audit-logs`），页面顶部具备根据当前路径动态计算的面包屑工作区 Header，主视口支持页面平滑切换。访问根路径 `/` 自动重定向至 `/flags`。在容器化与本地运行环境下均具备 HTML5 History 路由支持，并在底层搭建基于完整路由树挂载的集成测试脚手架。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 安装并配置 `react-router-dom`，基于 `createBrowserRouter` 建立包含 `/flags`、`/flags/:id`、`/evaluations`、`/audit-logs` 的完整路由配置树
- [x] 构建全局 `AppShell` 布局：包含左侧固定全局导航侧边栏、顶部动态面包屑（Breadcrumb）工作区 Header 及主工作视口 `Outlet`
- [x] 浏览器直接访问根路径 `/` 自动重定向至功能开关列表 `/flags`
- [x] 点击侧边导航菜单各栏目，URL 路径精准变化，且左侧导航高亮与当前激活路由保持同步
- [x] 确保本地开发与构建脚本正常运行（`npm --prefix frontend dev` 代理 `/api` 至后端，`npm --prefix frontend build` 编译成功）
- [x] 在 `frontend/nginx.conf` 中确认配置 `try_files $uri $uri/ /index.html;`，支持生产容器环境 SPA 路由刷新回退
- [x] 搭建挂载完整路由配置的 `MemoryRouter` 测试脚手架，编写路由重定向与面包屑动态计算的集成测试并通过验证

## Answer
已完整实现并验证 Ticket 01：
1. **客户端声明式路由体系**：
   - 安装最新稳定版 `react-router-dom`，创建 `frontend/src/router.tsx`。
   - 配置基于 `createBrowserRouter` 的路由树：
     - `/` 根路径：重定向至 `/flags`；
     - `/flags`：挂载 `FlagListPage` 功能开关管理列表；
     - `/flags/:id`：挂载 `FlagDetailPage` 全屏工作台占位页；
     - `/evaluations`：挂载 `EvaluationConsolePage` 在线规则评估控制台；
     - `/audit-logs`：挂载 `GlobalAuditLogsPage` 全局操作历史控制台；
     - `*` 404 回退：自动重定向至 `/flags`。
2. **AppShell 企业级全局骨架** (`frontend/src/layout/AppShell.tsx`)：
   - **固定左侧导航侧边栏**（Sider）：包含平台品牌 Header、功能开关、规则评估与全局操作历史三项标准导航条目，高亮根据 `location.pathname` 自动计算并保持双向同步，点击即时触发路由切换；
   - **顶部动态面包屑工作区 Header**（Breadcrumb）：动态解析当前路径，支持在多层级路径（如 `/flags/:id`）渲染可点击回跳的上级链接（`功能开关` -> `详情`）；
   - **主工作视口**（Content）：内嵌 React Router `<Outlet />` 平滑挂载子路由组件；底部附统一平台版权 Footer。
3. **SPA 与本地运行支持**：
   - 验证 `frontend/nginx.conf` 包含 `try_files $uri $uri/ /index.html;`，确保容器化生产环境下深层链接直接刷新回退不报 404；
   - 验证 Vite 本地代理配置转发 `/api` 至后端 8080 端口；
   - 运行 `npm --prefix frontend run build`（`tsc && vite build`）通过，无类型与打包错误。
4. **测试脚手架与自动化测试验证** (`frontend/src/router.test.tsx`)：
   - 搭建挂载完整路由树配置的 `createMemoryRouter` 集成测试脚手架；
   - 在 `setupTests.ts` 中完成 Node undici Request 与 jsdom 信号对齐兼容处理；
   - 编写 7 组端到端集成测试全部绿灯：覆盖根路径重定向、各路由面包屑与导航激活、深层链接面包屑回跳、侧栏菜单点击导航及未知路由重定向；
   - 前端全套测试套件（28 个测试）与后端测试套件 100% 通过。
