# 0006-clean-layered-package-layout

## 上下文
初始架构设计存在过度拆分文件的倾向，为每个细小实体或函数预先设立独立文件，增加了认知负担与维护冗余。需要确立“适度精简、职责明确、低耦合、高内聚”的工程目录标准。

## 决策
1. **模块单向依赖**：严格遵循 `Handler -> Service -> Repository -> Database` 单向调用链；`Engine` 保持纯内存与零外部依赖（由 Service 层加载规则后注入调用）；模型与错误类型集中收敛于 `domain`。
2. **数据模型集中化**：业务实体（Flag, Rule, AuditLog, Evaluation）及请求/响应参数在 `domain/models.go` 集中定义。
3. **数据访问与业务流程内聚**：
   - Repository 按核心实体拆分：`flag_repo.go`、`rule_repo.go`、`audit_repo.go`、`db.go`。
   - Service 按核心流程组织：`flag_service.go`（生命周期管理）、`rule_service.go`（Diff 比对、批量更新与审计共用单事务紧密内聚）、`eval_service.go`（数据装配与引擎调用）。
4. **前端按业务板块组织**：不建立冗余状态管理层，类型与请求层统一收拢，UI 按页面/核心功能块紧凑聚合。

## 原因与权衡
避免了过度设计与过早抽象，同时杜绝了跨层循环依赖，兼顾代码的可读性、可测试性与后续扩展性。
