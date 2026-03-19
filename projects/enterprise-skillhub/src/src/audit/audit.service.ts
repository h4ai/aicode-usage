import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { QueryAuditLogsDto, ExportAuditLogsDto } from './dto/query-audit-logs.dto';
import { PaginatedResult } from '../common/dto/pagination.dto';

export interface AuditLogEntry {
  action: string;
  resource?: string;
  resourceId?: string;
  actorId?: string;
  ipAddress?: string;
  userAgent?: string;
  detail?: Record<string, any>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('audit-log') private readonly auditQueue: Queue,
  ) {}

  /**
   * Asynchronously log an audit entry via BullMQ (fire-and-forget).
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.auditQueue.add('write-audit-log', entry, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      });
    } catch (error) {
      // Audit logging should never break the request
      this.logger.warn(`Failed to enqueue audit log: ${error.message}`);
    }
  }

  /**
   * Query audit logs with filters and pagination.
   */
  async findAll(query: QueryAuditLogsDto): Promise<PaginatedResult<any>> {
    const where = this.buildWhereClause(query);

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
        include: {
          user: {
            select: { displayName: true, username: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  /**
   * Export audit logs as CSV string (max 10000 records).
   */
  async exportCsv(query: ExportAuditLogsDto): Promise<string> {
    const where = this.buildWhereClause(query);
    const MAX_EXPORT = 10000;

    const data = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: MAX_EXPORT,
      include: {
        user: {
          select: { displayName: true, username: true },
        },
      },
    });

    const header = 'id,action,resource,actor,ip,userAgent,detail,createdAt';
    const rows = data.map((log: any) => {
      const actor = log.user?.username || log.userId || '';
      const detail = log.detail ? JSON.stringify(log.detail).replace(/"/g, '""') : '';
      return [
        log.id,
        log.action,
        log.resource || '',
        actor,
        log.ip || '',
        log.userAgent || '',
        `"${detail}"`,
        log.createdAt.toISOString(),
      ].join(',');
    });

    return [header, ...rows].join('\n');
  }

  private buildWhereClause(query: any): Record<string, any> {
    const where: Record<string, any> = {};

    if (query.actorId) {
      where.userId = query.actorId;
    }

    if (query.action) {
      where.action = { contains: query.action };
    }

    if (query.resource) {
      where.resource = { contains: query.resource };
    }

    if (query.startDate || query.endDate) {
      if (query.startDate && query.endDate) {
        const start = new Date(query.startDate);
        const end = new Date(query.endDate);
        const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

        if (diffDays > 90) {
          throw new BadRequestException('Date range cannot exceed 90 days');
        }
      }

      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    return where;
  }
}
