# CodeBuddy 内部推广方案（升级版）—— 从工具采纳到组织提效

> **核心理念**：推工具只是起点，推方法才是关键，推组织变革才见真效。
> 本方案融合了 CodeBuddy 官方功能体系 + 快手万人实践的 L1/L2/L3 方法论 + Claude Code 七大构件落地思路。

---

## 一、破题：为什么「大家都在用 AI」但交付没变快？

快手用一万人规模 + 一年数据证明了一个不等式：

> ⚠️ **用 AI 开发工具 ≠ 个人提效 ≠ 组织提效**
>
> AI 代码生成率从 1% 干到 30%+，个人体感编码效率提升 20%-40%，但组织的需求交付周期基本没变。

**根因分析**：一个需求 5 天交付，纯编码只占 1 天。AI 加速了编码，但技术设计、联调等待、测试、Code Review 这些环节没动。省下的编码时间碎片化，凑不成一个完整工作块。

**关键洞察**：大部分人停在了 L1（只用补全），觉得「也就那样」。真正的价值在 L2 和 L3，但大多数人不知道怎么用。

---

## 二、CodeBuddy 三大产品形态

在推广前，必须让团队理解 CodeBuddy **不是一个单一工具，而是三种形态**：

| 形态 | 定位 | 适用人群 | 推广优先级 |
|------|------|---------|-----------|
| **CodeBuddy 插件** | VS Code / JetBrains 插件，AI 打辅助 | 日常编码开发者 | ⭐⭐⭐ 最先推 |
| **CodeBuddy IDE** | 独立 IDE，对话即编程，内置 Figma | 产品/设计师/全栈/初学者 | ⭐⭐ 第二批 |
| **CodeBuddy Code (CLI)** | 命令行 AI 工具，自然语言驱动开发 | DevOps/SRE/资深开发 | ⭐ 进阶推 |

**推广策略**：
- P0 摸底阶段：调查团队成员目前用的是哪种形态
- 培训分班：按角色分流——开发走插件培训，产品/设计走 IDE 培训，运维/SRE 走 CLI 培训

---

## 三、核心方法论：需求 AI 研发成熟度分级（L1/L2/L3）

> 💡 **关键设计**：不是给人分级，而是给需求分级。同一个团队里，有的需求天然适合 L1，有的适合 L2，少部分可以做 L3。不需要所有人都变成 AI 高手。

| 级别 | 方法 | 模式 | 提效幅度 | CodeBuddy 功能 | 占比目标 |
|------|------|------|---------|---------------|---------|
| **L1** | AI 辅助编码 | Copilot 模式 | 碎片化提效 | 代码补全、技术对话 | 60-70% |
| **L2** | AI 辅助开发 | Agent 模式 | 开发周期 -30% | Skills + 代码评审 + 单测 + MCP | 25-35% |
| **L3** | AI 协同开发 | Agentic 模式 | 开发周期 -40% | Sub Agent + Plan + 全流程编排 | 5-10% |

> 📊 **快手标杆数据**：L2+L3 需求占比达到 20.34% 后，需求交付周期下降 58%。这是我们的目标参考。

### 需求分级操作

每个需求在开发前标注一个 AI 等级：

- **L1（AI 辅助编码）**：适用于改 bug、小需求、纯 UI 调整。CodeBuddy 用法：代码补全 + 技术对话
- **L2（AI 辅助开发）**：适用于中等复杂度需求、有明确接口的新功能。CodeBuddy 用法：Skills + 代码评审 + 单测生成 + MCP
- **L3（AI 协同开发）**：适用于全新模块开发、技术调研、原型验证。CodeBuddy 用法：Sub Agent 全流程编排 + Plan 模式

---

## 四、CodeBuddy 核心功能 × 推广场景全景

### 4.1 第一层：基础功能（L1，覆盖所有人）

#### ⌨️ 智能代码补全

- **官方说明**：混元 + DeepSeek 双模型驱动，不限语言，支持中文输入补全
- **推广动作**：确保每人体验一次 Tab 补全并成功采纳
- **度量指标**：补全采纳率
- **培训话术**：「装好就能用！CodeBuddy 补全让你少敲 50% 的代码」
- 📖 文档：cloud.tencent.com/document/product/1749/112747

