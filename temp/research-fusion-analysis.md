# 调研精华 → SOP 融合分析

## 调研 6 大模块 vs 我们 SOP v1.2

| 调研模块 | 精华 | 我们现状 | 差距 | 采纳建议 |
|----------|------|---------|------|---------|
| 1) Task/Step 数据结构 | Task 下挂 DAG（Step 图），Step 有 inputs_schema/outputs_schema 强类型契约 | TASK JSON 是扁平的，没有 Step 拆分 | **中等** | ✅ 采纳：大任务拆 steps[]，每个 step 有 assignee + inputs + outputs |
| 2) 状态机 | Task 和 Step 分层状态机，守卫条件（implement 必须 test 通过才能 DONE） | ✅ 已有 Task 级状态机，但无 Step 级 | **大** | ✅ 采纳：加 Step 级状态 + 守卫条件 |
| 3) 事件模型 | Event Bus，标准化事件类型（StepReady/Started/OutputCommitted/Failed/NeedsHuman） | ❌ 没有，只靠 JSON 字段变更 | **大但过重** | ⚠️ 简化采纳：用 event_log[] append-only 数组代替 Event Bus |
| 4) 审计模型 | 3 张表：task_events + agent_actions + artifacts（可回放/追责） | ❌ 只有 verification 字段 | **中等** | ✅ 采纳：在 TASK JSON 中加 audit_trail[] + artifacts[] |
| 5) 冲突/并发 | 资源锁 lease + Integrator 角色 + 幂等 | ✅ 已有文件冲突规则，但无 lease | ⚠️ 过重 | ⚠️ 简化：保持现有规则 + 加 file_locks[] 字段 |
| 6) 实施路线 | MVP→v1→v2 渐进 | 我们是 v1.2 | 对齐 | ✅ 保持渐进 |

## 决定采纳的 4 个精华

### 精华 1: Step 子任务结构（最有价值）
大任务拆成有序 Steps，每个 Step 有明确的输入/输出契约

### 精华 2: 守卫条件（Guard Conditions）
implement 不能 DONE 除非 test PASS；deploy 不能 RUNNING 除非 review PASS

### 精华 3: Event Log（简化版事件溯源）
append-only 事件日志，替代手动改字段——可追溯、不会丢

### 精华 4: Artifacts 管理
产物（diff/test_report/screenshot/log）有结构化记录 + SHA256 校验

## 不采纳（当前阶段过重）
- Event Bus 中间件 — 我们用 JSON 文件 + Git 就够
- 数据库表 — 我们用文件系统
- 资源 Lease 锁 — PM 手动检查文件冲突已够用
