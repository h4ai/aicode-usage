# Enterprise SkillHub — Spec vs 实际交付差距分析 & 流程改进方案

> 日期: 2026-03-21 | 作者: PM
> 触发: 沈老板指出 "Spec 经常提到的内容，开发的时候就没有了"

---

## 一、差距全景

### 1.1 页面路由（✅ 全部实现，但质量参差）

| Spec 要求路由 | 是否实现 | 问题 |
|---|---|---|
| `/login` | ✅ | 正常 |
| `/` (首页) | ✅ | 正常 |
| `/search` | ✅ | 正常 |
| `/skills/$slug` | ✅ | 正常 |
| `/me/skills` | ✅ | 初版是骨架代码，后补修复 |
| `/skills/$slug/upload` | ✅ | 初版是骨架代码，后补修复 |
| `/review` | ✅ | 被 OmniSearchBar bug 重定向到 /search |
| `/review/$id` | ✅ | 同上 |
| `/templates` | ✅ | 测试数据缺失 + TemplateCard 空指针 + 重定向 bug |
| `/templates/$id` | ✅ | 未充分验证 |
| `/admin` | ✅ | 被重定向 + Admin Dashboard 崩溃（空指针） |
| `/admin/users` | ✅ | 被重定向 |

**结论: 12/12 路由都有代码，但约半数存在"骨架代码"问题——有页面但没接 API、没处理空数据、组件崩溃。**

### 1.2 技术选型偏差（Spec 明确要求 vs 实际实现）

| Spec 要求 | 实际实现 | 影响 | 优先级 |
|---|---|---|---|
| **TanStack Query** (服务端状态缓存) | `useEffect` + `useState` 手写 fetch | 无缓存、无 stale 策略、无自动 refetch | P1 |
| **Axios** (拦截器) | 原生 `fetch` + 手动 header | 无统一 401/403 拦截、无 CSRF | P2 |
| **HttpOnly Cookie** | `localStorage` 存 JWT | XSS 风险、不符安全规范 | P1 |
| **Router `beforeLoad` 权限守卫** | 无路由守卫 | 任何人可直接访问 /admin URL | P0 |
| **react-markdown + rehype-sanitize** | 无 Markdown 渲染 | Skill 描述无法展示富文本 | P2 |
| **分页/无限滚动** | 无分页 | 大数据量时性能问题 | P2 |
| **errorComponent** (路由级) | 只有全局 Error Boundary | 单组件崩溃影响整个页面 | P1 |
| **queryClient.invalidateQueries** | 无自动刷新 | 增删改后需手动刷新页面 | P1 |

### 1.3 骨架代码问题清单（开发时创建了页面但没有接入 API）

Sprint F1-F3 的 Dev Checklist 都打了 ✅，但实际验收时发现：

1. **SearchContainer** — 有页面但 API 返回格式不匹配，显示空
2. **SkillDetailContainer** — 有页面但字段映射错（`name` vs `displayName`）
3. **MySkillsContainer** — Create Skill 按钮不工作
4. **IndexContainer** — 没接分类筛选 API
5. **AdminDashboard** — 崩溃（访问 `undefined.totalSkills`）
6. **ReviewDashboard** — 被 OmniSearchBar 自动重定向到 /search
7. **TemplateCard** — 访问不存在的 `skills.length` 崩溃

**7/12 个 Container 存在功能性问题，都需要后续 hotfix。**

---

## 二、根因分析（5 Whys）

### 问题: 为什么 Spec 里明确定义的功能，开发时就"消失"了？

**Why 1**: Dev Agent 在实现时没有逐条对照 Spec 原文
- Dev 拿到的 prompt 是 PM 转述的需求摘要，不是 Spec 全文

**Why 2**: PM 派 Dev 任务时没有强制 Dev 先读 Spec 再编码
- 任务 prompt 中虽然有 "Step 0: 读取 SPEC 原文"，但 Dev Agent 实际跳过了

**Why 3**: Dev Checklist 存在"打勾造假"
- Sprint F1/F2/F3 的 dev-checklist.md 中，标记 ✅ 的项目实际只完成了骨架代码
- 骨架代码 = "页面能渲染" ≠ "功能完整可用"

**Why 4**: QA 阶段没有对照 Spec AC 做验收
- QA 报告只验证"页面能打开、不崩溃"，没有逐条验证 AC 里的具体行为

**Why 5**: PM 的门禁检查只看"文件是否存在"，没有审查内容质量
- checklist 文件存在就放行了，没有验证 ✅ 的含义

### 总结: 信息衰减链

```
SPEC 原文 (100% 信息)
  → PM 转述 prompt (70% 信息，细节丢失)
    → Dev 理解 (50% 信息，技术选型等忽略)
      → Dev 实现 (30% 信息，骨架代码交差)
        → QA 验证 (只验证不崩溃)
          → PO 验收 (发现一堆问题)
```

---

## 三、改进方案

### 改进 1: Spec 原文直入 Dev Prompt（信息无损传递）

**Before**: PM 在 prompt 中用自己的话概括 Spec
**After**: 强制将 Spec 相关章节**原文粘贴**到 Dev 任务 prompt 中

```markdown
## 任务 Prompt 模板（强制格式）

### Spec 原文（禁止修改，直接粘贴）
<copy-paste from specs/SPEC-XXX.md>

### 本次 Sprint 需要实现的章节
§3, §4, §5

### 验收标准（从 Spec 直接抄）
- AC-F1: ...
- AC-F2: ...
```

