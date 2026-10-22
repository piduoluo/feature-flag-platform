# Feature Flag 平台 (Feature Flag Platform)

轻量级特性开关与灰度规则平台，用于在不同运行环境中控制功能开关，并基于用户属性执行有序规则评估与变更审计。

## Language

**Flag (特性开关)**:
针对特定功能的配置单元，在特定环境下具备唯一 Key、启用状态与默认布尔返回值。
_Avoid_: Switch, Toggle, Feature, Config

**Environment (环境)**:
Flag 运行和生效的隔离上下文，限定为 development、staging、production 三类之一。
_Avoid_: Stage, Realm, EnvType

**Rule (规则)**:
挂载在 Flag 下的有优先级的匹配条件，定义了针对特定属性、操作符、期望值的严格类型判断逻辑与命中返回值。
_Avoid_: Condition, Policy, Filter

**Operator (操作符)**:
规则比较逻辑符号，限定为 equals（单个标量严格等值匹配）与 in（标量数组包含匹配）两类。
_Avoid_: Comparator, ConditionType, Action

**Priority (优先级)**:
同一 Flag 下多条规则的执行次序指标，数值越小优先级越高（1 为最高优先级），在同一 Flag 下严格唯一，禁止重复。
_Avoid_: Rank, Order, Weight

**Evaluation (评估)**:
根据传入的环境、Flag Key 及用户上下文属性（合法 JSON 对象），按规则优先级升序依次执行严格类型匹配并计算最终布尔结果的过程。返回原因限定为 `FLAG_DISABLED`、`RULE_MATCH`、`DEFAULT_FALLBACK` 三态之一。
_Avoid_: Check, Match, Resolve, Test

**Audit Log (操作历史)**:
记录 Flag 与规则的创建、修改、批量同步（含新增/修改/删除规则精确 diff）、启停等变更行为的不可变日志，与业务变更在同一数据库事务中原子提交。无实质变化时不产生空记录。
_Avoid_: History, ChangeLog, Event, Activity

**ErrorCode (业务错误码)**:
用于前后端解耦与错误清晰反馈的标准字符串标识，包含 `VALIDATION_ERROR`、`FLAG_NOT_FOUND`、`FLAG_KEY_CONFLICT`、`PRIORITY_CONFLICT`。
_Avoid_: StatusNumber, ErrMsg
