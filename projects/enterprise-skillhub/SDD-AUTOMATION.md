# SDD 自动化门禁 — 把 4 道防线硬编码到流程中

> 版本: v1.0 | 创建: 2026-03-20
> 目标: 确保 4 道防线不依赖人的记忆，而是系统自动执行、自动检查、自动拦截

---

## 核心思路

> **人会忘记，系统不会。**
> 把每道防线变成"不执行就无法进入下一步"的硬门禁。

---

## 实施方案：3 层保障

### 第 1 层：Prompt 硬编码（Agent 级别）

每个 Agent（Dev/QA/PO）的任务 Prompt 中嵌入强制检查指令，Agent 不执行就无法完成任务。

### 第 2 层：交付物门禁（文件级别）

每个阶段必须产出特定文件，下一阶段启动前 PM 自动检查文件是否存在且合格。

### 第 3 层：PM 编排脚本（流程级别）

PM 在派发任务时按固定模板执行，不是凭记忆，而是按脚本一步步走。

---

## 第 1 层：Agent Prompt 硬编码

### Dev Agent 任务模板

```
你是 Enterprise SkillHub 的全栈开发工程师。本次任务：{任务描述}

【强制前置步骤 — 不执行则任务失败】

Step 0: 读取 SPEC 原文
- 读取 specs/SPEC-{编号}.md 的完整内容（不是摘要）
- 读取 specs/SPEC-COVERAGE-MATRIX.md 找到本 Sprint 应覆盖的章节

Step 1: 生成 Implementation Checklist
- 创建文件: specs/checklists/sprint-{X}-dev-checklist.md
- 遍历 SPEC 的每个章节，标注:
  ✅ 本 Sprint 实现
  ⏭️ 延后（已在覆盖矩阵中确认）
  ❌ 不适用
- 计算覆盖率百分比

Step 2: 编码实现
- 按 Checklist 逐项实现
- 使用 TDD（先写测试再写实现）

Step 3: 自检
- tsc --noEmit 通过
- 全量测试通过
- 更新 Checklist 打勾

Step 4: 交付
- git commit（有意义的 message）
- Checklist 文件必须随代码一起提交

【交付物清单 — 缺少任何一项则任务不算完成】
□ 代码实现
□ 单元测试
□ specs/checklists/sprint-{X}-dev-checklist.md
□ git commit
```

### QA Agent 任务模板

```
你是 Enterprise SkillHub 的 QA 测试工程师。本次任务：Sprint {X} 测试。

【强制前置步骤 — 不执行则任务失败】

Step 0: 读取 SPEC 和 Dev Checklist
- 读取 specs/SPEC-{编号}.md（完整内容）
- 读取 specs/checklists/sprint-{X}-dev-checklist.md
- 读取 specs/SPEC-COVERAGE-MATRIX.md

Step 1: 生成 Spec AC 对照表
- 从 SPEC 的验收标准章节提取所有 AC
- 从 SPEC-007 提取所有前端 AC（如适用）
- 逐条标注：
  🧪 本次测试
  ⏭️ 延后（覆盖矩阵确认）
  ❌ 不适用

Step 2: 对照检查 Dev Checklist
- 检查 Dev 声称实现的章节是否都实现了
- 检查 Dev 声称跳过的章节是否在覆盖矩阵中有记录
- 发现不一致 → 标记为 P0 Bug

Step 3: 执行测试
- 按 AC 对照表逐条测试
- tsc --noEmit 检查
- 全量单元测试运行

Step 4: 交付测试报告
- 创建文件: specs/reports/sprint-{X}-qa-report.md
- 必须包含 "Spec AC 覆盖矩阵" 章节
- 必须包含 Dev Checklist 合规检查结果

【交付物清单 — 缺少任何一项则任务不算完成】
□ specs/reports/sprint-{X}-qa-report.md
□ Spec AC 对照表（含延后项标注）
□ Dev Checklist 合规检查
□ 测试执行结果
```

### PO Agent 任务模板

```
你是 Enterprise SkillHub 的产品经理（PO）。本次任务：Sprint {X} 验收。

【强制前置步骤 — 不执行则任务失败】

Step 0: 读取所有材料
- 读取 specs/SPEC-{编号}.md（完整内容，逐章阅读）
- 读取 specs/checklists/sprint-{X}-dev-checklist.md
- 读取 specs/reports/sprint-{X}-qa-report.md
- 读取 specs/SPEC-COVERAGE-MATRIX.md

Step 1: 逐章核对
- 打开 SPEC 原文
- 对比 Dev Checklist 和 QA Report
- 逐章节确认：实现了 / 确认延后 / 遗漏

Step 2: 计算覆盖率
- 本 Sprint 覆盖率 = 已实现章节 / 本 Sprint 应覆盖章节
- 累计覆盖率 = 已实现总章节 / SPEC 总章节
- 覆盖率门禁: ≥95% 通过，<95% 打回

Step 3: 检查延后项
- 所有延后项必须有目标 Sprint
- 禁止"待定"或"后续再说"
- 延后项总数不得超过总章节的 20%

Step 4: 交付验收报告
- 创建文件: specs/reports/sprint-{X}-acceptance-report.md
- 必须包含:
  - Spec 覆盖率统计表
  - 延后项追踪表
  - 通过/打回决定 + 理由

【交付物清单 — 缺少任何一项则任务不算完成】
□ specs/reports/sprint-{X}-acceptance-report.md
□ 覆盖率统计（含门禁判定）
□ 延后项追踪表（含目标 Sprint）
□ PASS / REJECT 决定
```

