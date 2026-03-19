# SPEC-005: 审核工作流引擎

> 状态: review
> 优先级: P0
> 负责人: PO Agent
> 审核人: PM
> 关联 Task: TASK-005

## 1. 概述
在企业环境中，发布的 Skill（特别是可执行脚本类型的 Skill）存在安全风险和质量问题。本模块提供一个综合了自动扫描与人工干预的审核工作流。确保每一行提交到市场的代码和配置都经过严格的安全合规检查。

## 2. 数据模型（Prisma Schema）
```prisma
model Review {
  id             String   @id @default(uuid())
  versionId      String   @unique
  version        SkillVersion @relation(fields: [versionId], references: [id])
  
  status         ReviewStatus @default(PENDING_AUTO)
  
  // 自动扫描结果
  autoScanResult Json?    // 包含扫描阶段、发现的漏洞、合规性得分等
  
  // 人工审核信息
  reviewerId     String?  // 被分配到的审核员
  reviewer       User?    @relation(fields: [reviewerId], references: [id])
  comments       String?  // 审核员留言，特别是驳回原因
  
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

enum ReviewStatus {
  PENDING_AUTO        // 队列中等待自动扫描
  AUTO_REJECTED       // 被自动扫描拦截（高危）
  PENDING_MANUAL      // 扫描通过，等待分配人工审核员
  IN_REVIEW           // 审核员正在处理
  APPROVED            // 审核通过
  REJECTED            // 人工驳回
  REVISION_REQUESTED  // 要求作者修改重提
}

// 策略配置表 (仅管理员可操作)
model ReviewPolicy {
  id               String   @id @default(uuid())
  category         Category? // 如果为空则为全局策略
  requireManual    Boolean  @default(true) // 是否强制要求人工审核
  autoApproveScore Int      @default(90)   // 自动通过分数线（如支持）
  department       String?  // 适用部门
  requiredApprovers Int      @default(1)    // 需要几个审核人
  reviewerAdGroups String[] // 有权审核的 AD 组
  maxReviewDays    Int      @default(3)    // 最长审核天数
  blockOnSecurityFail Boolean @default(true) // 安全扫描失败直接拒绝
  requiredFiles    String[] @default(["SKILL.md"]) // 必须包含的文件
}
```

## 3. API 接口（端点 + Method + 请求体 + 响应体 + 错误码 + 权限要求）

### 3.1 获取待办审核列表 (GET `/api/v1/reviews/pending`)
- **Query参数**: `status`, `page`, `limit`
- **响应体**: `{ "total", "data": [Review details...] }`
- **权限要求**: 拥有 REVIEWER 或 ADMIN 角色的用户

### 3.2 认领/转派审核任务 (POST `/api/v1/reviews/:id/assign`)
- **请求体**: `{ "assigneeId": "string (optional, 默认认领给自己)" }`
- **响应体**: 更新后的 Review 对象 (`status` -> `IN_REVIEW`)
- **权限要求**: REVIEWER 或 ADMIN

### 3.3 提交审核结论 (POST `/api/v1/reviews/:id/decision`)
- **请求体**: `{ "decision": "APPROVE|REJECT|REVISE", "comments": "string" }`
- **响应体**: 更新后的 Review 对象
- **业务逻辑**: 如果 `APPROVE`，同步更新 `SkillVersion.status = APPROVED` 和 `Skill.status = PUBLISHED`。
- **权限要求**: 该 Review 的当前 Assignee 或 ADMIN

## 4. 业务规则（约束条件、边界情况、状态机）
1. **自动扫描 Pipeline**: 包含四个阶段。
   - 文件验证: 检查 ZIP 炸弹、异常后缀名（如 .exe 等禁止的二进制文件）。
   - 安全扫描: 正则检查是否硬编码密码、Token、内网敏感 IP/域名。
   - 合规检查: 验证 `SKILL.md` 格式是否合规、描述是否包含违禁词。
   - 质量评估: 根据代码结构复杂度给出一个质量参考分。
   若任何一阶段触碰 "FATAL" 规则，状态直转 `AUTO_REJECTED` 并通知作者；否则转入 `PENDING_MANUAL`。
2. **人工自动分配**: 每小时定时任务，根据 REVIEWER 的当前待办数量（负载均衡）以及审核员所在部门（优先分配本部门发布的 Skill）自动填充 `reviewerId`。
3. **超时告警**: 处于 `PENDING_MANUAL` 或 `IN_REVIEW` 超过 48 小时的单子，通过企业 IM（飞书/企微机器人）给对应审核员（或审核组群）发送提醒通知。
4. **版本联动**: 只有 `ReviewStatus` 变为 `APPROVED`，外部才能下载该 `SkillVersion`。一旦有任何一次 `APPROVE`，对应的父级 `Skill` 状态也必须变更为 `PUBLISHED`。

## 5. 前端组件（页面 + 组件 + 交互流程）
- **页面**: `Review Dashboard` (审核工作台)
- **组件**:
  - `ScanReportView`: 可视化展示自动扫描的 Json 结果，红黄绿灯标示各项指标。
  - `CodeDiffViewer`: (进阶) 如果有上一版本，展示此次上传文件与上一版本的 Diff。
  - `DecisionPanel`: 包含三个大按钮（Approve, Reject, Request Changes），旁边带必填的 Comment 输入框（Reject/Revise 时必须填）。

## 6. 安全要求（认证、权限矩阵、数据脱敏、审计日志）
- **职责分离**: Skill 作者即便是 REVIEWER，也绝对不能审核自己发布的版本（在 SQL 和逻辑层做严格校验 `ReviewerId != Skill.ownerId`）。
- **审查日志**: 所有的决策结果、留言、时间戳不可篡改，且永久保存以备合规审计。

## 7. 验收标准
- [ ] 包含恶意后缀名的 ZIP 包上传后，Review 会在 1 分钟内被 `AUTO_REJECTED`，并在前端提示扫描出的具体原因。
- [ ] 合法的包上传后，系统能够将其路由到人工审核列表。
- [ ] REVIEWER 可以成功对工单进行 "批准" 操作，操作后能在普通用户端看到该新版本的 Skill 可以被正常下载。
- [ ] 尝试用自己的 REVIEWER 账号审核自己发布的 Skill 会收到 `403 Forbidden`。

## 8. 变更记录
- 初始版本 draft。- 增强 ReviewPolicy 模型，补充 department, requiredApprovers 等字段；统一 authorId 为 ownerId。
