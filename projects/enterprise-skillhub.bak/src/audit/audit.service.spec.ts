import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException } from '@nestjs/common';

// ============================================================
// TDD Test Suite: AuditService
// Written BEFORE implementation per Sprint 4 TDD mandate
// ============================================================

describe('AuditService', () => {
  let service: AuditService;
  let prisma: any;
  let auditQueue: any;

  beforeEach(async () => {
    prisma = {
      auditLog: {
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
    };

    auditQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken('audit-log'), useValue: auditQueue },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // LOG (async via BullMQ)
  // ==========================================================
  describe('log', () => {
    it('should enqueue audit log entry via BullMQ', async () => {
      await service.log({
        action: 'SKILL_CREATE',
        resource: 'skill',
        resourceId: 'skill-1',
        actorId: 'user-1',
        ipAddress: '127.0.0.1',
        detail: { name: 'Test Skill' },
      });

      expect(auditQueue.add).toHaveBeenCalledWith(
        'write-audit-log',
        expect.objectContaining({
          action: 'SKILL_CREATE',
          resource: 'skill',
          resourceId: 'skill-1',
          actorId: 'user-1',
          ipAddress: '127.0.0.1',
        }),
        expect.any(Object),
      );
    });

    it('should not throw if queue fails (fire and forget)', async () => {
      auditQueue.add.mockRejectedValue(new Error('Queue error'));

      await expect(
        service.log({
          action: 'SKILL_CREATE',
          actorId: 'user-1',
        }),
      ).resolves.not.toThrow();
    });
  });

  // ==========================================================
  // FIND ALL (paginated + filtered)
  // ==========================================================
  describe('findAll', () => {
    it('should return paginated audit logs', async () => {
      const mockLogs = [
        { id: 'log-1', action: 'SKILL_CREATE', createdAt: new Date() },
      ];
      prisma.auditLog.findMany.mockResolvedValue(mockLogs);
      prisma.auditLog.count.mockResolvedValue(1);

      const result = await service.findAll({
        page: 1,
        limit: 50,
        skip: 0,
      } as any);

      expect(result).toHaveProperty('data', mockLogs);
      expect(result).toHaveProperty('total', 1);
      expect(result).toHaveProperty('page', 1);
      expect(result).toHaveProperty('limit', 50);
      expect(result).toHaveProperty('totalPages', 1);
    });

    it('should filter by actorId', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.findAll({
        actorId: 'user-1',
        page: 1,
        limit: 50,
        skip: 0,
      } as any);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1' }),
        }),
      );
    });

    it('should filter by action', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.findAll({
        action: 'SKILL_CREATE',
        page: 1,
        limit: 50,
        skip: 0,
      } as any);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ action: { contains: 'SKILL_CREATE' } }),
        }),
      );
    });

    it('should filter by resource', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.findAll({
        resource: 'skill',
        page: 1,
        limit: 50,
        skip: 0,
      } as any);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ resource: { contains: 'skill' } }),
        }),
      );
    });

    it('should filter by date range', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      const startDate = '2026-01-01T00:00:00Z';
      const endDate = '2026-01-31T23:59:59Z';

      await service.findAll({
        startDate,
        endDate,
        page: 1,
        limit: 50,
        skip: 0,
      } as any);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          }),
        }),
      );
    });

    it('should reject date range exceeding 90 days', async () => {
      await expect(
        service.findAll({
          startDate: '2026-01-01T00:00:00Z',
          endDate: '2026-06-01T00:00:00Z', // > 90 days
          page: 1,
          limit: 50,
          skip: 0,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should apply default sort by createdAt desc', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 50, skip: 0 } as any);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should respect pagination limits (max 200)', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 200, skip: 0 } as any);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });
  });

  // ==========================================================
  // EXPORT CSV
  // ==========================================================
  describe('exportCsv', () => {
    it('should return CSV string with header and data', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          action: 'SKILL_CREATE',
          resource: 'skill',
          userId: 'user-1',
          ip: '127.0.0.1',
          userAgent: 'Chrome',
          detail: { name: 'Test' },
          createdAt: new Date('2026-01-15T10:00:00Z'),
          user: { displayName: 'Alice', username: 'alice' },
        },
      ];
      prisma.auditLog.findMany.mockResolvedValue(mockLogs);
      prisma.auditLog.count.mockResolvedValue(1);

      const csv = await service.exportCsv({} as any);

      expect(csv).toContain('id,action,resource,actor,ip,userAgent,detail,createdAt');
      expect(csv).toContain('log-1');
      expect(csv).toContain('SKILL_CREATE');
      expect(csv).toContain('alice');
    });

    it('should enforce max 10000 records for export', async () => {
      prisma.auditLog.count.mockResolvedValue(15000);
      prisma.auditLog.findMany.mockResolvedValue([]);

      await service.exportCsv({} as any);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10000 }),
      );
    });

    it('should handle empty result', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      const csv = await service.exportCsv({} as any);

      expect(csv).toContain('id,action,resource,actor,ip,userAgent,detail,createdAt');
    });
  });
});