---

## 第 2 层：交付物门禁

### 文件检查清单

每个阶段结束后，PM 在派发下一阶段任务前，检查文件是否存在：

```
Sprint {X} 门禁检查:

阶段 1 → 阶段 2（Dev → QA）:
  □ specs/checklists/sprint-{X}-dev-checklist.md 存在
  □ Checklist 中无"空白"章节（每章都有标注）
  □ git log 有本 Sprint 的 commit

阶段 2 → 阶段 3（QA → PO）:
  □ specs/reports/sprint-{X}-qa-report.md 存在
  □ Report 中有 "Spec AC 覆盖矩阵" 章节
  □ Report 中有 "Dev Checklist 合规检查" 章节

阶段 3 → 下一 Sprint（PO → PM）:
  □ specs/reports/sprint-{X}-acceptance-report.md 存在
  □ Report 中有覆盖率统计 ≥95%
  □ Report 中有延后项追踪表
  □ 判定为 PASS
```

---

## 第 3 层：PM 编排脚本

### PM 派发 Sprint 的标准流程

PM 每次启动新 Sprint 时，按以下脚本执行（不是凭记忆）：

```markdown
# PM Sprint {X} 编排 Checklist

## Phase 0: 规划（PM 自己做）
- [ ] 读取 SPEC-COVERAGE-MATRIX.md
- [ ] 确认本 Sprint 应覆盖的 SPEC 章节
- [ ] 更新覆盖矩阵（如有调整）
- [ ] 生成 Sprint Task 描述

## Phase 1: 派发 Dev（使用上面的 Dev 模板）
- [ ] 同步所有需要的文件到 Dev workspace
- [ ] 使用 Dev Agent 任务模板派发
- [ ] 模板中包含: SPEC 编号、Sprint 编号、应覆盖章节列表
- [ ] 等待 Dev 完成

## Phase 2: 检查 Dev 交付物（门禁 1）
- [ ] 检查 specs/checklists/sprint-{X}-dev-checklist.md 是否存在
- [ ] 检查 Checklist 覆盖率 ≥ 本 Sprint 目标
- [ ] 如果不合格 → 打回 Dev 补充
- [ ] 合格 → 同步文件到 QA workspace

## Phase 3: 派发 QA（使用上面的 QA 模板）
- [ ] 同步代码 + SPEC + Dev Checklist 到 QA workspace
- [ ] 使用 QA Agent 任务模板派发
- [ ] 等待 QA 完成

## Phase 4: 检查 QA 交付物（门禁 2）
- [ ] 检查 specs/reports/sprint-{X}-qa-report.md 是否存在
- [ ] 检查 Report 是否包含 Spec AC 覆盖矩阵
- [ ] 如果测试有 FAIL → 派 Dev 修复 → 重新 QA
- [ ] 全部 PASS → 同步文件到 PO workspace

## Phase 5: 派发 PO 验收（使用上面的 PO 模板）
- [ ] 同步所有文件到 PO workspace
- [ ] 使用 PO Agent 任务模板派发
- [ ] 等待 PO 完成

## Phase 6: 检查 PO 交付物（门禁 3）
- [ ] 检查 specs/reports/sprint-{X}-acceptance-report.md 是否存在
- [ ] 检查覆盖率是否 ≥95%
- [ ] 检查延后项是否都有目标 Sprint
- [ ] PASS → 进入下一 Sprint
- [ ] REJECT → 回到 Phase 1 修复

## Phase 7: 收尾
- [ ] git commit + push
- [ ] 更新 SPEC-COVERAGE-MATRIX.md 覆盖率
- [ ] 更新 memory/YYYY-MM-DD.md 记录
- [ ] 汇报到群里
```

---

## 自动化程度对比

| 保障措施 | Sprint 1-8（旧） | Sprint F1+（新） |
|---------|----------------|----------------|
| Sprint 规划时检查 SPEC 章节 | ❌ PM 凭经验 | ✅ 覆盖矩阵强制遍历 |
| Dev 读完整 SPEC | ❌ Dev 可能只看 Task 描述 | ✅ Prompt 强制 Step 0 |
| Dev 生成 Checklist | ❌ 无 | ✅ Prompt 强制 + 文件门禁 |
| QA 对照 SPEC AC | ❌ QA 基于 Sprint 目标 | ✅ Prompt 强制逐条对照 |
| QA 检查 Dev 合规 | ❌ 无 | ✅ Prompt 强制交叉检查 |
| PO 逐章核对 SPEC | ❌ PO 只看 AC | ✅ Prompt 强制逐章打开 |
| 覆盖率门禁 | ❌ 无 | ✅ ≥95% 才能 PASS |
| 延后项追踪 | ❌ 无 | ✅ 必须有目标 Sprint |
| PM 派发流程 | ❌ 凭经验 | ✅ 标准 Checklist 脚本 |

**关键区别：旧流程靠人记住，新流程靠系统强制。**

---

## 为什么这次不会忘记

1. **Prompt 硬编码** — Agent 的任务描述里写死了步骤，不执行就没法交付
2. **文件门禁** — 下一阶段需要上一阶段的文件，文件不存在就卡住
3. **PM 编排脚本** — PM 不是凭记忆派任务，而是按 Checklist 逐步执行
4. **交叉验证** — QA 检查 Dev 的 Checklist，PO 检查 QA 的 Report，每层都有人复核
5. **覆盖率趋势** — 每个 Sprint 都能看到覆盖率在增长，停滞立即可见

> **一句话总结：把流程变成代码，把检查变成门禁，把记忆变成文件。**
