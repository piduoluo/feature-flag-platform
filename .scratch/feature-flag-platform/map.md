# Feature Flag 与灰度规则平台 任务全景图 (Map)

## Overview
本任务地图为 48 小时中级全栈测试题（题目 A）的工程实现全景图。将 24 条 User Stories 严格解构为 5 个纵向切片（Vertical Slices）Tickets，按次序步步推进、增量交付。

## Tickets
- **[01-monorepo-scaffold-and-flag-crud-list-create.md](issues/01-monorepo-scaffold-and-flag-crud-list-create.md)**
  - Type: task
  - Status: resolved
  - Blocked by: None
  - Scope: Monorepo 基础脚手架、PostgreSQL 迁移、Flag 列表、环境筛选与创建抽屉。
- **[02-flag-detail-toggle-and-atomic-audit-log.md](issues/02-flag-detail-toggle-and-atomic-audit-log.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 01
  - Scope: Flag 详情、启停状态切换、基本信息修改与单事务原子审计日志。
- **[03-rule-batch-sync-atomic-diff-and-workbench.md](issues/03-rule-batch-sync-atomic-diff-and-workbench.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 02
  - Scope: 规则配置工作台、拖拽/数字优先级排序、原子批量同步（Diff 计算与审计）。
- **[04-evaluation-engine-and-online-console.md](issues/04-evaluation-engine-and-online-console.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 03
  - Scope: 纯内存规则评估引擎、严格类型比对、在线控制台与三态原因反馈。
- **[05-demo-seed-docker-compose-and-verification.md](issues/05-demo-seed-docker-compose-and-verification.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 04
  - Scope: 演示种子数据注入、Docker Compose 编排、端到端验证与自测报告。
- **[06-responsive-layout-and-table-overflow.md](issues/06-responsive-layout-and-table-overflow.md)**
  - Type: task
  - Status: resolved
  - Blocked by: None
  - Scope: 共用框架、两张表格、评估控制台与 Flag 详情页的响应式布局修复。
- **[07-didi-demo-seed-refresh.md](issues/07-didi-demo-seed-refresh.md)**
  - Type: task
  - Status: resolved
  - Blocked by: None
  - Scope: 更新 4 个虚构出行场景 Key、5 条跨环境演示 Flag，并替换当前本地数据库的旧演示数据。
- **[08-frontend-contract-alignment.md](issues/08-frontend-contract-alignment.md)**
  - Type: task
  - Status: resolved
  - Blocked by: None
  - Scope: 移除无后端依据的前端入口，修复无损 JSON、优先级、分页筛选、状态说明与刷新行为。
- **[09-product-logo-and-sidebar-hover-control.md](issues/09-product-logo-and-sidebar-hover-control.md)**
  - Type: task
  - Status: resolved
  - Blocked by: None
  - Scope: 使用真实产品 Logo，并修复桌面侧栏折叠态仅在 Logo 悬停或聚焦时显示展开按钮。
- **[10-flag-console-header-stats-toolbar.md](issues/10-flag-console-header-stats-toolbar.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 08, 09
  - Scope: 移除全局面包屑，重排 Flag 页面标题、实时状态统计和工具栏，并扩展列表接口支持状态统计与筛选。
- **[11-flag-detail-single-url-and-source-back.md](issues/11-flag-detail-single-url-and-source-back.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 10
  - Scope: Flag 详情 Tab 收敛为单 URL，增加来源感知返回导航，并保留列表筛选、分页和未保存草稿。
- **[12-flag-detail-header-structure-and-default-copy.md](issues/12-flag-detail-header-structure-and-default-copy.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 11
  - Scope: Flag 详情顶部拆为身份/操作与元数据两行，删除规则页重复默认值卡片并重写空状态语义。
- **[13-list-filter-history-pollution.md](issues/13-list-filter-history-pollution.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 11
  - Scope: 列表环境、状态与分页改用 replace 写入 URL，避免筛选状态堆叠浏览器历史。
- **[14-flag-list-reference-layout.md](issues/14-flag-list-reference-layout.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 10, 11
  - Scope: 按用户截图复刻功能开关内容区，列表行尾加入四项三点菜单。
- **[15-flag-index-card-redesign.md](issues/15-flag-index-card-redesign.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 10
  - Scope: 从 melody/flagshow 合入宫格索引卡、加载骨架、12 / 24 / 48 分页及规则修改后更新时间。
- **[16-merge-flagshow.md](issues/16-merge-flagshow.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 13, 14
  - Scope: 将 melody/flagshow 合入 main，并验证列表、宫格和规则更新时间行为。

- **[17-flag-console-layout-typography.md](issues/17-flag-console-layout-typography.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 14, 15, 16
  - Scope: 自主优化功能开关页整体信息层级、布局比例、字体与两种视图的视觉节奏。

- **[18-remove-secondary-page-headings.md](issues/18-remove-secondary-page-headings.md)**
  - Type: task
  - Status: resolved
  - Blocked by: None
  - Scope: 删除在线评估与全局操作历史页顶部大标题，收掉标题遗留间距。

- **[19-remove-evaluation-flag-management-entry.md](issues/19-remove-evaluation-flag-management-entry.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 18
  - Scope: 删除规则评估页顶部管理 Flag 入口及其操作栏。

- **[20-flag-controls-reference-layout.md](issues/20-flag-controls-reference-layout.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 17, 18, 19
  - Scope: 删除功能开关页标题说明，按用户图例将环境、通栏搜索操作、状态统计及结果数排为三层。

- **[21-remove-flag-record-counts.md](issues/21-remove-flag-record-counts.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 20
  - Scope: 删除功能开关页右上角和左下角的记录总数，保留状态统计与分页。

- **[22-audit-history-reference-layout-default-value.md](issues/22-audit-history-reference-layout-default-value.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 08B, 18
  - Scope: 按参考稿重排全局操作历史表格列与动作图标，并由后端提供默认返回值审计快照。

- **[28-evaluation-roundtrip-back-source.md](issues/28-evaluation-roundtrip-back-source.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 11, 26
  - Scope: 修复详情→在线评估→详情往返后返回导航被覆盖为「规则评估」并在两页循环的问题，保留原始来源历史记录。

- **[29-settings-layout-hierarchy.md](issues/29-settings-layout-hierarchy.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 12, 28
  - Scope: 收窄 Flag 详情基本设置表单容器、用分隔线建立字段分组，并移除默认返回值下方的描述性小字。

- **[30-evaluation-result-simplification.md](issues/30-evaluation-result-simplification.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 26, 29
  - Scope: 评估结果摘要压缩为来源+返回值单行、false 红/true 绿，移除原因码/胶囊/解释小字与「下一步」标题，并让三个后续操作与左侧发起按钮同线。

- **[31-env-filter-dropdown.md](issues/31-env-filter-dropdown.md)**
  - Type: task
  - Status: resolved
  - Blocked by: 20, 30
  - Scope: 功能开关页环境筛选改为「环境触发器 + 下拉面板」，并与搜索、视图切换、刷新、新建合并到同一行工具栏。

## Decisions-so-far
- 遵循 [docs/SPEC.md](../../docs/SPEC.md) 与 [docs/adr/](../../docs/adr/) 中的 ADR 0001~0006。
- 架构采用 `Handler -> Service -> Repository -> Database` 单向流，纯内存 `Engine`。
- [Ticket 01 完成](issues/01-monorepo-scaffold-and-flag-crud-list-create.md)：打通 Monorepo 骨架、Postgres 物理唯一索引 `(key, environment)`、Flag 创建/检索接口与前端列表及防重新建抽屉，测试全绿。
- [Ticket 02 完成](issues/02-flag-detail-toggle-and-atomic-audit-log.md)：打通 Flag 详情卡片、在线编辑与一键 Switch 启停控制，实现单事务原子审计流水（FLAG_CREATED、FLAG_UPDATED、FLAG_TOGGLED）及空变更抑制与失败原子回滚验证。
- [Ticket 03 完成](issues/03-rule-batch-sync-atomic-diff-and-workbench.md)：完成规则配置工作台、原子优先级互换（ShiftPriorities 彻底规避物理唯一索引瞬时冲突）、三向精确 Diff 审计与 RULES_SYNCED、清空规则二次确认防护与空白审计抑制。
- [Ticket 04 完成](issues/04-evaluation-engine-and-online-console.md)：实现纯内存规则评估引擎（零 I/O 依赖）、优先级升序短路求值、严格 JSON 类型隔离（string/number/bool 严禁互通）、精确任意精度数值比较（1 等于 1.0、大整数 2^53+1 无精度损失比对、缺失/null 安全跳过），并在前端搭建具备实时 JSON 语法高亮校验拦截与鲜明三态视觉反馈卡片（RULE_MATCH / DEFAULT_FALLBACK / FLAG_DISABLED）的在线评估控制台。
- [Ticket 06 完成](issues/06-responsive-layout-and-table-overflow.md)：手机端导航收进抽屉；列表与审计表格只在内部滚动；评估输入、结果和详情顶部按可用宽度换行，已在 390、768、1024、1440px 浏览器宽度核对。
- [Ticket 07 完成](issues/07-didi-demo-seed-refresh.md)：当前本地库备份后仅替换旧演示数据；新种子包含 4 个 Key、5 条 Flag，覆盖跨环境差异、按用户开放、有序规则、默认回退与停用拦截。
- [Ticket 08 完成](issues/08-frontend-contract-alignment.md)：前端按现有 Go API 和业务文档完成契约收敛；移除无后端依据的入口，补齐无损 JSON、显式优先级、服务端搜索、状态语义和刷新行为，后端契约保持不变。
- [Ticket 09 完成](issues/09-product-logo-and-sidebar-hover-control.md)：桌面侧栏与移动端导航改用真实产品 Logo；折叠态默认展示 Logo，仅在 Logo 区域悬停或键盘聚焦时原位显示展开按钮。
- [Ticket 10 完成](issues/10-flag-console-header-stats-toolbar.md)：移除全局面包屑与桌面顶部栏；Flag 页统一标题、说明、服务端状态统计与筛选，重排环境/搜索/视图/刷新/新建工具栏，并以向后兼容的 `enabled` 参数与 `stats` 汇总支撑跨分页准确统计。
- [Ticket 11 完成](issues/11-flag-detail-single-url-and-source-back.md)：Flag 详情三个 Tab 收敛到 `/flags/:id` 单 URL 并以内部状态切换；旧 query/path 深链接一次性兼容归一；左上角返回按实际来源回到列表、全局审计或评估页，列表筛选与分页随 URL 恢复；草稿跨 Tab 保留，离开拦截仅作用于真正离开详情。
- [Ticket 12 完成](issues/12-flag-detail-header-structure-and-default-copy.md)：Flag 详情顶部拆为「身份 + 操作」与「元数据」两行，启停开关与评估按钮在状态切换时坐标不位移；删除规则页重复默认值卡片，保留独立草稿警告，重写启停两态空状态并补齐前后端语义回归测试。
- [Ticket 13 完成](issues/13-list-filter-history-pollution.md)：功能开关列表的环境、启停状态、分页与每页条数改为 `replace` 更新 URL；筛选条件仍可恢复，但后退不再逐层退回筛选组合，而是直接离开列表。
- [Ticket 14 完成](issues/14-flag-list-reference-layout.md)：功能开关内容区参照截图呈现标题统计、工具栏、表头与行；三点菜单直达详情、基本设置、在线评估及变更历史，保留真实数据和原有列表交互。
- [Ticket 15 完成](issues/15-flag-index-card-redesign.md)：melody/flagshow 的宫格索引卡、加载骨架与键盘操作已合入；列表与宫格共用 12 / 24 / 48 分页，规则实质修改会在同一事务内刷新 Flag 更新时间。
- [Ticket 16 完成](issues/16-merge-flagshow.md)：主分支列表复刻与 melody/flagshow 宫格改动已完成整合，前后端全量测试、生产构建和真实浏览器检查通过。
- [Ticket 17 完成](issues/17-flag-console-layout-typography.md)：标题与统计收紧，筛选操作按容器宽度重排，统一列表和宫格字体及分页节奏；相关测试、生产构建与多尺寸浏览器检查通过，localhost:3000 已更新。
- [Ticket 18 完成](issues/18-remove-secondary-page-headings.md)：在线评估与全局操作历史首页顶部大标题已删除；27 项相关测试、构建及真实页面验证通过，localhost:3000 已更新。
- [Ticket 19 完成](issues/19-remove-evaluation-flag-management-entry.md)：规则评估页的管理 Flag 入口及顶部操作栏已删除，生产构建通过，localhost:3000 已更新。
- [Ticket 20 完成](issues/20-flag-controls-reference-layout.md)：功能开关页按新图例重排，删除标题说明，将状态统计移到搜索下方并在右侧显示当前环境及筛选记录数；36 项相关测试、构建及桌面/手机浏览器检查通过，localhost:3000 已更新。
- [Ticket 21 完成](issues/21-remove-flag-record-counts.md)：按用户要求删除功能开关页顶部与分页的记录总数；21 项相关测试、生产构建及实际页面验证通过，分页和状态统计正常，localhost:3000 已更新。

- [Ticket 22 完成](issues/22-audit-history-reference-layout-default-value.md)：操作历史表格按参考稿改为 Flag Key / 环境 / 默认返回值 / 操作 / 操作人 / 操作时间，动作用线性图标 + 文案；后端新增 `audit_logs.default_value` 快照列，旧记录保留 null，四类写操作在同一事务内写入真实默认值，前后端测试与真实浏览器检查通过。

- [Ticket 23 完成](issues/23-merge-evaluation-audit.md)：集成评估与历史界面，旧审计值保持未知；后端完整测试、前端 130 项、真实 E2E 11 项和桌面/手机浏览器检查通过。

- [Ticket 24 完成](issues/24-unify-interface-typography.md)：全站字体对齐顶部环境筛选，保留字号层级并收敛字重；130 项测试、构建与桌面/手机浏览器检查通过，localhost:3000 已更新。

- [Ticket 25 完成](issues/25-update-brand-orange.md)：品牌主色统一为 #FF6400，覆盖 Logo、全局主题、列表及交互状态；构建和实际浏览器检查通过，localhost:3000 已更新。

- [Ticket 26 完成](issues/26-evaluation-decision-trace.md)：在线评估页按“输入 → 结果摘要 → 决策链路 → 下一步”重排，后端补充逐条规则执行明细；三态摘要、请求快照复制、规则/设置 Tab 跳转与过期响应处理已完成，真实 API 多尺寸检查通过。

- [Ticket 27 完成](issues/27-sidebar-nav-ui-assets.md)：将独立 UI 资产包中的新品牌 Logo、三标签双态图标与侧栏收起/展开控件迁移进侧边栏；保留原图直出与无损视口，补齐收起态居中、紧凑 42px 行高与 28px 图标、展开选中底色铺满行宽、移除左侧竖条/收起仅图标状态、侧栏整体收至 156px（最后标签文字+54px）、移动抽屉字标头部和悬停橙色箭头，导航项简化为“操作历史”并整体左移 6px，收起态 64px、抽屉同步 156px，移除品牌副标题与顶部装饰线，148 项前端测试与多尺寸浏览器检查通过。

- [Ticket 28 完成](issues/28-evaluation-roundtrip-back-source.md)：Flag 详情进入在线评估时携带 `fromFlagDetail` 上下文；评估页横幅在 Flag/环境未变时以 POP 返回原详情历史记录，保留「功能开关」/「全局操作历史」来源，切换 Flag 后仍按原契约 push 并标记「规则评估」；148 项前端测试、类型检查、生产构建与 13 项真实浏览器 E2E 通过，localhost:3000 已更新。

- [Ticket 29 完成](issues/29-settings-layout-hierarchy.md)：基本设置改为 760px 聚焦卡片，名称/描述与默认返回值以细分隔线分组；删除「默认返回值」下方长段小字，语义继续由详情头部 meta 行承载；148 项前端测试、构建、13 项 E2E 与 1440/390px 视觉检查通过，localhost:3000 已更新。

- [Ticket 30 完成](issues/30-evaluation-result-simplification.md)：在线评估结果区收敛为「来源 + 返回值」单行，false 红 / true 绿；删除胶囊、原因码、结果容器与链路解释小字；移除「下一步」标题，三个后续操作固定在右卡底部并与左侧发起按钮同中心线；148 项单测、构建、13 项 E2E 与 1440/390px 视觉检查通过，localhost:3000 已更新。

- [Ticket 31 完成](issues/31-env-filter-dropdown.md)：环境下拉替代平铺 Segmented，触发器白底深色文字并显示环境颜色圆点，菜单四项统一深色文字 + 对应圆点（全部灰/开发蓝/预发琥珀/生产红），选中项中性浅灰底与勾选；桌面端环境/搜索/视图/刷新/新建同一行，移动端分行；148 项单测、构建与 13 项 E2E 通过，localhost:3000 已更新。
