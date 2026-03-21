# SDD 强制执行机制 — Spec 合规保障方案

> 版本: v1.0 | 创建: 2026-03-20
> 问题: Dev 实现时可能跳过 Spec 中定义的功能模块（如前端 UI），导致交付缺失
> 根因分析: Sprint 1-8 中 SPEC 每篇都有"第5章: 前端组件"，但 Dev 全部跳过未实现

---

## 一、问题根因

### 1.1 当前流程缺陷

```
SPEC 编写 → Dev 拿到 SPEC → Dev 自行决定实现哪些章节 → QA 测试 → PO 验收
                                    ↑
                               这里是漏洞！
                        Dev 可以选择性忽略章节
                        QA 测试计划也可能漏掉对应项
```

Sprint 1-8 发生的情况：
- 6 份 SPEC 都有 `## 5. 前端组件` 章节，定义了 22 个页面/组件
- Dev 只实现了后端 API + CLI，**完全跳过前端**
- QA 测试计划侧重 API 测试，未覆盖前端
- PO 验收也只验了 API 层面的 AC，未检查前端
- PM（我）也没有在 Sprint 拆分时把前端 Task 纳入

→ **整条链路都没有强制检查 SPEC 完整性的机制**

### 1.2 三个层面的失职

| 角色 | 失职点 | 原因 |
|------|--------|------|
| PM | Sprint 拆分时没有把前端 Task 纳入 Sprint 1-8 | 优先级判断：先做后端 |
| Dev | 拿到 SPEC 后只做了后端部分 | 没有强制 checklist 对照 |
| QA | 测试计划没覆盖前端章节 | 测试计划是基于 Sprint 目标而非完整 SPEC |
| PO | 验收时没有逐章核对 SPEC | 验收标准（AC）侧重功能而非全面性 |

---

## 二、解决方案：4 道防线

### 防线 1: SPEC 拆分矩阵（PM 职责）

**每次 Sprint 规划时，PM 必须生成 SPEC-TASK 覆盖矩阵**

```markdown
# Sprint X — SPEC 覆盖矩阵

| SPEC | 章节 | 内容 | 本 Sprint 覆盖 | 延后到 Sprint | 原因 |
|------|------|------|---------------|--------------|------|
| 001  | §2 数据模型 | User Prisma Schema | ✅ Sprint 1 | - | - |
| 001  | §3 API 接口 | /auth/login, /auth/me | ✅ Sprint 1 | - | - |
| 001  | §5 前端组件 | Login Page, UserProfileMenu | ❌ | Sprint F1 | 前端独立阶段 |
| 002  | §5 前端组件 | Marketplace, SkillDetail | ❌ | Sprint F1 | 前端独立阶段 |
```

**规则**：
- 每个 SPEC 的每个章节必须有明确的 Sprint 归属
- 如果延后，必须填写原因和目标 Sprint
- **禁止出现"空白"——每个章节要么本期做，要么有明确的延后计划**

### 防线 2: Dev 接收 Checklist（Dev 职责）

**Dev 拿到 Sprint 任务时，必须先生成 Implementation Checklist**

```markdown
# Sprint X Dev Implementation Checklist

## 来源: SPEC-001 认证模块
- [x] §2 数据模型: User model + Prisma migration
- [x] §3 API 接口: POST /auth/login, GET /auth/me, POST /auth/logout
- [x] §4 业务规则: LDAP bind + JWT sign + role mapping
- [ ] §5 前端组件: ⚠️ 本 Sprint 不含（延后到 Sprint F1）
- [x] §6 安全要求: LDAP 注入防护 + JWT 过期
- [x] §7 验收标准: AC-1 ~ AC-5

## 自检结果
- 已实现章节: §2, §3, §4, §6, §7 (5/7)
- 跳过章节: §5 (前端，已确认延后)
- 覆盖率: 71.4% (本 Sprint 目标覆盖率)
```

**规则**：
- Dev 在 coding 前必须生成此 checklist
- **每个跳过的章节必须有 PM 确认的延后原因**
- Checklist 随代码一起提交（保存在 `specs/checklists/sprint-X-checklist.md`）