#### 💬 技术对话（Chat）

- **官方说明**：对话问答与 IDE 集成打通，回答可一键插入编辑器
- **推广动作**：遇到报错 → 复制到对话框 → AI 给修复方案 → 一键插入
- **关键卖点**：支持混元 + DeepSeek 双模型切换
- **培训话术**：「不用离开 IDE，直接问 AI 技术问题」
- 📖 文档：cloud.tencent.com/document/product/1749/112748

#### 🔍 代码评审（Review）

- **官方说明**：在项目开发过程中及时发现并解决本地代码变更引入的问题
- **推广动作**：嵌入 PR 流程，提交前推荐用 CodeBuddy Review 自查
- **培训话术**：「提 PR 前让 AI 帮你先 Review 一遍，少挨骂」
- 📖 文档：cloud.tencent.com/document/product/1749/111508

#### 🧪 单元测试生成

- **官方说明**：根据函数、方法、内容逻辑生成相关的测试代码
- **推广动作**：提效最明显的功能，重点推！
- **培训话术**：「3 分钟生成 200 行单测，CodeBuddy 帮你搞定最烦的活」
- 📖 文档：cloud.tencent.com/document/product/1749/112593

### 4.2 第二层：进阶功能（L2，Champion 带头推广）

#### 🎯 Skills（技能系统）

> Skills 本质：**可复用的、结构化的 AI 指令模板**，告诉 AI「在特定场景下该怎么做」。对标 Claude Code 的 skills/ + commands/ 目录。

**Skills 培训工作坊（30 分钟 × 2 场）**：

**第一场：5 个内置 Skill 演示**
1. 代码生成 Skill —— 自然语言描述 → 生成代码框架
2. 单测生成 Skill —— 选中函数 → 自动生成测试用例
3. 代码解释 Skill —— 选中复杂代码 → AI 逐行解释
4. 代码重构 Skill —— 选中代码 → 给出优化建议 + 重构方案
5. 文档生成 Skill —— 从代码生成 API 文档

**第二场：自定义 Skill + 团队 Skill 共享**
1. 如何编写自定义 Skill（编写格式、触发条件）
2. 团队级 Skill 模板：代码审查 Skill、安全检查 Skill
3. 建立团队 Skill 库（Git 管理）

#### 🤖 Sub Agent（子代理/任务编排）

> Sub Agent 本质：**把复杂任务拆分给多个专用 AI 子代理并行处理**。对标 Claude Code 的 agents/ 目录。

**推广场景**：

| 场景 | 输入 | Sub Agent 做什么 | 推广话术 |
|------|------|-----------------|---------|
| 需求拆解 | 一段需求描述 | 自动拆分为多个开发子任务 | 「一句话需求，AI 帮你拆成 Task List」 |
| 多文件修改 | 跨文件修改需求 | 规划修改方案 → 逐文件执行 | 「改 10 个文件，AI 帮你规划先后顺序」 |
| 构建排障 | build error | 分析依赖 → 定位根因 → 修复 | 「build 挂了让 Sub Agent 排查」 |

#### 🔒 Hooks 等效方案 —— Rules/Spec 规约编程

对标 Claude Code 的 Hooks 机制，通过 CodeBuddy 的 Rules + 提示词管理实现类似效果：

- **Week 1（提醒型）**：配置提交代码前自动提醒做 AI Review
- **Week 2（一致性型）**：配置团队级 Rules 自动检查代码风格（如「函数必须有注释」「不允许 console.log 提交」）
- **Week 3（阻断型）**：敏感操作拦截（密钥、权限相关代码告警）

#### 🔄 其他 L2 功能

- **模型切换**：混元 ↔ DeepSeek 按需选择（📖 文档：cloud.tencent.com/document/product/1749/116119）
- **内联对话**：行间对话 + 终端对话，无需离开编辑器（📖 文档：cloud.tencent.com/document/product/1749/112804）
- **提示词管理**：统一管理团队常用 Prompt 模板（📖 文档：cloud.tencent.com/document/product/1749/115419）

### 4.3 第三层：高级功能（L3，技术负责人主导）

#### 🔌 MCP Server（模型上下文协议）

