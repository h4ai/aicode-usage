# Security Hardening Configuration
# Enterprise SkillHub — Deploy Security Reference

## Overview

This directory contains security-related configuration and checklists for the Enterprise SkillHub deployment.

### Files

| File | Description |
|------|-------------|
| `OWASP-CHECKLIST.md` | OWASP Top 10 (2021) compliance checklist |
| `../k8s/network-policy.yaml` | Kubernetes NetworkPolicy definitions |

### Application-Level Security (in `src/`)

| Component | File | Description |
|-----------|------|-------------|
| Helmet | `src/main.ts` | CSP, HSTS, X-Frame-Options, etc. |
| CORS | `src/main.ts` | Whitelist-based CORS |
| Rate Limiting | `src/common/guards/throttle.guard.ts` | Per-endpoint rate limits |
| RBAC | `src/auth/guards/roles.guard.ts` | Role-based access control |
| Visibility | `src/auth/guards/department-visibility.guard.ts` | Department-level isolation |
| Input Validation | `src/main.ts` (ValidationPipe) | Whitelist + transform |
| ZIP Protection | `src/storage/zip-validator.ts` | Bomb/traversal prevention |

### Rate Limits

| Endpoint | Limit | Scope |
|----------|-------|-------|
| Global (all) | 100 req/min | Per user |
| `POST /auth/login` | 10 req/min | Per IP |
| `GET /search` | 30 req/min | Per user |
| `POST /skills/*/versions` | 5 req/min | Per user |

### Secrets Management

Production secrets are managed via Kubernetes Sealed Secrets:
- `LDAP_BIND_PASSWORD`
- `JWT_SECRET`
- `DATABASE_URL` (contains PG password)
- `MINIO_SECRET_KEY`
- `MINIO_ACCESS_KEY`

**Never commit raw secret values.** Use `kubeseal` to encrypt secrets before committing.
