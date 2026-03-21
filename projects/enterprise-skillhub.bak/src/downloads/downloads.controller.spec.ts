import { Test, TestingModule } from '@nestjs/testing';
import { DownloadsController } from './downloads.controller';
import { DownloadsService } from './downloads.service';
import { PeriodEnum, ResourceTypeEnum } from './dto/query-downloads.dto';

describe('DownloadsController', () => {
  let controller: DownloadsController;
  let service: any;

  beforeEach(async () => {
    const mockService = {
      getTopSkills: jest.fn().mockResolvedValue([
        { id: 'skill-1', name: 'top-skill', weeklyDownloads: 50 },
      ]),
      getTopTemplates: jest.fn().mockResolvedValue([
        { id: 'tpl-1', name: 'top-template', weeklyDownloads: 30 },
      ]),
      getDownloadTrend: jest.fn().mockResolvedValue([
        { date: '2026-03-15', downloads: 10 },
      ]),
      getUserDownloads: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        limit: 50,
        offset: 0,
      }),
      getAdminDownloadLogs: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        limit: 50,
        offset: 0,
      }),
      getUsageReport: jest.fn().mockResolvedValue({
        totalDownloads: 100,
        last30DaysDownloads: 80,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DownloadsController],
      providers: [
        { provide: DownloadsService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<DownloadsController>(DownloadsController);
    service = module.get(DownloadsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==========================================================
  // GET /stats/top-skills
  // ==========================================================
  describe('getTopSkills', () => {
    it('should return top skills with default params', async () => {
      const result = await controller.getTopSkills({});

      expect(service.getTopSkills).toHaveBeenCalledWith(PeriodEnum.WEEK, 20);
      expect(result).toHaveLength(1);
    });

    it('should pass custom period and limit', async () => {
      await controller.getTopSkills({ period: PeriodEnum.MONTH, limit: 10 });

      expect(service.getTopSkills).toHaveBeenCalledWith(PeriodEnum.MONTH, 10);
    });
  });

  // ==========================================================
  // GET /stats/top-templates
  // ==========================================================
  describe('getTopTemplates', () => {
    it('should return top templates with default params', async () => {
      const result = await controller.getTopTemplates({});

      expect(service.getTopTemplates).toHaveBeenCalledWith(PeriodEnum.WEEK, 20);
      expect(result).toHaveLength(1);
    });
  });

  // ==========================================================
  // GET /stats/downloads
  // ==========================================================
  describe('getDownloadTrend', () => {
    it('should return download trend data', async () => {
      const result = await controller.getDownloadTrend({
        resourceType: ResourceTypeEnum.SKILL,
        resourceId: 'skill-1',
      });

      expect(service.getDownloadTrend).toHaveBeenCalledWith(
        ResourceTypeEnum.SKILL,
        'skill-1',
        PeriodEnum.MONTH,
      );
      expect(result).toHaveLength(1);
    });
  });

  // ==========================================================
  // GET /stats/user-downloads
  // ==========================================================
  describe('getUserDownloads', () => {
    it('should return user download history', async () => {
      const result = await controller.getUserDownloads({
        userId: 'user-1',
      });

      expect(service.getUserDownloads).toHaveBeenCalledWith('user-1', 50, 0);
      expect(result).toHaveProperty('total', 0);
    });
  });

  // ==========================================================
  // GET /admin/download-logs
  // ==========================================================
  describe('getAdminDownloadLogs', () => {
    it('should return admin download logs', async () => {
      const result = await controller.getAdminDownloadLogs({
        limit: 50,
        offset: 0,
      });

      expect(service.getAdminDownloadLogs).toHaveBeenCalled();
      expect(result).toHaveProperty('total', 0);
    });
  });

  // ==========================================================
  // GET /admin/usage-report
  // ==========================================================
  describe('getUsageReport', () => {
    it('should return usage report', async () => {
      const result = await controller.getUsageReport();

      expect(service.getUsageReport).toHaveBeenCalled();
      expect(result).toHaveProperty('totalDownloads', 100);
    });
  });
});
