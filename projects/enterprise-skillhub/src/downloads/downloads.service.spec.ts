import { Test, TestingModule } from '@nestjs/testing';
import { DownloadsService, RedisClient } from './downloads.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceTypeEnum, PeriodEnum, DownloadSourceEnum } from './dto/query-downloads.dto';

describe('DownloadsService', () => {
  let service: DownloadsService;
  let prisma: any;
  let redis: any;

  const mockDownloadLog = {
    id: 'dl-1',
    userId: 'user-1',
    resourceType: 'SKILL',
    resourceId: 'skill-1',
    resourceName: 'my-skill',
    version: '1.0.0',
    source: 'CLI',
    ip: '127.0.0.1',
    userAgent: 'test-agent',
    createdAt: new Date('2026-03-15'),
  };

  beforeEach(async () => {
    const mockPrisma = {
      downloadLog: {
        create: jest.fn().mockResolvedValue(mockDownloadLog),
        findMany: jest.fn().mockResolvedValue([mockDownloadLog]),
        count: jest.fn().mockResolvedValue(1),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      skill: {
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      template: {
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const mockRedis: RedisClient = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DownloadsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<DownloadsService>(DownloadsService);
    prisma = module.get(PrismaService);
    redis = module.get('REDIS_CLIENT');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // recordDownload
  // ==========================================================
  describe('recordDownload', () => {
    const dto = {
      userId: 'user-1',
      resourceType: ResourceTypeEnum.SKILL,
      resourceId: 'skill-1',
      resourceName: 'my-skill',
      version: '1.0.0',
      source: DownloadSourceEnum.CLI,
      ip: '127.0.0.1',
      userAgent: 'test-agent',
    };

    it('should record download and increment count', async () => {
      const result = await service.recordDownload(dto);

      expect(result).toBe(true);
      expect(redis.set).toHaveBeenCalledWith(
        'download:user-1:skill-1:1.0.0',
        '1',
        3600,
      );
      expect(prisma.downloadLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          resourceType: 'SKILL',
          resourceId: 'skill-1',
        }),
      });
      expect(prisma.skill.update).toHaveBeenCalledWith({
        where: { id: 'skill-1' },
        data: { downloadCount: { increment: 1 } },
      });
    });

    it('should return false if deduplicated by Redis', async () => {
      (redis.get as jest.Mock).mockResolvedValue('1');

      const result = await service.recordDownload(dto);

      expect(result).toBe(false);
      expect(prisma.downloadLog.create).not.toHaveBeenCalled();
    });

    it('should increment template downloadCount for TEMPLATE type', async () => {
      const templateDto = {
        ...dto,
        resourceType: ResourceTypeEnum.TEMPLATE,
        resourceId: 'tpl-1',
      };

      await service.recordDownload(templateDto);

      expect(prisma.template.update).toHaveBeenCalledWith({
        where: { id: 'tpl-1' },
        data: { downloadCount: { increment: 1 } },
      });
    });
  });

  // ==========================================================
  // getTopSkills
  // ==========================================================
  describe('getTopSkills', () => {
    it('should query by weeklyDownloads for WEEK period', async () => {
      prisma.skill.findMany.mockResolvedValue([
        {
          id: 'skill-1',
          name: 'top-skill',
          slug: 'top-skill',
          category: 'GENERAL',
          downloadCount: 100,
          weeklyDownloads: 50,
          starCount: 10,
        },
      ]);

      const result = await service.getTopSkills(PeriodEnum.WEEK, 10);

      expect(prisma.skill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { moderationStatus: 'ACTIVE' },
          orderBy: { weeklyDownloads: 'desc' },
          take: 10,
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('should use DownloadLog aggregation for other periods', async () => {
      prisma.downloadLog.groupBy.mockResolvedValue([
        { resourceId: 'skill-1', _count: { id: 42 } },
      ]);
      prisma.skill.findMany.mockResolvedValue([
        { id: 'skill-1', name: 'top-skill' },
      ]);

      const result = await service.getTopSkills(PeriodEnum.MONTH, 10);

      expect(prisma.downloadLog.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['resourceId'],
          where: expect.objectContaining({ resourceType: 'SKILL' }),
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('periodDownloads', 42);
    });
  });

  // ==========================================================
  // getTopTemplates
  // ==========================================================
  describe('getTopTemplates', () => {
    it('should query by weeklyDownloads for WEEK period', async () => {
      prisma.template.findMany.mockResolvedValue([
        { id: 'tpl-1', name: 'popular-template', weeklyDownloads: 30 },
      ]);

      const result = await service.getTopTemplates(PeriodEnum.WEEK, 5);

      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isPublic: true },
          orderBy: { weeklyDownloads: 'desc' },
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('should aggregate for MONTH period', async () => {
      prisma.downloadLog.groupBy.mockResolvedValue([
        { resourceId: 'tpl-1', _count: { id: 15 } },
      ]);
      prisma.template.findMany.mockResolvedValue([
        { id: 'tpl-1', name: 'popular-template' },
      ]);

      const result = await service.getTopTemplates(PeriodEnum.MONTH, 5);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('periodDownloads', 15);
    });
  });

  // ==========================================================
  // getDownloadTrend
  // ==========================================================
  describe('getDownloadTrend', () => {
    it('should return grouped-by-date download data', async () => {
      prisma.downloadLog.findMany.mockResolvedValue([
        { createdAt: new Date('2026-03-15T10:00:00Z') },
        { createdAt: new Date('2026-03-15T14:00:00Z') },
        { createdAt: new Date('2026-03-16T09:00:00Z') },
      ]);

      const result = await service.getDownloadTrend(
        ResourceTypeEnum.SKILL,
        'skill-1',
        PeriodEnum.MONTH,
      );

      expect(result).toEqual([
        { date: '2026-03-15', downloads: 2 },
        { date: '2026-03-16', downloads: 1 },
      ]);
    });
  });

  // ==========================================================
  // getUserDownloads
  // ==========================================================
  describe('getUserDownloads', () => {
    it('should return paginated user download history', async () => {
      prisma.downloadLog.findMany.mockResolvedValue([mockDownloadLog]);
      prisma.downloadLog.count.mockResolvedValue(1);

      const result = await service.getUserDownloads('user-1', 50, 0);

      expect(result).toEqual({
        items: [mockDownloadLog],
        total: 1,
        limit: 50,
        offset: 0,
      });
    });
  });

  // ==========================================================
  // getAdminDownloadLogs
  // ==========================================================
  describe('getAdminDownloadLogs', () => {
    it('should return filtered download logs', async () => {
      prisma.downloadLog.findMany.mockResolvedValue([{ ...mockDownloadLog, user: { displayName: 'Test' } }]);
      prisma.downloadLog.count.mockResolvedValue(1);

      const result = await service.getAdminDownloadLogs({
        resourceType: ResourceTypeEnum.SKILL,
        limit: 50,
        offset: 0,
      });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(prisma.downloadLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { resourceType: 'SKILL' },
        }),
      );
    });

    it('should filter by date range', async () => {
      prisma.downloadLog.findMany.mockResolvedValue([]);
      prisma.downloadLog.count.mockResolvedValue(0);

      await service.getAdminDownloadLogs({
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        limit: 50,
        offset: 0,
      });

      expect(prisma.downloadLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: expect.any(Date),
              lte: expect.any(Date),
            },
          }),
        }),
      );
    });
  });

  // ==========================================================
  // getUsageReport
  // ==========================================================
  describe('getUsageReport', () => {
    it('should return usage report summary', async () => {
      prisma.downloadLog.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(80) // 30d
        .mockResolvedValueOnce(30); // 7d
      prisma.downloadLog.groupBy
        .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }]) // unique users
        .mockResolvedValueOnce([{ resourceId: 's1', resourceName: 'skill-1', _count: { id: 50 } }]) // top skills
        .mockResolvedValueOnce([{ resourceId: 't1', resourceName: 'tpl-1', _count: { id: 20 } }]) // top templates
        .mockResolvedValueOnce([{ source: 'CLI', _count: { id: 60 } }]); // source breakdown

      const result = await service.getUsageReport();

      expect(result.totalDownloads).toBe(100);
      expect(result.last30DaysDownloads).toBe(80);
      expect(result.last7DaysDownloads).toBe(30);
      expect(result.uniqueUsers30d).toBe(2);
      expect(result.topSkills).toHaveLength(1);
      expect(result.topTemplates).toHaveLength(1);
      expect(result.sourceBreakdown).toHaveLength(1);
    });
  });
});
