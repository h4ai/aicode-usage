import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const CACHE_TTL = 900; // 15 minutes in seconds

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject('CACHE_MANAGER') private readonly cacheManager: any,
  ) {}

  // ==========================================================
  // OVERVIEW
  // ==========================================================

  async getOverview(): Promise<any> {
    const cached = await this.cacheManager.get('stats:overview');
    if (cached) return cached;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totalSkills, totalUsers, monthlyActiveUsers, pendingReviews] =
      await Promise.all([
        this.prisma.skill.count(),
        this.prisma.user.count(),
        this.prisma.user.count({
          where: { updatedAt: { gte: thirtyDaysAgo } },
        }),
        this.prisma.skillReview.count({
          where: { status: { in: ['PENDING_AUTO', 'PENDING_MANUAL', 'IN_REVIEW'] } },
        }),
      ]);

    const result = { totalSkills, totalUsers, monthlyActiveUsers, pendingReviews };
    await this.cacheManager.set('stats:overview', result, CACHE_TTL);
    return result;
  }

  // ==========================================================
  // TOP SKILLS
  // ==========================================================

  async getTopSkills(): Promise<any[]> {
    const cached = await this.cacheManager.get('stats:top-skills');
    if (cached) return cached;

    const result = await this.prisma.$queryRaw`
      SELECT id, name, slug, "installCount", "downloadCount", "starCount", category
      FROM "Skill"
      WHERE "moderationStatus" = 'ACTIVE'
      ORDER BY "installCount" DESC
      LIMIT 10
    `;

    await this.cacheManager.set('stats:top-skills', result, CACHE_TTL);
    return result as any[];
  }

  // ==========================================================
  // DEPARTMENT USAGE
  // ==========================================================

  async getDepartmentUsage(): Promise<any[]> {
    const cached = await this.cacheManager.get('stats:department-usage');
    if (cached) return cached;

    const result = await this.prisma.$queryRaw`
      SELECT
        u.department,
        SUM(s."installCount") AS "totalInstalls",
        COUNT(DISTINCT u.id) AS "userCount"
      FROM "User" u
      LEFT JOIN "Skill" s ON s."ownerId" = u.id
      WHERE u.department IS NOT NULL
      GROUP BY u.department
      ORDER BY "totalInstalls" DESC
    `;

    await this.cacheManager.set('stats:department-usage', result, CACHE_TTL);
    return result as any[];
  }

  // ==========================================================
  // REVIEW EFFICIENCY
  // ==========================================================

  async getReviewEfficiency(): Promise<any> {
    const cached = await this.cacheManager.get('stats:review-efficiency');
    if (cached) return cached;

    const rows = await this.prisma.$queryRaw`
      SELECT
        AVG(EXTRACT(EPOCH FROM ("reviewedAt" - "assignedAt")) / 3600)
          FILTER (WHERE "reviewedAt" IS NOT NULL AND "assignedAt" IS NOT NULL) AS "avgReviewHours",
        COUNT(*) FILTER (WHERE decision = 'APPROVE')::float
          / NULLIF(COUNT(*) FILTER (WHERE decision IS NOT NULL), 0) AS "approvalRate",
        COUNT(*) FILTER (WHERE status = 'PENDING_MANUAL'
          AND "submittedAt" < NOW() - INTERVAL '72 hours')::float
          / NULLIF(COUNT(*), 0) AS "timeoutRate",
        COUNT(*) FILTER (WHERE decision IS NOT NULL) AS "totalReviewed"
      FROM "SkillReview"
    `;

    const result = (rows as any[])[0] || {
      avgReviewHours: null,
      approvalRate: null,
      timeoutRate: null,
      totalReviewed: 0,
    };

    await this.cacheManager.set('stats:review-efficiency', result, CACHE_TTL);
    return result;
  }

  // ==========================================================
  // TRENDS (last 30 days)
  // ==========================================================

  async getTrends(): Promise<any[]> {
    const cached = await this.cacheManager.get('stats:trends');
    if (cached) return cached;

    const result = await this.prisma.$queryRaw`
      WITH dates AS (
        SELECT generate_series(
          CURRENT_DATE - INTERVAL '29 days',
          CURRENT_DATE,
          '1 day'::interval
        )::date AS date
      )
      SELECT
        d.date::text AS date,
        COALESCE(s.cnt, 0) AS "newSkills",
        COALESCE(i.cnt, 0) AS "newInstalls",
        COALESCE(r.cnt, 0) AS "newReviews"
      FROM dates d
      LEFT JOIN (
        SELECT "createdAt"::date AS day, COUNT(*) AS cnt
        FROM "Skill"
        WHERE "createdAt" >= CURRENT_DATE - INTERVAL '29 days'
        GROUP BY day
      ) s ON d.date = s.day
      LEFT JOIN (
        SELECT "createdAt"::date AS day, COUNT(*) AS cnt
        FROM "AuditLog"
        WHERE action LIKE '%install%'
          AND "createdAt" >= CURRENT_DATE - INTERVAL '29 days'
        GROUP BY day
      ) i ON d.date = i.day
      LEFT JOIN (
        SELECT "createdAt"::date AS day, COUNT(*) AS cnt
        FROM "SkillReview"
        WHERE "createdAt" >= CURRENT_DATE - INTERVAL '29 days'
        GROUP BY day
      ) r ON d.date = r.day
      ORDER BY d.date ASC
    `;

    await this.cacheManager.set('stats:trends', result, CACHE_TTL);
    return result as any[];
  }
}
