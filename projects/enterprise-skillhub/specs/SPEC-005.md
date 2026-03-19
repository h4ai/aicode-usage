# SPEC-005: 审核工作流引擎

> 状态: approved
> 优先级: P0
> 负责人: PO Agent
> 审核人: PM
> 关联 Task: TASK-005

## 1. 概述
在企业环境中，发布的 Skill（特别是可执行脚本类型的 Skill）存在安全风险和质量问题。本模块提供一个综合了自动扫描与人工干预的审核工作流。确保每一行提交到市场的代码和配置都经过严格的安全合规检查。

## 2. 数据模型（Prisma Schema）
```prisma
model SkillReview {
  id              String        @id @default(uuid())
  skillId         String
  skill           Skill         @relation(fields: [skillId], references: [id])
  versionId       String
  version         SkillVersion  @relation(fields: [versionId], references: [id])

  // 审核状态
  status          ReviewStatus  @default(PENDING_AUTO)

  // 自动扫描
  autoScanPassed  Boolean?
  autoScanDetail  Json?         // 详细扫描报告

  // 人工审核
  reviewerId      String?
  reviewer        User?         @relation("reviewer", fields: [reviewerId], references: [id])
  reviewComment   String?
  reviewScore     Int?          // 1-5 质量评分

  // 提交人
  submitterId     String
  submitter       User          @relation("submitter", fields: [submitterId], references: [id])

  // 审核策略
  policyId        String?
  policy          ReviewPolicy? @relation(fields: [policyId], references: [id])

  // 时间线
  submittedAt     DateTime  @default(now())
  autoScannedAt   DateTime?
  assignedAt      DateTime?
  reviewedAt      DateTime?
  approvedAt      DateTime?

  @@index([status])
  @@index([reviewerId])
  @@index([skillId])
}

enum ReviewStatus {
  PENDING_AUTO        // 等待自动扫描
  AUTO_REJECTED       // 自动扫描未通过（最终态）
  PENDING_MANUAL      // 等待人工审核
  IN_REVIEW           // 审核中
  APPROVED            // 已通过
  REJECTED            // 已驳回（最终态）
  REVISION_REQUESTED  // 要求修改
}

model ReviewPolicy {
  id                  String    @id @default(uuid())
  name                String    @unique
  category            SkillCategory?        // 适用的技能类别，null=全局
  department          String?               // 适用的部门，null=全局

  // 策略规则
  autoApproveEnabled  Boolean   @default(false)  // 自动扫描通过后是否自动审批
  autoApproveMinScore Int       @default(90)     // 自动审批最低分
  requiredApprovers   Int       @default(1)      // 需要几个审核人
  reviewerAdGroups    String[]                   // 有权审核的 AD 组
  maxReviewDays       Int       @default(3)      // 最长审核天数（超时告警）

  // 自动扫描配置
  blockOnSecurityFail Boolean   @default(true)   // 安全扫描失败直接拒绝
  blockOnLicenseFail  Boolean   @default(true)   // 许可证不合规直接拒绝
  requiredFiles       String[]  @default(["SKILL.md"])  // 必须包含的文件

  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  reviews             SkillReview[]
}
```

> **注意**：
> - 模型名为 `SkillReview`（非 `Review`），与 TECH-DESIGN.md 完全一致。
> - 补充了 `submitterId/submitter` 关联、`skillId` 直接关联 Skill、时间线字段（submittedAt/autoScannedAt/assignedAt/reviewedAt/approvedAt）、`reviewScore Int?` 质量评分。
> - `ReviewPolicy` 补充了 `department`、`requiredApprovers`、`reviewerAdGroups[]`、`maxReviewDays`、`blockOnSecurityFail`、`blockOnLicenseFail`、`requiredFiles[]`。

## 3. API 接口（端点 + Method + 请求体 + 响应体 + 错误码 + 权限要求）

### 3.1 获取待办审核列表 (GET `/api/v1/reviews/pending`)
- **Query 参数**: `status`, `page`(默认1), `limit`(默认20, 最大100)
- **响应体**: `{ "total", "page", "limit", "data": [SkillReview details...] }`
- **权限要求**: 拥有 REVIEWER 或 ADMIN 角色的用户

### 3.2 认领/转派审核任务 (POST `/api/v1/reviews/:id/assign`)
- **请求体**: `{ "assigneeId": "string (optional, 默认认领给自己)" }`
- **响应体**: 更新后的 SkillReview 对象（`status` → `IN_REVIEW`, `assignedAt` 更新）
- **权限要求**: REVIEWER 或 ADMIN

