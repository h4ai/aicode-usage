import { Test, TestingModule } from '@nestjs/testing';
import { SyncService } from './sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { getQueueToken } from '@nestjs/bullmq';
import { ConflictException } from '@nestjs/common';

// ============================================================
// TDD Test Suite: SyncService
// Written BEFORE implementation per Sprint 4 TDD mandate
// ============================================================

describe('SyncService', () => {
  let service: SyncService;
  let prisma: any;
  let syncQueue: any;
  let httpService: any;

  const mockUpstreamSkill = {
    slug: 'test-skill',
    name: 'Test Skill',
    version: '2.0.0',
    category: 'GENERAL',
    summary: 'A test skill from ClawHub',
    downloadUrl: 'https://clawhub.com/api/v1/skills/test-skill/2.0.0/download',
  };

  const mockLocalSkill = {
    id: 'skill-1',
    slug: 'test-skill',
    name: 'Test Skill',
    category: 'GENERAL',
    latestVersionId: 'ver-1',
    versions: [{ version: '1.0.0', major: 1, minor: 0, patch: 0 }],
    tags: [],
  };

  beforeEach(async () => {
    prisma = {
      skill: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      skillVersion: {
        create: jest.fn(),
      },
      systemConfig: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };

    syncQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 5, failed: 1 }),
    };

    httpService = {
      axiosRef: {
        get: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken('sync'), useValue: syncQueue },
        { provide: 'HTTP_SERVICE', useValue: httpService },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // TRIGGER SYNC
  // ==========================================================
  describe('triggerSync', () => {
    it('should enqueue a sync job', async () => {
      await service.triggerSync();

      expect(syncQueue.add).toHaveBeenCalledWith(
        'sync-upstream',
        expect.any(Object),
        expect.objectContaining({
          removeOnComplete: true,
        }),
      );
    });

    it('should prevent concurrent syncs', async () => {
      syncQueue.getJobCounts.mockResolvedValue({ active: 1, waiting: 0 });

      await expect(service.triggerSync()).rejects.toThrow(ConflictException);
    });
  });

  // ==========================================================
  // GET STATUS
  // ==========================================================
  describe('getStatus', () => {
    it('should return sync status with last run time', async () => {
      prisma.systemConfig.findUnique.mockResolvedValue({
        key: 'sync_last_run',
        value: { time: '2026-03-19T02:00:00Z', successCount: 10, failCount: 1 },
      });
      syncQueue.getJobCounts.mockResolvedValue({
        waiting: 2,
        active: 0,
        completed: 50,
        failed: 3,
      });

      const result = await service.getStatus();

      expect(result).toHaveProperty('lastRunTime', '2026-03-19T02:00:00Z');
      expect(result).toHaveProperty('successCount', 10);
      expect(result).toHaveProperty('failCount', 1);
      expect(result).toHaveProperty('queueDepth', 2);
    });

    it('should return empty status if never synced', async () => {
      prisma.systemConfig.findUnique.mockResolvedValue(null);
      syncQueue.getJobCounts.mockResolvedValue({ waiting: 0, active: 0 });

      const result = await service.getStatus();

      expect(result).toHaveProperty('lastRunTime', null);
      expect(result).toHaveProperty('queueDepth', 0);
    });
  });

  // ==========================================================
  // PROCESS SYNC (internal logic)
  // ==========================================================
  describe('processSync', () => {
    it('should fetch skills from ClawHub and create new ones', async () => {
      httpService.axiosRef.get.mockResolvedValue({
        data: { skills: [mockUpstreamSkill] },
      });
      prisma.skill.findUnique.mockResolvedValue(null); // skill doesn't exist locally
      prisma.skill.create.mockResolvedValue({ id: 'new-skill', ...mockUpstreamSkill });
      prisma.skillVersion.create.mockResolvedValue({ id: 'new-ver' });

      const result = await service.processSync();

      expect(result).toHaveProperty('created');
      expect(result.created).toBeGreaterThanOrEqual(1);
    });

    it('should update existing skill if upstream version is newer', async () => {
      httpService.axiosRef.get.mockResolvedValue({
        data: { skills: [mockUpstreamSkill] }, // v2.0.0
      });
      prisma.skill.findUnique.mockResolvedValue(mockLocalSkill); // v1.0.0

      // Skill is from upstream (not locally modified)
      prisma.systemConfig.findUnique.mockResolvedValue({
        key: `skill_source:${mockLocalSkill.slug}`,
        value: 'UPSTREAM',
      });
      prisma.skillVersion.create.mockResolvedValue({ id: 'new-ver' });
      prisma.skill.update.mockResolvedValue({});

      const result = await service.processSync();

      expect(result).toHaveProperty('updated');
      expect(result.updated).toBeGreaterThanOrEqual(1);
    });

    it('should NOT overwrite locally modified skills (source=LOCAL)', async () => {
      httpService.axiosRef.get.mockResolvedValue({
        data: { skills: [mockUpstreamSkill] },
      });
      prisma.skill.findUnique.mockResolvedValue(mockLocalSkill);
      prisma.systemConfig.findUnique.mockResolvedValue({
        key: `skill_source:${mockLocalSkill.slug}`,
        value: 'LOCAL',
      });

      const result = await service.processSync();

      expect(result).toHaveProperty('skipped');
      expect(result.skipped).toBeGreaterThanOrEqual(1);
      expect(prisma.skillVersion.create).not.toHaveBeenCalled();
    });

    it('should skip if local version matches upstream', async () => {
      const sameVersionUpstream = { ...mockUpstreamSkill, version: '1.0.0' };
      httpService.axiosRef.get.mockResolvedValue({
        data: { skills: [sameVersionUpstream] },
      });
      prisma.skill.findUnique.mockResolvedValue(mockLocalSkill);
      prisma.systemConfig.findUnique.mockResolvedValue({
        key: `skill_source:${mockLocalSkill.slug}`,
        value: 'UPSTREAM',
      });

      const result = await service.processSync();

      expect(result.updated).toBe(0);
    });

    it('should handle API errors gracefully', async () => {
      httpService.axiosRef.get.mockRejectedValue(new Error('Network error'));

      await expect(service.processSync()).rejects.toThrow('Network error');
    });

    it('should respect rate limit (max 5 req/s)', async () => {
      // This test verifies the rate limiting mechanism exists
      expect(service).toHaveProperty('rateLimitDelay');
    });
  });

  // ==========================================================
  // SAVE SYNC STATUS
  // ==========================================================
  describe('saveSyncStatus', () => {
    it('should persist sync results to SystemConfig', async () => {
      prisma.systemConfig.upsert.mockResolvedValue({});

      await service.saveSyncStatus({
        created: 5,
        updated: 3,
        skipped: 2,
        failed: 0,
      });

      expect(prisma.systemConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'sync_last_run' },
          update: expect.objectContaining({
            value: expect.objectContaining({
              successCount: 8, // created + updated
              failCount: 0,
            }),
          }),
        }),
      );
    });
  });
});
