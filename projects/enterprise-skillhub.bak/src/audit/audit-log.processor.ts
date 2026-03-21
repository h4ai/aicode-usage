import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogEntry } from './audit.service';

@Processor('audit-log')
export class AuditLogProcessor extends WorkerHost {
  private readonly logger = new Logger(AuditLogProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<AuditLogEntry>): Promise<void> {
    const { action, resource, resourceId, actorId, ipAddress, userAgent, detail } = job.data;

    this.logger.debug(`Processing audit log: ${action} on ${resource || 'N/A'}`);

    try {
      await this.prisma.auditLog.create({
        data: {
          action,
          resource: resource
            ? resourceId
              ? `${resource}:${resourceId}`
              : resource
            : null,
          userId: actorId || null,
          ip: ipAddress || null,
          userAgent: userAgent || null,
          detail: detail ? (detail as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to write audit log: ${(error as Error).message}`);
      throw error; // BullMQ will handle retries
    }
  }
}
