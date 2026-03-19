import { Test, TestingModule } from '@nestjs/testing';
import { StatsService } from './stats.service';
import { PrismaService } from '../prisma/prisma.service';

// ============================================================
// TDD Test Suite: StatsService
// Written BEFORE implementation per Sprint 4 TDD mandate
// ============================================================

describe('StatsService', () => {
  let service: StatsService;
  let prisma: any;
  let cacheManager: any;

  beforeEach(async () => {
    prisma = {
      skill: {
        count: jest.fn(),
      },
      user: {
        count: jest.fn(),
      },
      skillReview: {
        count: jest.fn(),
        findMany: jest.fn(),
        groupBy: jest.fn(),
      },
      auditLog: {
        count: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $queryRawUnsafe: jest.fn(),
    };

    cacheManager = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatsService,
        { provide: PrismaService, useValue: prisma },
        { provide: 'CACHE_MANAGER', useValue: cacheManager },
      ],
    }).compile();

    service = module.get<StatsService>(StatsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // OVERVIEW
  // ==========================================================
  describe('getOverview', () => {
    it('should return dashboard overview stats', async () => {
      prisma.skill.count.mockResolvedValue(42);
      prisma.user.count
        .mockResolvedValueOnce(100)   // total users
        .mockResolvedValueOnce(30);   // monthly active
      prisma.skillReview.count.mockResolvedValue(5);

      const result = await service.getOverview();

      expect(result).toHaveProperty('totalSkills', 42);
      expect(result).toHaveProperty('totalUsers', 100);
      expect(result).toHaveProperty('monthlyActiveUsers', 30);
      expect(result).toHaveProperty('pendingReviews', 5);
    });

    it('should use cache if available', async () => {
      const cached = { totalSkills: 10, totalUsers: 20, monthlyActiveUsers: 5, pendingReviews: 2 };
      cacheManager.get.mockResolvedValue(cached);

      const result = await service.getOverview();

      expect(result).toEqual(cached);
      expect(prisma.skill.count).not.toHaveBeenCalled();
    });

    it('should cache result with TTL 15 min', async () => {
      prisma.skill.count.mockResolvedValue(42);
      prisma.user.count.mockResolvedValue(100);
      prisma.skillReview.count.mockResolvedValue(5);

      await service.getOverview();

      expect(cacheManager.set).toHaveBeenCalledWith(
        'stats:overview',
        expect.any(Object),
        900, // 15 min in seconds
      );
    });
  });

  // ==========================================================
  // TOP SKILLS
  // ==========================================================
  describe('getTopSkills', () => {
    it('should return top 10 skills by installCount', async () => {
      const topSkills = [
        { id: 'skill-1', name: 'Popular Skill', slug: 'popular', installCount: 500 },
      ];
      prisma.$queryRaw.mockResolvedValue(topSkills);

      const result = await service.getTopSkills();

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('installCount', 500);
    });

    it('should use cache if available', async () => {
      const cached = [{ id: 'skill-1', installCount: 500 }];
      cacheManager.get.mockResolvedValue(cached);

      const result = await service.getTopSkills();

      expect(result).toEqual(cached);
    });

    it('should limit to 10 results', async () => {
      const topSkills = Array.from({ length: 15 }, (_, i) => ({
        id: `skill-${i}`,
        installCount: 100 - i,
      }));
      prisma.$queryRaw.mockResolvedValue(topSkills.slice(0, 10));

      const result = await service.getTopSkills();

      expect(result.length).toBeLessThanOrEqual(10);
    });
  });

  // ==========================================================
  // DEPARTMENT USAGE
  // ==========================================================
  describe('getDepartmentUsage', () => {
    it('should return usage aggregated by department', async () => {
      const deptUsage = [
        { department: 'Engineering', totalInstalls: 150, userCount: 20 },
        { department: 'Product', totalInstalls: 80, userCount: 10 },
      ];
      prisma.$queryRaw.mockResolvedValue(deptUsage);

      const result = await service.getDepartmentUsage();

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('department', 'Engineering');
      expect(result[0]).toHaveProperty('totalInstalls', 150);
    });

    it('should use cache if available', async () => {
      const cached = [{ department: 'Engineering', totalInstalls: 150 }];
      cacheManager.get.mockResolvedValue(cached);

      const result = await service.getDepartmentUsage();

      expect(result).toEqual(cached);
    });
  });

  // ==========================================================
  // REVIEW EFFICIENCY
  // ==========================================================
  describe('getReviewEfficiency', () => {
    it('should return review efficiency metrics', async () => {
      prisma.$queryRaw.mockResolvedValue([{
        avgReviewHours: 12.5,
        approvalRate: 0.85,
        timeoutRate: 0.05,
        totalReviewed: 100,
      }]);

      const result = await service.getReviewEfficiency();

      expect(result).toHaveProperty('avgReviewHours');
      expect(result).toHaveProperty('approvalRate');
      expect(result).toHaveProperty('timeoutRate');
      expect(result).toHaveProperty('totalReviewed');
    });

    it('should use cache if available', async () => {
      const cached = { avgReviewHours: 10, approvalRate: 0.9, timeoutRate: 0.02 };
      cacheManager.get.mockResolvedValue(cached);

      const result = await service.getReviewEfficiency();

      expect(result).toEqual(cached);
    });

    it('should handle zero reviews gracefully', async () => {
      prisma.$queryRaw.mockResolvedValue([{
        avgReviewHours: null,
        approvalRate: null,
        timeoutRate: null,
        totalReviewed: 0,
      }]);

      const result = await service.getReviewEfficiency();

      expect(result).toHaveProperty('totalReviewed', 0);
    });
  });

  // ==========================================================
  // TRENDS
  // ==========================================================
  describe('getTrends', () => {
    it('should return 30-day trend data', async () => {
      const trends = Array.from({ length: 30 }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        newSkills: Math.floor(Math.random() * 5),
        newInstalls: Math.floor(Math.random() * 20),
        newReviews: Math.floor(Math.random() * 3),
      }));
      prisma.$queryRaw.mockResolvedValue(trends);

      const result = await service.getTrends();

      expect(result).toHaveLength(30);
      expect(result[0]).toHaveProperty('date');
      expect(result[0]).toHaveProperty('newSkills');
      expect(result[0]).toHaveProperty('newInstalls');
      expect(result[0]).toHaveProperty('newReviews');
    });

    it('should use cache if available', async () => {
      const cached = [{ date: '2026-01-01', newSkills: 5, newInstalls: 10, newReviews: 2 }];
      cacheManager.get.mockResolvedValue(cached);

      const result = await service.getTrends();

      expect(result).toEqual(cached);
    });
  });
});
