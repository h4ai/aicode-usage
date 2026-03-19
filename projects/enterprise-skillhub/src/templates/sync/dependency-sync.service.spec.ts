import { Test, TestingModule } from '@nestjs/testing';
import { DependencySyncService } from './dependency-sync.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService as SyncNotificationService } from './notification.service';

describe('DependencySyncService', () => {
  let service: DependencySyncService;
  let prisma: any;
  let notificationService: jest.Mocked<SyncNotificationService>;

  beforeEach(async () => {
    const mockPrisma = {
      templateSkill: {
        findMany: jest.fn(),
      },
      templateVersion: {
        findFirst: jest.fn(),
      },
      skill: {
        findFirst: jest.fn(),
      },
    };

    const mockNotification = {
      notifyMajorChange: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DependencySyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SyncNotificationService, useValue: mockNotification },
      ],
    }).compile();

    service = module.get<DependencySyncService>(DependencySyncService);
    prisma = module.get(PrismaService);
    notificationService = module.get(SyncNotificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // ON SKILL VERSION PUBLISHED
  // ==========================================================
  describe('onSkillVersionPublished', () => {
    it('should auto-update templates within version range', async () => {
      prisma.templateSkill.findMany.mockResolvedValue([
        {
          id: 'ts-1',
          skillName: 'code-review',
          versionRange: '^1.0.0',
          templateVersion: {
            id: 'tv-1',
            version: '1.0.0',
            template: {
              id: 'tpl-1',
              name: 'java-starter',
              namespace: { id: 'ns-1', name: 'backend' },
              author: { id: 'user-1', displayName: 'Dev' },
            },
          },
        },
      ]);

      prisma.skill.findFirst.mockResolvedValue({
        id: 'skill-1',
        name: 'code-review',
        versions: [
          { version: '1.0.0' },
          { version: '1.1.0' },
          { version: '1.2.0' },
        ],
      });

      const result = await service.onSkillVersionPublished('code-review', '1.2.0');

      expect(result.updated).toBe(1);
      expect(result.blocked).toBe(0);
      expect(result.notified).toBe(0);
    });

    it('should block and notify on major version changes', async () => {
      prisma.templateSkill.findMany.mockResolvedValue([
        {
          id: 'ts-1',
          skillName: 'deploy-helper',
          versionRange: '>=1.0.0',
          templateVersion: {
            id: 'tv-1',
            version: '1.0.0',
            template: {
              id: 'tpl-1',
              name: 'react-starter',
              namespace: { id: 'ns-1', name: 'frontend' },
              author: { id: 'user-2', displayName: 'Dev2' },
            },
          },
        },
      ]);

      prisma.skill.findFirst.mockResolvedValue({
        id: 'skill-2',
        name: 'deploy-helper',
        versions: [
          { version: '1.0.0' },
          { version: '2.0.0' },
        ],
      });

      const result = await service.onSkillVersionPublished('deploy-helper', '2.0.0');

      expect(result.blocked).toBe(1);
      expect(result.notified).toBe(1);
      expect(notificationService.notifyMajorChange).toHaveBeenCalledWith(
        'user-2',
        'react-starter',
        'deploy-helper',
        expect.any(String),
        '2.0.0',
      );
    });

    it('should handle no templates referencing the skill', async () => {
      prisma.templateSkill.findMany.mockResolvedValue([]);

      const result = await service.onSkillVersionPublished('unknown-skill', '1.0.0');

      expect(result.updated).toBe(0);
      expect(result.blocked).toBe(0);
    });
  });

  // ==========================================================
  // GET DEPENDENCIES
  // ==========================================================
  describe('getDependencies', () => {
    it('should return skills for a template version', async () => {
      prisma.templateVersion.findFirst.mockResolvedValue({
        id: 'tv-1',
        skills: [
          { id: 'ts-1', skillName: 'skill-a', versionRange: '^1.0.0' },
          { id: 'ts-2', skillName: 'skill-b', versionRange: '~2.0.0' },
        ],
      });

      const deps = await service.getDependencies('tpl-1', '1.0.0');

      expect(deps).toHaveLength(2);
      expect(deps[0].skillName).toBe('skill-a');
      expect(deps[1].skillName).toBe('skill-b');
    });

    it('should return empty when version not found', async () => {
      prisma.templateVersion.findFirst.mockResolvedValue(null);

      const deps = await service.getDependencies('tpl-1', '999.0.0');

      expect(deps).toEqual([]);
    });
  });

  // ==========================================================
  // RESOLVE DEPENDENCIES
  // ==========================================================
  describe('resolveDependencies', () => {
    it('should resolve all dependencies with best versions', async () => {
      prisma.templateVersion.findFirst.mockResolvedValue({
        id: 'tv-1',
        skills: [
          { id: 'ts-1', skillName: 'skill-a', versionRange: '^1.0.0' },
        ],
      });

      prisma.skill.findFirst.mockResolvedValue({
        id: 'skill-1',
        versions: [{ version: '1.0.0' }, { version: '1.2.0' }, { version: '1.5.0' }],
      });

      const resolutions = await service.resolveDependencies('tpl-1', '1.0.0');

      expect(resolutions).toHaveLength(1);
      expect(resolutions[0].skillName).toBe('skill-a');
      expect(resolutions[0].newVersion).toBe('1.5.0');
    });

    it('should return empty when no dependencies', async () => {
      prisma.templateVersion.findFirst.mockResolvedValue({
        id: 'tv-1',
        skills: [],
      });

      const resolutions = await service.resolveDependencies('tpl-1', '1.0.0');

      expect(resolutions).toEqual([]);
    });
  });
});
