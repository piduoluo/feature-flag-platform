# 0001-tech-stack-and-monorepo

## 上下文
在 48 小时中级全栈测试题中，需要从零构建包含 Feature Flag 管理、规则评估、审计日志与控制台的完整系统，并在交付物中保证可复现性与工程规范。

## 决策
采用轻量 Monorepo 组织结构，后端采用 Go + Gin + GORM + PostgreSQL，前端采用 Vite + React + TypeScript + Ant Design，不引入冗余的全局状态管理框架（如 Redux/Zustand），仅依靠 React 内置状态与统一请求层。所有核心依赖均锁定具体版本。

## 原因与权衡
B 端配置与控制台页面重在表单校验、信息层级和列表渲染，Ant Design 能够提供最高效且规范的组件支持；Gin + GORM 具备优秀的工程认知度，便于将规则评估逻辑与存储解耦编写测试，同时单仓利于评测者一条命令拉起。
