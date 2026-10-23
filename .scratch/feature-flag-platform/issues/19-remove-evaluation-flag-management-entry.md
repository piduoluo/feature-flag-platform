# 19: 删除规则评估页的管理 Flag 入口

**Type:** task
**Status:** resolved
**Blocked by:** 18

## Goal

按用户要求移除规则评估页顶部的「管理 Feature Flags」入口及其操作栏。

## Acceptance

- [x] 删除入口和空操作栏，清理因此不再使用的导航引用。
- [x] 生产构建通过，localhost:3000 更新并确认不再包含该入口。

## Answer

- 移除顶部管理 Flag 按钮及其整行容器，清理只供该入口使用的 `useNavigate` 引用。
- 前端容器中的 TypeScript 检查与 Vite 生产构建通过，服务已更新；确认 localhost:3000 实际提供的脚本不再包含该入口文案，仍包含评估表单。
- `git diff --check` 通过。
