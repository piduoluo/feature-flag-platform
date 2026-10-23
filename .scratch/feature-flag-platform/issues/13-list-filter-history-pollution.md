# 13: 列表筛选与分页不污染浏览器历史

**Type:** task
**Status:** resolved
**Blocked by:** 11

## Goal

功能开关列表的环境、启停状态、分页和每页条数与搜索一样属于列表视图状态，不应各自新增浏览器历史记录；用户调整这些条件后，浏览器后退应直接离开列表，而不是依次退回上一个筛选组合。

## Acceptance

- [x] 切换环境使用 `replace` 更新 URL，不新增历史记录。
- [x] 点击启停统计筛选使用 `replace` 更新 URL，不新增历史记录。
- [x] 表格 / 宫格分页和每页条数使用 `replace` 更新 URL，不新增历史记录。
- [x] 搜索保持既有 `replace` 行为。
- [x] 环境、状态、分页条件仍保留在 URL 中，刷新和从详情返回时可恢复。
- [x] 调整筛选后浏览器后退直接离开列表；进入详情再返回仍恢复当前筛选和页码。
- [x] 未涉及后端、API、数据库和业务规则。
- [x] TypeScript、前端测试、生产构建与真实浏览器测试通过。

## Answer

问题集中在 `FlagListPage` 的三类 URL 写入：环境切换、状态统计筛选、分页/每页条数。它们此前使用默认的 `push`，因此每次调整都会新增一条历史记录；搜索框已经使用 `replace`，所以没有该问题。

修复方式：

- `handleEnvChange` → `setSearchParams(nextParams, { replace: true })`
- `handleStatusChange` → `setSearchParams(nextParams, { replace: true })`
- `handlePageChange` → `setSearchParams(nextParams, { replace: true })`

URL 中仍保留 `environment`、`enabled`、`page`、`page_size`，所以列表状态、刷新恢复、详情返回来源和左上角返回都不受影响；改变的只是历史记录语义。

**验证**

- 单元测试在环境切换、状态筛选、分页三处断言 `router.state.historyAction === 'REPLACE'`。
- Playwright 新增 Ticket 13 用例：从审计页进入列表，切换环境并点击「已启用」后，浏览器后退直接回到 `/audit-logs`。
- 真实浏览器实测：列表历史长度在环境、状态、页码变化时保持不变；后退直接离开列表。
- 前端：当前工作区 14 个测试文件共 125 项测试通过；Playwright 11 项测试通过；`tsc` 与生产构建通过。
- 后端无改动。
