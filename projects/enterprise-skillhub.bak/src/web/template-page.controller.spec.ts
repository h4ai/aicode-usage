import { Test, TestingModule } from '@nestjs/testing';
import { TemplatePageController } from './template-page.controller';
import { PrismaService } from '../prisma/prisma.service';
import { DownloadsService } from '../downloads/downloads.service';
import { TemplateSortEnum } from './dto/template-list-query.dto';
import { NotFoundException } from '@nestjs/common';

describe('TemplatePageController', () => {
  let controller: TemplatePageController;
  let prisma: any;
  let downloadsService: any;

  const mockTemplate = {
    id: 'tpl-1',
    name: 'java-springboot',
    description: 'Spring Boot starter',
    tags: ['java', 'backend'],
    downloadCount: 100,
    weeklyDownloads: 20,
    createdAt: new Date(),
    updatedAt: new Date(),
    namespace: { id: 'ns-1', name: 'backend-team' },
    author: { id: 'user-1', displayName: 'User 1' },
    versions: [
      {
        id: 'ver-1',
        version: '1.0.0',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        createdAt: new Date(),
        skills: [{ skillName: 'java-formatter', versionRange: '^1.0.0' }],
      },
    ],
  };

  beforeEach(async () => {
    const mockPrisma = {
      template: {
        findMany: jest.fn().mockResolvedValue([mockTemplate]),
        count: jest.fn().mockResolvedValue(1),
        findUniqueOrThrow: jest.fn().mockResolvedValue(mockTemplate),
      },
    };

    const mockDownloads = {
      getDownloadTrend: jest.fn().mockResolvedValue([
        { date: '2026-03-15', downloads: 5 },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplatePageController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DownloadsService, useValue: mockDownloads },
      ],
    }).compile();

    controller = module.get<TemplatePageController>(TemplatePageController);
    prisma = module.get(PrismaService);
    downloadsService = module.get(DownloadsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==========================================================
  // GET /web/templates
  // ==========================================================
  describe('listTemplates', () => {
    it('should return paginated template list', async () => {
      const result = await controller.listTemplates({});

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('should sort by weeklyDownloads DESC by default (popular)', async () => {
      await controller.listTemplates({});

      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { weeklyDownloads: 'desc' },
        }),
      );
    });

    it('should sort by createdAt DESC for newest', async () => {
      await controller.listTemplates({ sort: TemplateSortEnum.NEWEST });

      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should sort by name ASC for name sort', async () => {
      await controller.listTemplates({ sort: TemplateSortEnum.NAME });

      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: 'asc' },
        }),
      );
    });

    it('should filter by search keyword', async () => {
      await controller.listTemplates({ search: 'java' });

      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'java', mode: 'insensitive' } },
              { description: { contains: 'java', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('should filter by tag', async () => {
      await controller.listTemplates({ tag: 'backend' });

      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tags: { has: 'backend' },
          }),
        }),
      );
    });
  });

  // ==========================================================
  // GET /web/templates/:id
  // ==========================================================
  describe('getTemplateDetail', () => {
    it('should return template detail with download trend', async () => {
      const result = await controller.getTemplateDetail('tpl-1');

      expect(result).toHaveProperty('id', 'tpl-1');
      expect(result).toHaveProperty('downloadTrend');
      expect(result.downloadTrend).toHaveLength(1);
      expect(downloadsService.getDownloadTrend).toHaveBeenCalled();
    });

    it('should throw if template not found', async () => {
      prisma.template.findUniqueOrThrow.mockRejectedValue(
        new NotFoundException('Not found'),
      );

      await expect(controller.getTemplateDetail('nonexistent')).rejects.toThrow();
    });
  });

  // ==========================================================
  // GET /web/templates/:id/install-command
  // ==========================================================
  describe('getInstallCommand', () => {
    it('should return install command with latest published version', async () => {
      prisma.template.findUniqueOrThrow.mockResolvedValue({
        name: 'java-springboot',
        namespace: { name: 'backend-team' },
        versions: [{ version: '1.0.0' }],
      });

      const result = await controller.getInstallCommand('tpl-1');

      expect(result.command).toBe('skillhub install @backend-team/java-springboot@1.0.0');
      expect(result.fullName).toBe('@backend-team/java-springboot');
      expect(result.version).toBe('1.0.0');
    });

    it('should use "latest" when no published versions exist', async () => {
      prisma.template.findUniqueOrThrow.mockResolvedValue({
        name: 'java-springboot',
        namespace: { name: 'backend-team' },
        versions: [],
      });

      const result = await controller.getInstallCommand('tpl-1');

      expect(result.version).toBe('latest');
    });
  });
});
