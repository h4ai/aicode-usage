# 需求规格：人员基础参数表 & 分组人均统计

## 1. 需求背景

ClickHouse 事件数据中只有用户账号（userNickname），没有用户的组织架构信息（分组、岗位、角色等）。管理员后台的「分组汇总」页签目前无法展示人均统计指标。

需要在 PostgreSQL 中建立一张人员基础参数表，存储用户的组织信息，支持 CSV 批量导入，并基于此表在分组汇总页签中增加人均统计。

## 2. 功能范围

### 2.1 PG 基础参数表 `user_profiles`（后端，无前端界面）

**字段定义：**

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| domain_account | TEXT, PK | ✅ | 域账号，与 ClickHouse `userNickname` 一一对应 |
| real_name | TEXT | ✅ | 姓名 |
| department | TEXT | ✅ | 所属分组/部门 |
| position | TEXT | | 岗位 |
| role | TEXT | | 角色 |
| employee_type | TEXT | ✅ | 人员类型：正式 / 外包 |
| is_active | BOOLEAN | ✅ | 是否在职，默认 true |
| is_target | BOOLEAN | ✅ | 是否目标人员，默认 false |
| created_at | TIMESTAMPTZ | | 创建时间，自动生成 |
| updated_at | TIMESTAMPTZ | | 更新时间，自动更新 |

**映射关系：**
- `user_profiles.domain_account` = ClickHouse `events.userNickname`
- 一对一映射，无需额外映射表

### 2.2 CSV 批量导入 API

**接口：** `POST /api/admin/user-profiles/import`

**权限：** 仅管理员

**CSV 格式：**
```csv
域账号,姓名,所属分组,岗位,角色,人员类型,是否在职,是否目标人员
wangx100,王小明,研发一组,高级工程师,开发,正式,是,是
farben3,张三,研发二组,中级工程师,开发,外包,是,否
```

**导入规则：**
- 以 `域账号` 为主键，已存在则更新，不存在则新增（UPSERT）
- 支持中文列头（按列顺序匹配或列名匹配）
- 「是否在职」：是/否 → true/false
- 「是否目标人员」：是/否 → true/false
- 「人员类型」：正式/外包
- 返回导入结果：成功数、更新数、失败数及失败原因

**CSV 模板下载：** `GET /api/admin/user-profiles/template`

### 2.3 分组汇总页签 — 增加人均统计

在管理员后台的「分组汇总」页签中，基于 `user_profiles.department` 分组，增加以下人均指标列：

| 列名 | 计算逻辑 |
|------|---------|
| 分组人数 | 该分组的在职人员数（is_active=true） |
| 目标人数 | 该分组的目标人员数（is_target=true AND is_active=true） |
| 人均限额Token | 分组本月限额Token总和 / 分组人数 |
| 人均总Token | 分组当月总Token / 分组人数 |
| 人均对话 | 分组当月对话轮次 / 分组人数 |

**注意：**
- 分组来源为 `user_profiles.department`，不是 ClickHouse 的 enterprise 字段
- 未在 `user_profiles` 中的用户归入「未分组」
- 分组人数为 0 时，人均值显示为 `-`

## 3. 验收标准（AC）

### AC-1: 基础参数表
- [ ] PG 中存在 `user_profiles` 表，包含所有定义字段
- [ ] Alembic migration 脚本正确

### AC-2: CSV 导入
- [ ] 管理员可通过 API 上传 CSV 批量导入用户档案
- [ ] UPSERT 逻辑：已有域账号更新，新域账号插入
- [ ] 返回导入统计（成功/更新/失败）
- [ ] 可下载 CSV 模板

### AC-3: 分组人均统计
- [ ] 分组汇总页签显示分组人数、目标人数
- [ ] 人均限额Token、人均总Token、人均对话指标正确
- [ ] 未匹配的用户归入「未分组」

### AC-4: 数据一致性
- [ ] `domain_account` 与 ClickHouse `userNickname` 正确关联
- [ ] 离职人员（is_active=false）不计入人均分母

## 4. 非功能需求

- CSV 导入支持至少 1000 行
- 导入 API 响应时间 < 5s（1000行以内）
- 基础参数表不需要前端界面（仅 API + CSV 维护）

## 5. 不在本期范围

- LDAP/HR 系统自动同步
- 前端人员管理界面（CRUD）
- 多级部门层级（本期只支持一级分组）