### 防线 3: QA Spec 对照测试（QA 职责）

**QA 测试计划必须逐条对照 SPEC 验收标准**

```markdown
# QA Sprint X — Spec AC 覆盖矩阵

| SPEC | AC 编号 | AC 内容 | 测试用例 | 测试结果 |
|------|---------|---------|---------|---------|
| 001  | AC-1 | LDAP 登录成功返回 JWT | TC-001 | ✅ PASS |
| 001  | AC-2 | 错误密码返回 401 | TC-002 | ✅ PASS |
| 001  | AC-F1 | 前端 Login Page 可用 | - | ⏭️ 延后 Sprint F1 |
| 002  | AC-1 | 创建 Skill 返回 201 | TC-010 | ✅ PASS |
| 002  | AC-F1 | Marketplace 页面展示 | - | ⏭️ 延后 Sprint F1 |
```

**规则**：
- QA 必须列出 SPEC 中**所有** AC，包括本期不测的
- 不测的必须标注 `⏭️ 延后` + 目标 Sprint
- **禁止 QA "不知道有这个 AC"**

### 防线 4: PO 验收 Spec 覆盖率门禁（PO 职责）

**PO 验收报告必须包含 Spec 覆盖率指标**

```markdown
# PO Sprint X Acceptance Report

## Spec 覆盖率统计

| SPEC | 总章节数 | 本期实现 | 延后 | 覆盖率 |
|------|---------|---------|------|--------|
| 001  | 7 | 6 | 1 (§5前端) | 85.7% |
| 002  | 7 | 6 | 1 (§5前端) | 85.7% |

## 累计覆盖率
| SPEC | 总 AC 数 | 已通过 | 延后 | 未完成 | 累计覆盖率 |
|------|---------|--------|------|--------|-----------|
| 001  | 12 | 10 | 2 | 0 | 83.3% |

## 覆盖率门禁
- 本期目标覆盖率: 80%
- 实际覆盖率: 85.7%
- 判定: ✅ PASS

## 延后项追踪
| 延后项 | 原始 SPEC | 目标 Sprint | Owner |
|--------|----------|------------|-------|
| Login Page | SPEC-001 §5 | Sprint F1 | Dev B |
| Marketplace | SPEC-002 §5 | Sprint F1 | Dev B |
```

**规则**：
- **覆盖率门禁**: 每个 Sprint 结束时，Spec 覆盖率不得低于目标值
- **延后项必须有明确的目标 Sprint**，不允许无限期挂起
- **累计覆盖率趋势**：每个 Sprint 都要看到覆盖率在增长

---

## 三、强制执行流程（改进后的 SDD）

```
┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ PM       │    │ Dev          │    │ QA           │    │ PO           │    │ PM           │
│ Sprint   │───▶│ 生成         │───▶│ Spec AC      │───▶│ Spec 覆盖率   │───▶│ 延后项       │
│ 拆分矩阵  │    │ Implementation│   │ 对照测试      │    │ 门禁验收      │    │ 追踪 & 排期  │
│          │    │ Checklist    │    │              │    │              │    │              │
│ 防线 1    │    │ 防线 2        │    │ 防线 3        │    │ 防线 4        │    │ 闭环         │
└──────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

### 3.1 Sprint 规划阶段（PM）

```
输入: SPEC-001 ~ SPEC-008
输出: Sprint SPEC 覆盖矩阵 + Task 列表

PM 必须:
1. 遍历每个 SPEC 的每个章节
2. 为每个章节分配 Sprint
3. 生成覆盖矩阵，标注本期 / 延后
4. 发到群里让用户确认
```

### 3.2 Dev 开发阶段

```
输入: Sprint Task + SPEC 原文
输出: 代码 + Implementation Checklist