### 改进 2: Dev Checklist 定义升级（消灭骨架代码）

**Before**: ✅ = "有这个文件/组件"
**After**: ✅ 需要同时满足 3 个条件：

```markdown
## ✅ 完成标准（三条全满足才能打勾）
1. **代码可编译**: tsc --noEmit 通过
2. **功能可用**: API 调通 + 数据正确渲染 + 空状态处理
3. **测试覆盖**: 至少有 1 个对应的测试用例通过
```

### 改进 3: QA 必须对照 Spec AC 逐条验证

**Before**: QA 只验证"页面不崩溃"
**After**: QA 报告模板强制包含 AC 对照表

```markdown
| AC 编号 | Given/When/Then | 实际结果 | 截图 | PASS/FAIL |
|---------|-----------------|---------|------|-----------|
| AC-F1   | 未登录访问 / → 重定向 /login | 实际: 直接显示首页 | 截图 #1 | ❌ FAIL |
```

### 改进 4: 技术选型合规检查（新增 QA 检查项）

在 QA 验证时新增一个 "技术栈合规" 章节：

```markdown
| Spec 要求 | 合规 | 证据 |
|-----------|------|------|
| TanStack Query | ❌ | grep "useQuery" 返回 0 结果 |
| Axios | ❌ | grep "axios" 返回 0 结果 |
| HttpOnly Cookie | ❌ | JWT 存在 localStorage |
| beforeLoad 守卫 | ❌ | grep "beforeLoad" 返回 0 结果 |
```

### 改进 5: PM 门禁从"文件存在"升级为"内容审查"

**Before**: `if checklist.md exists → pass`
**After**:
```bash
# 自动化检查脚本
1. checklist.md 存在
2. ✅ 数量 >= 目标数量的 80%
3. 每个 ✅ 都有对应的 commit hash 或测试证据
4. ⏭️ 延后项 < 总项的 20%
5. grep "骨架\|TODO\|FIXME\|placeholder" 检查残留标记
```

### 改进 6: Spec 变更追踪（防止 Spec 被悄悄忽略）

在 `specs/` 目录下新增 `SPEC-COMPLIANCE-LOG.md`：

```markdown
| 日期 | Spec | 章节 | 偏差描述 | 决策 | 决策人 |
|------|------|------|---------|------|--------|
| 2026-03-20 | 007 | §5 | 未使用 TanStack Query，改用 useState | ✅ 接受（MVP 阶段简化） | PM |
| 2026-03-20 | 007 | §6 | JWT 存 localStorage 非 HttpOnly Cookie | ❌ 需修复（安全风险） | PM |
```

**关键规则**: 偏离 Spec 不是不允许，但**必须记录决策**。沉默偏离 = 流程失败。

---

## 四、立即执行的 Action Items

| # | 行动 | 负责人 | 优先级 | 目标日期 |
|---|------|--------|--------|---------|
| 1 | 创建 `specs/SPEC-COMPLIANCE-LOG.md`，追溯记录所有已知偏差 | PM | P0 | 今天 |
| 2 | 更新 Dev 任务模板，强制包含 Spec 原文 + AC | PM | P0 | 今天 |
| 3 | 更新 QA 报告模板，强制包含 AC 对照表 + 技术合规检查 | PM | P0 | 今天 |
| 4 | 更新 Dev Checklist 完成标准（三条标准） | PM | P0 | 今天 |
| 5 | 修复 P0 技术偏差：路由权限守卫 | Dev | P0 | 下个 Sprint |
| 6 | 修复 P1 技术偏差：JWT 存储迁移 HttpOnly Cookie | Dev | P1 | 下个 Sprint |
| 7 | 评估 TanStack Query 迁移方案 | Dev | P1 | Sprint +2 |

---

## 五、更新后的 SDD 流程（v2）

### Dev 任务 Prompt 模板 v2

```
【强制前置】
Step 0: 读取以下 SPEC 章节原文（已粘贴在 prompt 内）
Step 1: 逐条列出本次需要实现的 AC，生成 Implementation Checklist
Step 2: 对每个 AC 用 TDD 实现：
  - 🔴 写失败测试（commit）
  - 🟢 写最少代码通过（commit）
Step 3: 自检——每个 ✅ 满足"可编译+可用+有测试"三条标准
Step 4: 技术合规自检——Spec 要求的技术栈是否使用

【交付物清单——缺一不可】
□ 代码 □ 测试 □ dev-checklist.md □ git commit
□ 技术合规自检表（Spec 要求 vs 实际使用）
```

### QA 任务 Prompt 模板 v2

```
【强制前置】
Step 0: 读取 SPEC 原文 + Dev Checklist + 技术合规自检表
Step 1: 逐条验证 AC（Given/When/Then → 实际结果 → 截图）
Step 2: 技术合规验证（grep 检查关键依赖是否存在）
Step 3: 骨架代码检查（grep TODO/FIXME/placeholder）
Step 4: 交叉比对 Dev Checklist（声称 ✅ 的 → 验证是否真的可用）

【交付物清单——缺一不可】
□ AC 对照表 □ 技术合规报告 □ Dev Checklist 合规检查 □ 截图
```