- 兼容 MCP 开放生态，让 CodeBuddy 接入外部工具
- 接入内部 API 文档 → CodeBuddy 直接查询接口定义
- 接入 Jira/飞书多维表格 → 读取需求卡片生成代码
- 接入数据库 → 自然语言查询数据
- 📖 文档：cloud.tencent.com/document/product/1749/118093

#### 🎨 Craft 编码智能体（IDE 独有）

- Figma 设计稿转代码
- 0 门槛新建项目，开箱即用
- 自然语言描述需求 → 自动任务拆解并执行

#### 📚 RAG 知识库

- 上传内部文档，让 AI 理解公司业务上下文
- 📖 文档：cloud.tencent.com/document/product/1749/111275

#### 📊 研效度量

- 使用数据的度量面板，为排行榜和 KPI 提供数据支撑
- 📖 文档：cloud.tencent.com/document/product/1749/112000

---

## 五、7 天极简落地路线（CodeBuddy 版）

对标 Claude Code 七大构件，适配 CodeBuddy 实际功能：

| 天数 | Claude Code 原方案 | CodeBuddy 落地 | 交付物 |
|------|-------------------|---------------|--------|
| Day 1 | 编写 CLAUDE.md | 为项目写「上下文说明」，配置 RAG 知识库 | 知识库配置完成 |
| Day 2 | 写 rules/ 底线规则 | 配置团队级 Rules + 提示词模板 | Rules 文件 |
| Day 3 | 落地 /plan 命令 | 培训 Sub Agent 的需求规划功能 | 完成 1 个需求拆解 |
| Day 4 | 落地 /code-review 命令 | 培训代码评审，配置评审 Skill | 完成 1 个 PR AI 审查 |
| Day 5 | 添加提醒型 Hook | 配置提交前自动提醒 AI Review | 规则生效 |
| Day 6 | 添加一致性型 Hook | 配置代码风格自动检查 Skill | 风格检查生效 |
| Day 7 | 引入专用 Agent | 建立团队共享 Skill 库 | Skill 资产仓库 |

---

## 六、全链路推广执行计划

### 🔴 P0（Week 1）：摸底 + L1 全覆盖

**目标**：全员安装、人人会用基础功能

- 用「研效度量」功能导出团队使用基线数据（DAU、补全采纳率等）
- Champion 招募（每 10-15 人选 1 个 Champion）
- 全员安装 + 登录确认
- 基础功能培训：代码补全 + 技术对话 + 单元测试 + 代码评审

### 🟡 P1（Week 2-3）：L1→L2 跃迁（核心！）

**目标**：教方法，不只教工具

- L2 方法论培训 —— 不只教工具，教「开发方法」
- Skills 培训工作坊（2 场 × 30 分钟）
- Sub Agent 使用场景培训
- **关键动作**：选 3-5 个真实需求，用 L2 方法完整走一遍，产出对比数据

### 🟢 P2（Week 4-6）：需求分级 + L3 试点

**目标**：建机制，不只靠个人

- 每个需求标注 L1/L2/L3 等级
- 排行榜 + 案例征集（按 L2+L3 使用情况排名）
- 选 1 个标杆团队试 Sub Agent 全流程（L3）
- MCP Server 接入工作坊

### 🔵 P3（Week 6-8）：度量驱动 + 组织级优化

**目标**：用数据证明价值

- 追踪 L2+L3 占比 vs 需求交付周期变化
- 重新设计部分需求的分工方式（如全栈完成代替前后端协作）
- 团队 Skill 资产库 Git 管理
- 双周 Review 持续迭代

---

## 七、度量指标升级

| 原指标（L1 思维） | 升级指标（L2/L3 思维） |
|:---:|:---:|
| DAU 占比 | **L2+L3 需求占比**（目标：20%+） |
| 人均打开次数 | **L2+L3 需求的交付周期变化** |
| 补全采纳率 | **全流程 AI 参与度**（设计/编码/测试/评审） |
| Skills 使用人数 | **团队 AI 研发成熟度等级分布** |

---

## 八、团队 Rules 资产库结构（Git 仓库）

