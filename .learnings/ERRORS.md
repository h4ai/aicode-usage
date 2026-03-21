# Errors Log

## [ERR-20260320-001] docker_pnpm_monorepo

**Logged**: 2026-03-20T21:47:00+08:00
**Priority**: high
**Status**: resolved
**Area**: infra

### Summary
Docker 构建 pnpm monorepo 后端镜像失败 — 8 轮迭代

### Error
```
- v1: npx nest build → @nestjs/cli 不在 root deps
- v2: npx tsc → typescript 不在 root deps
- v3: Prisma 7.x → npx prisma generate 拉到 7.5.0 breaking change
- v4: pnpm hoisting → 模块找不到
- v5: pnpm --filter build → tsconfig 路径错误
- v6: cp -rL node_modules → tslib transitive dep 缺失
```

### Context
- pnpm monorepo（packages/backend + packages/shared + packages/frontend + packages/cli）
- Prisma 7.x 不再支持 schema 内 url（breaking change）
- pnpm deploy --legacy 不保证 transitive deps

### Suggested Fix
最终方案：npm-only Dockerfile（sed 替换 workspace:* → file:../shared，npm install --legacy-peer-deps）

### Resolution
- **Resolved**: 2026-03-20T18:05:00+08:00
- **Commit**: 1c2fced
- **Notes**: npm-only 方案成功构建，584MB 镜像，6 容器全部 healthy

### Metadata
- Reproducible: yes
- Related Files: deploy/docker/Dockerfile
- See Also: LRN-20260320-001

---

## [ERR-20260320-002] feishu_doc_replace_range

**Logged**: 2026-03-20T21:47:00+08:00
**Priority**: high
**Status**: resolved
**Area**: docs

### Summary
feishu_update_doc replace_range 跨章节导致文档损坏

### Error
```
3/20 日报补充微信链接时 replace_range 跨越 ### 1. 到 ### 3. 边界
→ 第 2 节（Claude Dispatch）完全丢失
→ 第 1 节末尾出现乱码 ](url)](url)](url)
```

### Context
- 文档 ID: GrZBdol1ToYXjlxa5ngcLVlLnUg
- 操作：尝试在第 1 节末尾追加微信链接
- 定位表达式匹配了跨章节范围

### Suggested Fix
- 大范围重写（选中 ### 1. 到 ### 3. 一次性替换）
- 未来一次只操作一个章节

### Resolution
- **Resolved**: 2026-03-20T02:44:00+08:00
- **Notes**: 用 selection_with_ellipsis 选中大范围重写修复

### Metadata
- Reproducible: yes
- Related Files: 无
- See Also: LRN-20260320-002

---

