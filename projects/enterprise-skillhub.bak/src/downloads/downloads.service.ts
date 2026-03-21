import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  RecordDownloadDto,
  ResourceTypeEnum,
  PeriodEnum,
  QueryAdminDownloadLogsDto,
} from './dto/query-downloads.dto';

/**
 * Minimal interface for Redis client used by this service.
 */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

@Injectable()
export class DownloadsService {
  private readonly logger = new Logger(DownloadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: RedisClient,
  ) {}

  /**
   * Record a download with Redis dedup (same user+resource+version within 1h).
   * Returns true if recorded, false if deduplicated.
   */
  async recordDownload(dto: RecordDownloadDto): Promise<boolean> {
    const dedupeKey = `download:${dto.userId}:${dto.resourceId}:${dto.version}`;

    // Check Redis dedup
    const exists = await this.redis.get(dedupeKey);
    if (exists) {
      this.logger.debug(`Download deduplicated: ${dedupeKey}`);
      return false;
    }

    // Set dedup key with 1h TTL
    await this.redis.set(dedupeKey, '1', 3600);

    // Create download log
    await this.prisma.downloadLog.create({
      data: {
        userId: dto.userId,
        resourceType: dto.resourceType as any,
        resourceId: dto.resourceId,
        resourceName: dto.resourceName,
        version: dto.version,
        source: (dto.source || 'CLI') as any,
        ip: dto.ip,
        userAgent: dto.userAgent,
      },
    });

    // Increment downloadCount on the resource
    if (dto.resourceType === ResourceTypeEnum.SKILL) {
      await this.prisma.skill.update({
        where: { id: dto.resourceId },
        data: { downloadCount: { increment: 1 } },
      });
    } else if (dto.resourceType === ResourceTypeEnum.TEMPLATE) {
      await this.prisma.template.update({
        where: { id: dto.resourceId },
        data: { downloadCount: { increment: 1 } },
      });
    }

    return true;
  }

  /**
   * Get top skills by download count.
   */
  async getTopSkills(period: PeriodEnum = PeriodEnum.WEEK, limit: number = 20) {
    if (period === PeriodEnum.WEEK) {
      return this.prisma.skill.findMany({
        where: { moderationStatus: 'ACTIVE' },
        orderBy: { weeklyDownloads: 'desc' },
        take: limit,
        select: {
          id: true,
          name: true,
          slug: true,
          category: true,
          downloadCount: true,
          weeklyDownloads: true,
          starCount: true,
        },
      });
    }

    // For other periods, query DownloadLog aggregation
    const since = this.getPeriodStart(period);
    const results = await this.prisma.downloadLog.groupBy({
      by: ['resourceId'],
      where: {
        resourceType: 'SKILL',
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit,
    });

    // Fetch skill details
    const skillIds = results.map((r) => r.resourceId);
    const skills = await this.prisma.skill.findMany({
      where: { id: { in: skillIds } },
      select: {
        id: true,
        name: true,
        slug: true,
        category: true,
        downloadCount: true,
        weeklyDownloads: true,
        starCount: true,
      },
    });

    const skillMap = new Map(skills.map((s) => [s.id, s]));
    return results.map((r) => ({
      ...skillMap.get(r.resourceId),
      periodDownloads: r._count.id,
    }));
  }

  /**
   * Get top templates by download count.
   */
  async getTopTemplates(period: PeriodEnum = PeriodEnum.WEEK, limit: number = 20) {
    if (period === PeriodEnum.WEEK) {
      return this.prisma.template.findMany({
        where: { isPublic: true },
        orderBy: { weeklyDownloads: 'desc' },
        take: limit,
        select: {
          id: true,
          name: true,
          description: true,
          downloadCount: true,
          weeklyDownloads: true,
          tags: true,
        },
      });
    }

    const since = this.getPeriodStart(period);
    const results = await this.prisma.downloadLog.groupBy({
      by: ['resourceId'],
      where: {
        resourceType: 'TEMPLATE',
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit,
    });

    const templateIds = results.map((r) => r.resourceId);
    const templates = await this.prisma.template.findMany({
      where: { id: { in: templateIds } },
      select: {
        id: true,
        name: true,
        description: true,
        downloadCount: true,
        weeklyDownloads: true,
        tags: true,
      },
    });

    const templateMap = new Map(templates.map((t) => [t.id, t]));
    return results.map((r) => ({
      ...templateMap.get(r.resourceId),
      periodDownloads: r._count.id,
    }));
  }

  /**
   * Get download trend data for a specific resource.
   */
  async getDownloadTrend(
    resourceType: ResourceTypeEnum,
    resourceId: string,
    period: PeriodEnum = PeriodEnum.MONTH,
  ) {
    const since = this.getPeriodStart(period) || new Date(0);

    const logs = await this.prisma.downloadLog.findMany({
      where: {
        resourceType: resourceType as any,
        resourceId,
        createdAt: { gte: since },
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const grouped = new Map<string, number>();
    for (const log of logs) {
      const dateKey = log.createdAt.toISOString().split('T')[0];
      grouped.set(dateKey, (grouped.get(dateKey) || 0) + 1);
    }

    return Array.from(grouped.entries()).map(([date, count]) => ({
      date,
      downloads: count,
    }));
  }

  /**
   * Get a user's download history.
   */
  async getUserDownloads(userId: string, limit: number = 50, offset: number = 0) {
    const [items, total] = await Promise.all([
      this.prisma.downloadLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          resourceType: true,
          resourceId: true,
          resourceName: true,
          version: true,
          source: true,
          createdAt: true,
        },
      }),
      this.prisma.downloadLog.count({ where: { userId } }),
    ]);

    return { items, total, limit, offset };
  }

  /**
   * Admin: get download logs with filtering and pagination.
   */
  async getAdminDownloadLogs(query: QueryAdminDownloadLogsDto) {
    const where: any = {};

    if (query.resourceType) where.resourceType = query.resourceType;
    if (query.resourceId) where.resourceId = query.resourceId;
    if (query.userId) where.userId = query.userId;
    if (query.source) where.source = query.source;
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const [items, total] = await Promise.all([
      this.prisma.downloadLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit || 50,
        skip: query.offset || 0,
        include: {
          user: {
            select: { id: true, username: true, displayName: true, department: true },
          },
        },
      }),
      this.prisma.downloadLog.count({ where }),
    ]);

    return { items, total, limit: query.limit || 50, offset: query.offset || 0 };
  }

