# 10: 旧巨石抽屉 FlagDetailDrawer 清理与测试迁移核查

**What to build:**
完成旧巨石抽屉组件的技术债安全下线与全量清理。在删除旧代码前，严格对照原 `FlagDetailDrawer.test.tsx` 中的 8 项关键测试用例，核查其在全新全屏工作台及各子模块测试套件中的迁移完整度，确保无任何业务用例与测试行为遗漏。核查通过后，彻底安全删除超过 1000 行的原巨石抽屉组件 `FlagDetailDrawer.tsx` 及其旧测试文件，清理代码库中全部旧组件导入与残留调用，确保前端编译无告警且全量测试套件 100% 绿灯。

**Blocked by:** 06: 全域真实脏检查状态机、确定性保存顺序与离开守卫, 08A: 当前 Flag 变更历史垂直时间轴与结构化 Diff 呈现

**Status:** ready-for-agent

- [ ] 严格核对原 `FlagDetailDrawer.test.tsx` 中 8 项关键测试的迁移覆盖率，确认逐项得到继承：
  1. 基础信息展示渲染 $\rightarrow$ 已在 Ticket 03 集成测试中覆盖
  2. 基本设置表单更新与提交 $\rightarrow$ 已在 Ticket 03 集成测试中覆盖
  3. 启停状态切换与错误回滚 $\rightarrow$ 已在 Ticket 03 集成测试中覆盖
  4. 审计日志时间轴加载呈现 $\rightarrow$ 已在 Ticket 08A 集成测试中覆盖
  5. 审计日志加载异常 Alert $\rightarrow$ 已在 Ticket 08A 集成测试中覆盖
  6. 规则列表优先级排序渲染 $\rightarrow$ 已在 Ticket 04 集成测试中覆盖
  7. 规则优先级互换并批量保存 $\rightarrow$ 已在 Ticket 05 集成测试中覆盖
  8. 清空全部规则二次确认与保存 $\rightarrow$ 已在 Ticket 05 集成测试中覆盖
- [ ] 安全删除 `frontend/src/components/FlagDetailDrawer.tsx` 巨石组件文件（1097 行）
- [ ] 安全删除 `frontend/src/components/FlagDetailDrawer.test.tsx` 旧测试文件
- [ ] 检索全代码库，彻底清理对 `FlagDetailDrawer` 的所有 import 导入、类型引用与死代码
- [ ] 执行 `npm --prefix frontend run build`，确认项目构建完全成功，无任何 TypeScript 类型报错与 ESLint 告警
- [ ] 执行 `npm --prefix frontend test`，确认现有现代化测试套件全量 Pass（100% 绿灯）
