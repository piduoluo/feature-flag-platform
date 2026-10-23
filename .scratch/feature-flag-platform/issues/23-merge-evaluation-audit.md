# 23: 合并评估与历史界面分支

Type: task
Status: resolved

## Scope

合并 `melody/调整规则评估界面` 与 `melody/调整历史界面`，保留 main 最新列表改动，解决共享测试与任务编号冲突。旧审计记录没有可靠快照时保留 null，不能用当前 Flag 默认值冒充历史值。

## Verification

- 前端完整单测、生产构建；后端完整测试。
- 独立 PostgreSQL 验证升级与重复迁移：旧值保持未知，新快照不被覆盖。
- 独立 Go + PostgreSQL + Nginx 环境运行既有 E2E，并检查桌面/手机评估与历史页面。
- 验证通过后 main 快进到集成结果；不修改现有演示库。

## Answer

- 原始分支分别保存为 `01c3fd2`（评估）与 `aeb4f28`（历史），集成分支从 `295844c` 建立，按评估、历史顺序合并。
- 保留 main 的列表布局和记录计数调整；任务索引合并保留双方条目，历史任务重编号为 22；路由断言沿用 main 的 Context JSON 可访问标签，E2E 保留新建开关文案与新增审计列断言。
- 移除迁移中从当前 Flag 配置回填历史值的 UPDATE。旧记录保持 null，新操作仍在业务事务内写入快照。迁移回归测试已先在原脚本复现失败，再在修正脚本通过，并验证重复执行不篡改已记录值。
- 后端：`TEST_DATABASE_URL=... go -C backend test -p 1 ./... -count=1` 全部通过（独立本地 PostgreSQL 测试库）。
- 前端：`npm test -- --maxWorkers=2 --minWorkers=1`，14 个文件、130 项全部通过；已有 React act 警告仍存在。
- 构建：独立 Docker Compose 从集成源码构建 Go 后端与 TypeScript/Vite 前端成功；保留已有包体积警告。
- E2E：独立 PostgreSQL 16 + Go + Nginx，端口 18080 / 13000；既有 Playwright 冒烟 11/11 通过，覆盖真实 API、深链、刷新、浏览器历史、未保存保护、评估与审计导航。
- 额外浏览器验证：1440×1000 与 390×844 的评估/审计页面无整页横向溢出；手机审计表内部滚动；审计行展开正常；RULE_MATCH、DEFAULT_FALLBACK、FLAG_DISABLED 和非法 JSON 拦截均验证。最后检查页面控制台无错误。
- 本轮不修改现有演示数据库，不重启 localhost:3000 的运行容器。

## Screenshots

- [评估桌面](../../../output/playwright/merge-evaluation-desktop.png)
- [评估手机](../../../output/playwright/merge-evaluation-mobile.png)
- [历史桌面](../../../output/playwright/merge-audit-desktop.png)
- [历史手机](../../../output/playwright/merge-audit-mobile.png)