Dev 必须:
1. 开始 coding 前先读完整 SPEC（不只是 Task 描述）
2. 生成 Implementation Checklist，逐章节标注
3. 跳过的章节必须确认有 PM 的延后批准
4. Checklist 随 PR 一起提交
```

### 3.3 QA 测试阶段

```
输入: SPEC AC 列表 + Dev Checklist
输出: Spec AC 对照测试报告

QA 必须:
1. 从 SPEC 提取所有 AC（不只是 Sprint 范围内的）
2. 逐条标注：测试通过 / 延后 / 失败
3. 延后的必须有 PM 确认
```

### 3.4 PO 验收阶段

```
输入: QA 报告 + Dev Checklist + SPEC 原文
输出: 覆盖率报告 + 延后项清单

PO 必须:
1. 计算 Spec 覆盖率（本期 + 累计）
2. 检查覆盖率是否达标
3. 所有延后项必须有目标 Sprint
4. 覆盖率不达标 → 打回
```

---

## 四、Prompt 级别的强制措施

### 4.1 Dev Agent Prompt 增强

在派发 Dev 任务时，Task 描述中增加以下**强制指令**：

```
【强制规则】
1. 开始编码前，必须先读完整 SPEC 文件（不只是相关章节）
2. 生成 Implementation Checklist，保存到 specs/checklists/sprint-X-checklist.md
3. 每个 SPEC 章节必须标注: ✅实现 / ⏭️延后(需PM确认) / ❌不适用
4. 代码提交时 Checklist 必须同时更新
5. 禁止"选择性忽略"——不实现的必须有明确记录
```

### 4.2 QA Agent Prompt 增强

```
【强制规则】
1. 测试计划必须从 SPEC 的 §7 验收标准 逐条提取 AC
2. 对照检查 Dev 的 Implementation Checklist
3. 发现 Dev 跳过了应实现的章节 → 标记为 P0 Bug
4. 测试报告必须包含 "Spec AC 覆盖矩阵"
```

### 4.3 PO Agent Prompt 增强

```
【强制规则】
1. 验收时必须打开 SPEC 原文逐章对照
2. 计算覆盖率，不达标直接打回
3. 延后项必须有目标 Sprint，禁止"待定"
4. 验收报告必须包含 "Spec 覆盖率门禁" 章节
```

---

## 五、回溯分析：Sprint 1-8 如果有这套机制

假设 Sprint 1 规划时就有覆盖矩阵：

| SPEC | §5 前端组件 | 应分配到 | 实际分配到 | 结果 |
|------|-----------|---------|----------|------|
| 001 | Login Page | Sprint F1 | ❌ 未规划 | 漏了 |
| 002 | Marketplace + Detail | Sprint F2 | ❌ 未规划 | 漏了 |
| 003 | VersionUploader | Sprint F2 | ❌ 未规划 | 漏了 |
| 004 | SearchResults | Sprint F2 | ❌ 未规划 | 漏了 |
| 005 | Review Dashboard | Sprint F3 | ❌ 未规划 | 漏了 |
| 006 | Template Pages | Sprint F3 | ❌ 未规划 | 漏了 |

如果有防线 1，PM 在 Sprint 1 规划时就会发现：
> "6 份 SPEC 都有前端章节，但 Sprint 1-8 全是后端 Task，前端去哪了？"

→ 要么立即规划前端 Sprint，要么在覆盖矩阵中明确标注 "延后到 Sprint F1-F3"

---

## 六、立即执行的改进动作

1. **更新 SDD-WORKFLOW.md**：加入 4 道防线描述
2. **更新 Dev/QA/PO Agent 的 Prompt**：加入强制规则
3. **为即将启动的前端 Sprint 应用新机制**：
   - PM 先出覆盖矩阵
   - Dev 必须生成 Checklist
   - QA 逐条对照 AC
   - PO 计算覆盖率
4. **补全 Sprint 1-8 的延后项清单**：明确所有漏掉的前端项归属

---

## 七、核心原则

> **"没有被追踪的延后，就是被遗忘的承诺。"**
>
> SPEC 里写的每一行，要么实现了，要么有明确的计划去实现。
> 不允许存在"灰色地带"——既没实现，也没人记录延后。
