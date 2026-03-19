# OWASP Top 10 (2021) — Enterprise SkillHub Security Checklist

> Last updated: 2026-03-19
> Reviewer: DevOps Sprint 5

---

## A01:2021 — Broken Access Control ✅

| Control | Implementation | Status |
|---------|---------------|--------|
| RBAC enforcement | `RolesGuard` — `ADMIN`, `REVIEWER`, `USER` roles | ✅ Done |
| Visibility guard | `DepartmentVisibilityGuard` — `PUBLIC`/`DEPARTMENT`/`PRIVATE` | ✅ Done |
| JWT auth on all endpoints | `JwtAuthGuard` global except `/auth/login` and `/health/*` | ✅ Done |
| Resource ownership checks | Service-level owner validation on update/delete | ✅ Done |
| Admin isolation | Admin endpoints require `ADMIN` role | ✅ Done |

**Residual Risk:** Low — Ensure frontend also enforces visibility (defense in depth).

---

## A02:2021 — Cryptographic Failures ⚠️

| Control | Implementation | Status |
|---------|---------------|--------|
| LDAPS (TLS) | LDAP connection via `ldaps://` when `LDAP_USE_TLS=true` | ✅ Done |
| JWT signing | HS256 with `JWT_SECRET` from env | ⚠️ Acceptable |
| Passwords | Not stored — LDAP handles all authentication | ✅ N/A |
| Secrets management | Kubernetes Sealed Secrets | ✅ Done |
| TLS termination | Ingress TLS with cert-manager | ✅ Done |

**Recommendation:** Consider upgrading to RS256 (asymmetric) for JWT signing. This allows public key verification without exposing the private key. Priority: Medium.

**Action Items:**
- [ ] Rotate JWT_SECRET on go-live
- [ ] Enable LDAPS in production AD configuration
- [ ] Verify TLS 1.2+ enforced on all connections

---

## A03:2021 — Injection ✅

| Control | Implementation | Status |
|---------|---------------|--------|
| SQL injection | Prisma ORM — all queries parameterized | ✅ Done |
| pgvector queries | `$queryRaw` with parameterized `$1` placeholders | ✅ Done |
| Input validation | `class-validator` + `ValidationPipe` with `whitelist: true` | ✅ Done |
| File name sanitization | ZIP extraction with path traversal prevention | ✅ Done |
| NoSQL injection | N/A — PostgreSQL only | ✅ N/A |

**Residual Risk:** Very Low.

---

## A04:2021 — Insecure Design ✅

| Control | Implementation | Status |
|---------|---------------|--------|
| Review workflow | Mandatory review before skill publication | ✅ Done |
| Separation of duties | Authors cannot review their own skills | ✅ Done |
| Automated scanning | Security, license, quality, integrity rules | ✅ Done |
| Auto-assignment | Round-robin reviewer assignment | ✅ Done |
| Audit trail | All state changes logged | ✅ Done |

**Residual Risk:** Low.

---

## A05:2021 — Security Misconfiguration ✅

| Control | Implementation | Status |
|---------|---------------|--------|
| Helmet middleware | CSP, HSTS, X-Frame-Options, X-Content-Type-Options | ✅ Done |
| CORS whitelist | Internal domains only via `CORS_ORIGINS` env | ✅ Done |
| K8s NetworkPolicy | Default deny + explicit allow rules | ✅ Done |
| Non-root container | Dockerfile uses `node` user (uid 1000) | ✅ Done |
| Debug endpoints | Disabled in production | ✅ Done |
| Error messages | Generic errors via `HttpExceptionFilter` | ✅ Done |

**Action Items:**
- [ ] Verify Helmet headers with `curl -I` after deployment
- [ ] Run `kube-bench` for CIS benchmark compliance

---

## A06:2021 — Vulnerable and Outdated Components ⚠️

| Control | Implementation | Status |
|---------|---------------|--------|
| npm audit | CI pipeline runs `npm audit` on every build | ✅ Done |
| Snyk scanning | Recommended: integrate Snyk into CI | ⚠️ TODO |
| Base image updates | `node:20-alpine` — rebuild monthly | ✅ Done |
| Dependency pinning | `package-lock.json` committed | ✅ Done |
| License compliance | Scanner checks skill packages for licenses | ✅ Done |

**Action Items:**
- [ ] Integrate Snyk or `npm audit --audit-level=high` in CI gate
- [ ] Set up Dependabot or Renovate for automated dependency updates
- [ ] Schedule monthly base image rebuilds

---

## A07:2021 — Identification and Authentication Failures ✅

| Control | Implementation | Status |
|---------|---------------|--------|
| LDAP authentication | Enterprise AD integration | ✅ Done |
| Rate limiting | Login: 10 req/min per IP | ✅ Done |
| JWT expiration | Configurable, default 12h | ✅ Done |
| No password storage | All auth delegated to LDAP | ✅ Done |
| Session invalidation | JWT stateless — revocation via short TTL | ✅ Done |

**Recommendation:** Consider adding a JWT blacklist (Redis-backed) for immediate revocation.

---

## A08:2021 — Software and Data Integrity Failures ✅

| Control | Implementation | Status |
|---------|---------------|--------|
| ZIP bomb protection | File size + ratio limit in `zip-validator.ts` | ✅ Done |
| Magic bytes validation | File type verified by magic bytes, not extension | ✅ Done |
| Upload scanning | Automated security scan on every upload | ✅ Done |
| Signed artifacts | Recommended: sign published skills | ⚠️ Future |
| CI pipeline integrity | GitHub Actions with pinned action versions | ✅ Done |

**Residual Risk:** Low.

---

## A09:2021 — Security Logging and Monitoring ✅

| Control | Implementation | Status |
|---------|---------------|--------|
| Audit logging | `AuditLogInterceptor` + BullMQ async processing | ✅ Done |
| Structured logging | NestJS Logger with context | ✅ Done |
| Prometheus metrics | `prom-client` integration | ✅ Done |
| Alert rules | API errors, latency, pod restarts, queue depth | ✅ Done |
| Grafana dashboards | Overview + API performance dashboards | ✅ Done |

**Action Items:**
- [ ] Configure alert notification channel (Feishu/WeCom webhook)
- [ ] Set up log aggregation (ELK/Loki) for centralized search
- [ ] Enable `audit.log` rotation policy

---

## A10:2021 — Server-Side Request Forgery (SSRF) ✅

| Control | Implementation | Status |
|---------|---------------|--------|
| Upstream sync URL whitelist | `UPSTREAM_ALLOWED_URLS` environment variable | ✅ Done |
| Private IP blocking | Sync service rejects `127.0.0.1`, `10.*`, `172.16-31.*`, `192.168.*` | ✅ Done |
| DNS rebinding protection | URL resolved and validated before request | ✅ Done |
| File download validation | Only HTTPS URLs allowed for upstream sync | ✅ Done |

**Residual Risk:** Low.

---

## Summary

| Category | Status | Risk |
|----------|--------|------|
| A01 Access Control | ✅ | Low |
| A02 Cryptographic Failures | ⚠️ | Medium (HS256→RS256 recommended) |
| A03 Injection | ✅ | Very Low |
| A04 Insecure Design | ✅ | Low |
| A05 Security Misconfiguration | ✅ | Low |
| A06 Outdated Components | ⚠️ | Medium (Snyk TODO) |
| A07 Auth Failures | ✅ | Low |
| A08 Data Integrity | ✅ | Low |
| A09 Logging/Monitoring | ✅ | Low |
| A10 SSRF | ✅ | Low |

**Overall Assessment:** Production-ready with two medium-priority improvements tracked.
