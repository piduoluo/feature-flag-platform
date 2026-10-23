# 31: 功能开关页环境下拉筛选

Type: task
Status: resolved

## Goal

按参考图把功能开关页的环境筛选从平铺 Segmented 改为「环境触发器 + 下拉面板」，并把环境、搜索、视图切换、刷新和新建放到同一行工具栏。环境本身不使用图标，改用与环境语义一致的颜色圆点。

## Acceptance

- [x] 环境触发器为白底描边、正常深色文字，显示当前环境（全部环境 / Development / Staging / Production）、环境颜色圆点与下拉箭头。
- [x] 打开后箭头翻转，面板在触发器下方展开；四个选项使用相同文字色与对应环境圆点，选中项中性浅灰底 + 右侧深灰对勾。
- [x] 不使用任何环境图标；圆点颜色为：全部环境灰、Development 蓝、Staging 琥珀、Production 红，与列表/审计中的环境标识一致。
- [x] 触发器圆点与当前选中环境一致，触发器与下方选项的文字、圆点颜色保持统一。
- [x] 点击选项写入 `environment` 查询参数（`replace`，不新增历史）、触发列表重取；选择「全部环境」移除该参数。
- [x] 桌面端环境触发器、搜索框、宫格/列表切换、刷新、新建 Flag 在同一行，高度 40px、圆角 8px。
- [x] 窄屏（容器 ≤560px）环境触发器独占一行，搜索独占一行，视图/刷新/新建在下一行，无横向溢出。
- [x] 环境切换后的触发器文案、圆点与选中态同步；装饰性圆点、箭头与对勾对辅助技术隐藏，菜单项可访问名只含选项文案。
- [x] 前端单测、类型检查、生产构建、真实浏览器 E2E 全部通过。

## Answer

**交互**

- 用 Antd `Dropdown` 替换 `Segmented`，`trigger={['click']}`，受控 `open` 用于翻转箭头与 `is-open` 样式。
- `menu.items` 由 `ENV_FILTER_OPTIONS` 生成：每项包含环境圆点、文案、选中时的 `CheckOutlined`；`selectedKeys=[selectedEnv]`、`selectable` 提供选中态，`onClick` 复用原 `handleEnvChange`。
- `handleEnvChange` 仍以 `replace` 写入 URL 并清空 `page`，保持 Ticket 13 的历史不堆叠契约。
- 触发器 `aria-label="环境筛选：{当前环境}"`，带 `aria-haspopup="menu"` 与 `aria-expanded`。

**颜色与图标**

- 删除堆叠图层、文档、立方体、服务器等所有环境图标。
- 新增 `.flag-env-dot`：7px 圆形色点；`all` 使用 `#9aa4b2`，Development / Staging / Production 分别复用全局 `--env-dev-dot`、`--env-staging-dot`、`--env-prod-dot`。
- 触发器与菜单项使用同一套文字色和圆点色：触发器白底深色文字，选项均为深色文字；选中项仅使用中性浅灰底（`#f2f0ed`）与深灰对勾，不再出现橙色文字或橙色选中底。
- 圆点、箭头、对勾都设置 `aria-hidden`，菜单项可访问名只含选项文案。

**布局**

- 工具栏改为 `grid-template-columns: auto minmax(0, 1fr)`：环境触发器在左，右侧 actions 网格为「搜索 / 视图切换 / 刷新 / 新建」。
- 控件圆角统一为 8px；触发器高 40px，与搜索、刷新、新建同高。
- 容器 ≤560px 时工具栏收为单列，环境、搜索、视图按钮分三行，配合原有容器查询。
- 删除旧的 Segmented 及其下划线选中态样式。

**验证**

- 更新 `FlagListPage.test.tsx`：先点触发器再点菜单项，覆盖 Development → 全部环境的 URL、`REPLACE` 与重新请求。
- 更新 E2E：`Ticket 13` 改为打开环境下拉并选择 Development，仍验证筛选不堆叠历史。
- 前端 14 个文件 148 项单测通过；`tsc --noEmit`、`npm run build` 通过；Playwright 13 项通过。
- 1440px 与 390px 截图核对：触发器为白底深色文字、四个圆点颜色正确、选中项为中性底色，无横向溢出。
- 前端镜像已重建，localhost:3000 已更新。
