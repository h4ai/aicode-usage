import { Test, TestingModule } from '@nestjs/testing';
import { WeeklyRefreshService } from './weekly-refresh.service';
import { PrismaService } from '../prisma/prisma.service';

describe('WeeklyRefreshService', () => {
  let service: WeeklyRefreshService;
  let prisma: any;

  beforeEach(async () => {
    const mockPrisma = {
      downloadLog: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
      skill: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      template: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeeklyRefreshService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<WeeklyRefreshService>(WeeklyRefreshService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('refreshWeeklyDownloads', () => {
    it('should reset all counts to 0 when no recent downloads', async () => {
      const result = await service.refreshWeeklyDownloads();

      expect(prisma.skill.updateMany).toHaveBeenCalledWith({
        data: { weeklyDownloads: 0 },
      });
      expect(prisma.template.updateMany).toHaveBeenCalledWith({
        data: { weeklyDownloads: 0 },
      });
      expect(result).toEqual({ skillsUpdated: 0, templatesUpdated: 0 });
    });

    it('should update skill weekly downloads from download logs', async () => {
      prisma.downloadLog.groupBy
        .mockResolvedValueOnce([
          { resourceId: 'skill-1', _count: { id: 15 } },
          { resourceId: 'skill-2', _count: { id: 8 } },
        ])
        .mockResolvedValueOnce([
          { resourceId: 'tpl-1', _count: { id: 5 } },
        ]);

      const result = await service.refreshWeeklyDownloads();

      expect(result.skillsUpdated).toBe(2);
      expect(result.templatesUpdated).toBe(1);

      // Check skill update calls (reset + 2 individual updates)
      expect(prisma.skill.updateMany).toHaveBeenCalledTimes(3);
      expect(prisma.skill.updateMany).toHaveBeenCalledWith({
        where: { id: 'skill-1' },
        data: { weeklyDownloads: 15 },
      });
      expect(prisma.skill.updateMany).toHaveBeenCalledWith({
        where: { id: 'skill-2' },
        data: { weeklyDownloads: 8 },
      });

      // Check template update calls (reset + 1 individual update)
      expect(prisma.template.updateMany).toHaveBeenCalledTimes(2);
      expect(prisma.template.updateMany).toHaveBeenCalledWith({
        where: { id: 'tpl-1' },
        data: { weeklyDownloads: 5 },
      });
    });

    it('should query download logs from last 7 days', async () => {
      await service.refreshWeeklyDownloads();

      expect(prisma.downloadLog.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['resourceId'],
          where: expect.objectContaining({
            resourceType: 'SKILL',
            createdAt: { gte: expect.any(Date) },
          }),
        }),
      );

      // Verify the date is approximately 7 days ago
      const call = prisma.downloadLog.groupBy.mock.calls[0][0];
      const sinceDate = call.where.createdAt.gte;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      expect(Date.now() - sinceDate.getTime()).toBeCloseTo(sevenDaysMs, -4);
    });
  });
});
