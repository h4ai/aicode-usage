import { Test, TestingModule } from '@nestjs/testing';
import { AdminDashboardController } from './admin-dashboard.controller';
import { PrismaService } from '../prisma/prisma.service';
import { DownloadsService } from '../downloads/downloads.service';
import { CsvExportService } from './csv-export.service';

describe('AdminDashboardController', () => {
  let controller: AdminDashboardController;
  let prisma: any;
  let downloadsService: any;
  let csvExportService: any;

  beforeEach(async () => {
    const mockPrisma = {
      skill: { count: jest.fn().mockResolvedValue(50) },
      template: { count: jest.fn().mockResolvedValue(20) },
      user: { count: jest.fn().mockResolvedValue(100) },
      downloadLog: {
        count: jest.fn().mockResolvedValue(500),
        groupBy: jest.fn().mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'dl-1',
            resourceType: 'SKILL',
            resourceName: 'my-skill',
            version: '1.0.0',
            source: 'CLI',
            createdAt: new Date(),
            user: { displayName: 'Test User' },
          },
        ]),
      },
      skillReview: { count: jest.fn().mockResolvedValue(5) },
    };

    const mockDownloads = {
      getAdminDownloadLogs: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'dl-1',
            userId: 'user-1',
            resourceType: 'SKILL',
            resourceName: 'my-skill',
            version: '1.0.0',
            source: 'CLI',
            ip: '127.0.0.1',
            userAgent: 'test',
            createdAt: new Date('2026-03-15'),
            user: { displayName: 'Test User', department: 'Eng' },
          },
        ],
        total: 1,
        limit: 10000,
        offset: 0,
      }),
    };

    const mockCsv = {
      generateCsv: jest.fn().mockReturnValue('ID,User\ndl-1,Test User\n'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminDashboardController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DownloadsService, useValue: mockDownloads },
        { provide: CsvExportService, useValue: mockCsv },
      ],
    }).compile();

    controller = module.get<AdminDashboardController>(AdminDashboardController);
    prisma = module.get(PrismaService);
    downloadsService = module.get(DownloadsService);
    csvExportService = module.get(CsvExportService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==========================================================
  // GET /admin/dashboard
  // ==========================================================
  describe('getDashboard', () => {
    it('should return dashboard summary data', async () => {
      const result = await controller.getDashboard();

      expect(result).toHaveProperty('totalSkills', 50);
      expect(result).toHaveProperty('totalTemplates', 20);
      expect(result).toHaveProperty('totalUsers', 100);
      expect(result).toHaveProperty('totalDownloads', 500);
      expect(result).toHaveProperty('activeUsers30d');
      expect(result).toHaveProperty('pendingReviews', 5);
      expect(result).toHaveProperty('recentDownloads');
      expect(result.recentDownloads).toHaveLength(1);
    });
  });

  // ==========================================================
  // GET /admin/download-logs/export
  // ==========================================================
  describe('exportDownloadLogs', () => {
    it('should generate CSV and set response headers', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };

      await controller.exportDownloadLogs({}, mockRes as any);

      expect(downloadsService.getAdminDownloadLogs).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10000, offset: 0 }),
      );
      expect(csvExportService.generateCsv).toHaveBeenCalled();
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/csv; charset=utf-8',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('download-logs-'),
      );
      expect(mockRes.send).toHaveBeenCalledWith('ID,User\ndl-1,Test User\n');
    });
  });
});