### 3.3 提交审核结论 (POST `/api/v1/reviews/:id/decision`)
- **请求体**: `{ "decision": "APPROVE | REJECT | REVISION_REQUESTED", "comment": "string", "score": 3 }`
- **响应体**: 更新后的 SkillReview 对象
- **业务逻辑**:
  - `APPROVE` → `status=APPROVED`, `approvedAt=now()`；同步更新 `Skill.publishedVersionId`；更新 `SkillVersion.reviewStatus=APPROVED`
  - `REJECT` → `status=REJECTED`, `reviewedAt=now()`（**最终态**，不可回退）
  - `REVISION_REQUESTED` → `status=REVISION_REQUESTED`, `reviewedAt=now()`
- **错误码**: `403 Forbidden`（非当前 Assignee 或 ADMIN）
- **权限要求**: 该 SkillReview 的当前 Assignee 或 ADMIN

> **注意**: 决策选项为 `REVISION_REQUESTED`（非 `REVISE`），与 ReviewStatus 枚举值一致。

## 4. 业务规则（约束条件、边界情况、状态机）

### 4.1 状态机
```
                    ┌───────────────────────────────────────┐
                    │           PENDING_AUTO                │
                    │        (等待自动扫描)                  │
                    └───────────┬──────────┬────────────────┘
                   扫描通过      │          │   扫描不通过
                                ▼          ▼
                    ┌──────────────┐  ┌──────────────────┐
                    │PENDING_MANUAL│  │  AUTO_REJECTED   │
                    │(等待人工审核) │  │  (最终态 ✗)      │
                    └──────┬───────┘  └──────────────────┘
                  认领/分配 │
                           ▼
                    ┌──────────────┐
                    │  IN_REVIEW   │
                    │  (审核中)     │
                    └──┬─────┬──┬──┘
             APPROVE   │     │  │  REVISION_REQUESTED
                       ▼     │  ▼
              ┌────────────┐ │ ┌────────────────────┐
              │  APPROVED  │ │ │REVISION_REQUESTED  │
              │  (最终态 ✓) │ │ │  (要求修改)         │
              └────────────┘ │ └────────┬───────────┘
                      REJECT │          │ 作者发新版本
                             ▼          ▼
                    ┌──────────────┐  当前版本 → REJECTED
                    │  REJECTED    │
                    │  (最终态 ✗)   │
                    └──────────────┘
```

### 4.2 最终态说明
- `AUTO_REJECTED`: 最终态，自动扫描不通过。作者需修复问题后发布新版本
- `REJECTED`: 最终态，人工审核驳回。作者需修改后发布新版本
- `APPROVED`: 最终态，审核通过
- `REVISION_REQUESTED`: 非最终态。作者发布新版本后，当前版本自动流转为 `REJECTED`

### 4.3 自动扫描 Pipeline
包含四个阶段（详见 TECH-DESIGN.md §4.1）：
1. **文件验证**: 检查 ZIP 炸弹、异常后缀名、必需文件齐全（按 ReviewPolicy.requiredFiles 配置）
2. **安全扫描**: 敏感信息检测（API keys, passwords, tokens）、Shell 命令风险评估、外发数据行为审计
3. **合规检查**: 许可证兼容性、企业安全策略合规、内容合规
4. **质量评估**: 文档完整性评分、代码规范评分、综合质量分（0-100）

若 `blockOnSecurityFail=true` 且安全扫描失败 → 直接 `AUTO_REJECTED`
若 `blockOnLicenseFail=true` 且许可证不合规 → 直接 `AUTO_REJECTED`
否则转入 `PENDING_MANUAL`

### 4.4 ReviewPolicy 优先级匹配
当需要为某个 SkillReview 匹配策略时，按以下优先级查找：
1. **category + department 同时匹配** — 最高优先级
2. **category 匹配**（department 为 null）
3. **department 匹配**（category 为 null）
4. **全局策略**（category 和 department 均为 null）

命中第一个即停止，不叠加多个策略。

### 4.5 人工自动分配
- 定时任务频率: 每小时执行一次
- **分布式锁**: 使用 Redis SETNX 实现，防止多实例重复执行
  - Key: `lock:review-assignment`
  - TTL: 5 分钟
- 分配逻辑:
  1. 找到有权审核的用户（AD 组匹配 `policy.reviewerAdGroups`）
  2. 排除提交人（`reviewerId != submitterId`，职责分离）
  3. 同部门优先分配
  4. 按当前审核负载均衡（负载最低者优先）