  /**
   * Admin: get usage report summary.
   */
  async getUsageReport() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalDownloads,
      last30DaysDownloads,
      last7DaysDownloads,
      uniqueUsers30d,
      topSkills,
      topTemplates,
      sourceBreakdown,
    ] = await Promise.all([
      this.prisma.downloadLog.count(),
      this.prisma.downloadLog.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.downloadLog.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.downloadLog
        .groupBy({
          by: ['userId'],
          where: { createdAt: { gte: thirtyDaysAgo } },
        })
        .then((r) => r.length),
      this.prisma.downloadLog.groupBy({
        by: ['resourceId', 'resourceName'],
        where: { resourceType: 'SKILL', createdAt: { gte: thirtyDaysAgo } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      this.prisma.downloadLog.groupBy({
        by: ['resourceId', 'resourceName'],
        where: { resourceType: 'TEMPLATE', createdAt: { gte: thirtyDaysAgo } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      this.prisma.downloadLog.groupBy({
        by: ['source'],
        where: { createdAt: { gte: thirtyDaysAgo } },
        _count: { id: true },
      }),
    ]);

    return {
      totalDownloads,
      last30DaysDownloads,
      last7DaysDownloads,
      uniqueUsers30d,
      topSkills: topSkills.map((s) => ({
        resourceId: s.resourceId,
        resourceName: s.resourceName,
        downloads: s._count.id,
      })),
      topTemplates: topTemplates.map((t) => ({
        resourceId: t.resourceId,
        resourceName: t.resourceName,
        downloads: t._count.id,
      })),
      sourceBreakdown: sourceBreakdown.map((s) => ({
        source: s.source,
        count: s._count.id,
      })),
    };
  }

  private getPeriodStart(period: PeriodEnum): Date | null {
    const now = new Date();
    switch (period) {
      case PeriodEnum.DAY:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case PeriodEnum.WEEK:
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case PeriodEnum.MONTH:
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case PeriodEnum.ALL:
        return null;
      default:
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
  }
}
