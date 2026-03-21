import { Test, TestingModule } from '@nestjs/testing';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

// ============================================================
// TDD Test Suite: StatsController
// Written BEFORE implementation per Sprint 4 TDD mandate
// ============================================================

describe('StatsController', () => {
  let controller: StatsController;
  let statsService: jest.Mocked<StatsService>;

  const mockOverview = {
    totalSkills: 42,
    totalUsers: 100,
    monthlyActiveUsers: 30,
    pendingReviews: 5,
  };

  const mockTopSkills = [
    { id: 'skill-1', name: 'Popular', slug: 'popular', installCount: 500 },
    { id: 'skill-2', name: 'Also Popular', slug: 'also-popular', installCount: 300 },
  ];

  const mockDeptUsage = [
    { department: 'Engineering', totalInstalls: 150, userCount: 20 },
    { department: 'Product', totalInstalls: 80, userCount: 10 },
  ];

  const mockReviewEfficiency = {
    avgReviewHours: 12.5,
    approvalRate: 0.85,
    timeoutRate: 0.05,
    totalReviewed: 100,
  };

  const mockTrends = [
    { date: '2026-01-01', newSkills: 2, newInstalls: 15, newReviews: 3 },
  ];

  beforeEach(async () => {
    const mockStatsService = {
      getOverview: jest.fn(),
      getTopSkills: jest.fn(),
      getDepartmentUsage: jest.fn(),
      getReviewEfficiency: jest.fn(),
      getTrends: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatsController],
      providers: [
        { provide: StatsService, useValue: mockStatsService },
      ],
    }).compile();

    controller = module.get<StatsController>(StatsController);
    statsService = module.get(StatsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==========================================================
  // GET /api/v1/stats/overview
  // ==========================================================
  describe('getOverview', () => {
    it('should return dashboard overview', async () => {
      statsService.getOverview.mockResolvedValue(mockOverview);

      const result = await controller.getOverview();

      expect(result).toEqual(mockOverview);
      expect(statsService.getOverview).toHaveBeenCalled();
    });
  });

  // ==========================================================
  // GET /api/v1/stats/top-skills
  // ==========================================================
  describe('getTopSkills', () => {
    it('should return top skills', async () => {
      statsService.getTopSkills.mockResolvedValue(mockTopSkills);

      const result = await controller.getTopSkills();

      expect(result).toEqual(mockTopSkills);
    });
  });

  // ==========================================================
  // GET /api/v1/stats/department-usage
  // ==========================================================
  describe('getDepartmentUsage', () => {
    it('should return department usage stats', async () => {
      statsService.getDepartmentUsage.mockResolvedValue(mockDeptUsage);

      const result = await controller.getDepartmentUsage();

      expect(result).toEqual(mockDeptUsage);
    });
  });

  // ==========================================================
  // GET /api/v1/stats/review-efficiency
  // ==========================================================
  describe('getReviewEfficiency', () => {
    it('should return review efficiency metrics', async () => {
      statsService.getReviewEfficiency.mockResolvedValue(mockReviewEfficiency);

      const result = await controller.getReviewEfficiency();

      expect(result).toEqual(mockReviewEfficiency);
    });
  });

  // ==========================================================
  // GET /api/v1/stats/trends
  // ==========================================================
  describe('getTrends', () => {
    it('should return 30-day trend data', async () => {
      statsService.getTrends.mockResolvedValue(mockTrends);

      const result = await controller.getTrends();

      expect(result).toEqual(mockTrends);
    });
  });
});