```
codebuddy-team-config/
├── rules/
│   ├── code-style.md          # 代码风格规约
│   ├── security-baseline.md   # 安全底线
│   ├── naming-convention.md   # 命名规范
│   └── architecture.md        # 架构约定
├── prompts/
│   ├── unit-test.md           # 单测生成提示词
│   ├── code-review.md         # 代码审查提示词
│   ├── api-doc.md             # API 文档生成提示词
│   └── bug-analysis.md        # Bug 分析提示词
├── mcp-configs/
│   ├── jira.json              # JIRA MCP 配置
│   ├── jenkins.json           # Jenkins MCP 配置
│   └── feishu.json            # 飞书 MCP 配置
├── skills/
│   ├── security-check/        # 安全检查 Skill
│   ├── code-review/           # 代码审查 Skill
│   └── test-gen/              # 测试生成 Skill
├── rag-docs/
│   ├── api-guide.md           # API 指南
│   └── architecture-overview.md # 架构概览
└── README.md                  # 使用说明
```

---

## 九、避坑指南（从快手经验提炼）

| 快手踩过的坑 | 对我们的警示 |
|:---|:---|
| AI 代码生成率高但交付没变快 | 不要只看「打开次数」，要看「需求交付周期」 |
| 大部分人停在 L1 | 推广重点应放在 L1→L2 的跃迁培训上 |
| 各个 AI 工具散乱互不相通 | 推动 MCP 接入，串联内部工具链 |
| 省下的时间碎片化 | 要在团队层面重新设计分工，不只是个人工具 |
| 通用工具只能达到通用效果 | 必须配置 Rules + RAG + Skills 做团队定制 |

---

## 十、功能推广优先级总表

**🔴 P0（第 1 周 - 人人必会）**
- ✅ 智能代码补全（装好就用，零学习成本）
- ✅ 技术对话 Chat（有问题就问 AI）
- ✅ 单元测试生成（提效最明显）
- ✅ 代码评审辅助（嵌入 PR 流程）

**🟡 P1（第 2-3 周 - Champion 带头）**
- 📦 Skills 使用（内置 Skill + 自定义 Skill）
- 🤖 Sub Agent 任务编排（需求拆解、多文件修改）
- 🔄 模型切换（混元 ↔ DeepSeek）
- 📝 内联对话（行间 + 终端）

**🟢 P2（第 4-6 周 - 团队级落地）**
- 🔌 MCP Server 接入（连接内部工具链）
- 📚 RAG 知识库（接入团队业务文档）
- 📐 团队 Rules/规约（类似 Hooks 效果）
- 🎨 Craft + Figma（面向产品和设计师）

**🔵 P3（第 6-8 周 - 度量与运营）**
- 📈 研效度量面板（数据驱动运营）
- 🏆 排行榜 + 案例征集
- 📚 团队 Skill 资产库（Git 管理）
- 🔄 持续迭代（双周 Review）

---

## 十一、官方参考链接汇总

| 功能 | 官方文档 |
|:---|:---|
| 产品概述 | cloud.tencent.com/document/product/1749/104236 |
| 代码补全 | cloud.tencent.com/document/product/1749/112747 |
| 技术对话 | cloud.tencent.com/document/product/1749/112748 |
| 单元测试 | cloud.tencent.com/document/product/1749/112593 |
| 代码评审 | cloud.tencent.com/document/product/1749/111508 |
| 内联对话 | cloud.tencent.com/document/product/1749/112804 |
| MCP Server | cloud.tencent.com/document/product/1749/118093 |
| 模型切换 | cloud.tencent.com/document/product/1749/116119 |
| RAG 知识库 | cloud.tencent.com/document/product/1749/111275 |
| 提示词管理 | cloud.tencent.com/document/product/1749/115419 |
| 研效度量 | cloud.tencent.com/document/product/1749/112000 |
| 飞书集成 | cloud.tencent.com/document/product/1749/111929 |
| 安装指南 | cloud.tencent.com/document/product/1749/105967 |

---

> **一句话总结**：快手用万人实践证明——推工具只是起点，推方法才是关键，推组织变革才见真效。我们的 CodeBuddy 推广方案，核心不是让打开次数变多，而是让 L2+L3 需求占比逐步提升到 20%+，从而实现需求交付周期的真正下降。
