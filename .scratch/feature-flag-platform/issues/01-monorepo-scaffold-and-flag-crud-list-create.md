# 01: Monorepo 基础脚手架与 Flag 列表及创建

**What to build:**
一个完整的垂直切片：配置管理员和研发人员能够访问平台前端，查看按环境（development、staging、production）筛选或按关键字搜索的 Feature Flag 列表，并可以通过新建抽屉在指定环境下创建一个全新的 Flag。若在同一环境下尝试创建已存在的 Flag Key，系统会给出清晰的冲突提示（FLAG_KEY_CONFLICT）；在不同环境下创建相同的 Flag Key 则能顺利成功。所有 Flag 数据持久化到 PostgreSQL 数据库中。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 研发人员可以在特定环境（development、staging 或 production）下创建一个具备唯一 Key、名称、可选描述及默认布尔返回值的 Flag
- [ ] 研发人员可以在不同环境中使用相同的 Flag Key
- [ ] 在同一环境下试图创建重复 Flag Key 时，系统返回明确的业务冲突错误码（FLAG_KEY_CONFLICT）并在前端展示友好警示
- [ ] 前端 Flag 列表支持按环境筛选及按名称/Key 搜索，展示 Flag 启停徽标与默认返回值，包含清晰的加载状态与空状态占位
- [ ] 创建 Flag 表单具备前端必填项与格式校验，提交期间禁用按钮防止重复提交
- [ ] 自动化测试覆盖 Flag 在同一环境下 Key 唯一的物理约束校验及创建/检索接口功能
