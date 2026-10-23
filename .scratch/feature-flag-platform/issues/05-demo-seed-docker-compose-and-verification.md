# 05: 演示数据种子、容器化编排 (Docker Compose) 与本地交付就绪

**What to build:**
评测人员与开发者可以通过 README 提供的极简命令在本地快速拉起系统并进行全功能复现。系统首次启动时自动且幂等地导入演示数据（涵盖不同环境下的 Flag、有序规则与初始审计历史）。提供生产级 Docker Compose 编排文件，由 PostgreSQL（带健康检查）、Go 后端与基于 Nginx 反向代理的前端组成，统一暴露 /api 与静态资源路由，前后端代码无环境分支分化。项目附带完备的 README 说明，记录系统架构、术语合规定义、优先级与匹配语义、设计权舍及测试执行指南。

**Blocked by:** 04: 确定性有序评估引擎与在线评估控制台

**Status:** resolved

- [x] 提供幂等的数据迁移与演示数据种子机制，首次启动自动填充多环境 Flag、多条有序规则与初始审计记录，重复启动不产生脏数据
- [x] 提供 docker-compose.yml 一键编排全栈服务，Nginx 反向代理统一代理前端与 /api 路径，开箱即用无跨域阻碍
- [x] 保证系统在本地开发模式下通过少量命令（Go 启动与 Vite 代理启动）即可稳定运行复现
- [x] 编写详尽规范的 README.md，包含启动方式、数据模型、优先级与匹配语义、设计取舍、已完成功能与测试命令
- [x] 全量自动化测试套件（单元测试与集成测试）可通过单条命令完整运行且全部通过

**Resolution:**
- `docker compose up --build -d` 冷启动成功，PostgreSQL 健康检查、后端迁移/种子、Nginx SPA 回退均验证通过。
- 最终验收：`go vet ./...`、`go test -count=1 ./...`、`tsc --noEmit`、`npm test`（148 项）、`npm run build`、Playwright 18 条 e2e 全部通过。
- `make e2e-clean` 清理全部 `smoke_*` 测试数据，数据库仅保留 4 个演示 Key / 5 条演示 Flag。