### 4.6 超时告警
- 处于 `PENDING_MANUAL` 或 `IN_REVIEW` 超过 `maxReviewDays`（默认 3 天）的单子触发告警
- **通知渠道**: 飞书/企微 Webhook
- **通知模板可配置**: 通过 ReviewPolicy 或系统配置定义模板内容
- 定时检查: 每小时执行一次（与分配任务合并）

### 4.7 版本联动
- 只有 `ReviewStatus=APPROVED`，外部才能下载该 `SkillVersion`
- 一旦 APPROVED，同步更新 `Skill.publishedVersionId`
- `REVISION_REQUESTED` → 作者发新版本时，当前版本自动流转为 `REJECTED`

## 5. 前端组件（页面 + 组件 + 交互流程）
- **页面**: `Review Dashboard`（审核工作台）
- **组件**:
  - `ScanReportView`: 可视化展示 autoScanDetail 的 JSON 结果，红黄绿灯标示各项指标
  - `CodeDiffViewer`: （进阶）如果有上一版本，展示此次上传文件与上一版本的 Diff
  - `DecisionPanel`: 包含三个大按钮（Approve, Reject, Revision Requested），旁边带必填的 Comment 输入框（Reject / Revision Requested 时必须填）和可选的 Score（1-5）评分
  - `ReviewTimeline`: 展示时间线（submittedAt → autoScannedAt → assignedAt → reviewedAt → approvedAt）

## 6. 安全要求（认证、权限矩阵、数据脱敏、审计日志）

### 6.1 职责分离（强制）
- Skill 作者（`submitterId`）即便拥有 REVIEWER 角色，也**绝对不能**审核自己发布的版本
- 在 SQL 层和逻辑层做严格校验: `reviewerId != submitterId` 且 `reviewerId != skill.ownerId`
- 自动分配时同样排除提交人

### 6.2 审查日志
- 所有的决策结果、留言、时间戳不可篡改，且永久保存以备合规审计
- 写入 `AuditLog` 表，使用 `AuditAction.REVIEW_APPROVE` / `REVIEW_REJECT` / `REVIEW_REQUEST_REVISION`

### 6.3 通知安全
- Webhook URL 存储在服务端配置/环境变量中，不暴露给前端
- 通知模板通过后台管理配置，防止注入攻击

## 7. 验收标准
- [ ] 包含恶意后缀名的 ZIP 包上传后，SkillReview 会在 1 分钟内被 `AUTO_REJECTED`，并在前端提示扫描出的具体原因
- [ ] 合法的包上传后，系统能够将其路由到人工审核列表（`PENDING_MANUAL`）
- [ ] REVIEWER 可以成功对工单进行"批准"操作，操作后能在普通用户端看到该新版本的 Skill 可以被正常下载
- [ ] 尝试用自己的 REVIEWER 账号审核自己提交的 Skill 会收到 `403 Forbidden`
- [ ] `REVISION_REQUESTED` 后，作者发布新版本时，当前版本自动变为 `REJECTED`
- [ ] `AUTO_REJECTED` 和 `REJECTED` 为最终态，不可回退
- [ ] 超时告警通过飞书/企微 Webhook 发送通知
- [ ] 分布式锁确保多实例环境下定时任务不重复执行
- [ ] ReviewPolicy 按 `category+department > category > department > 全局` 优先级匹配

## 8. 变更记录
- 初始版本 draft。
- 增强 ReviewPolicy 模型，补充 department, requiredApprovers 等字段；统一 authorId 为 ownerId。
- **2026-03-19 approved**: 最终模型统一 — `Review` 全文替换为 `SkillReview`；模型对齐 TECH-DESIGN.md（补 `submitterId/submitter`、`skillId` 直接关联、时间线字段、`reviewScore Int?`）；ReviewPolicy 补全（`department`、`requiredApprovers`、`reviewerAdGroups[]`、`maxReviewDays`、`blockOnSecurityFail`、`blockOnLicenseFail`、`requiredFiles[]`）；完善状态机（REVISION_REQUESTED → 作者发新版本当前版本 REJECTED，AUTO_REJECTED/REJECTED 为最终态）；决策 API `REVISE` → `REVISION_REQUESTED`；定时任务用 Redis SETNX 分布式锁；ReviewPolicy 优先级 category+department > category > department > 全局；通知用飞书/企微 Webhook 模板可配置；职责分离加强。
