import { Test, TestingModule } from '@nestjs/testing';
import { ReviewSchedulerService } from './review-scheduler.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';

// ============================================================
// TDD Test Suite: ReviewSchedulerService
// Written BEFORE implementation per Sprint 3 TDD mandate
// ============================================================

describe('ReviewSchedulerService', () => {
  let service: ReviewSchedulerService;
  let prisma: any;
  let notificationService: jest.Mocked<NotificationService>;
  let mockRedis: any;

  const mockPendingReview = {
    id: 'review-1',
    skillId: 'skill-1',
    versionId: 'version-1',
    submitterId: 'submitter-1',
    reviewerId: null,
    status: 'PENDING_MANUAL',
    submittedAt: new Date('2026-01-01'),
    skill: {
      id: 'skill-1',
      name: 'Test Skill',
      category: 'DEVELOPMENT',
      ownerId: 'owner-1',
      owner: { department: 'Engineering' },
    },
  };

  const mockPolicy = {
    id: 'policy-1',
    name: 'Default',
    category: null,
    department: null,
    reviewerAdGroups: ['skill-reviewers'],
    maxReviewDays: 3,
    timeoutHours: 72,
    isActive: true,
  };

  const mockReviewers = [
    { id: 'reviewer-1', displayName: 'Reviewer One', department: 'Engineering', adGroups: ['skill-reviewers'] },
    { id: 'reviewer-2', displayName: 'Reviewer Two', department: 'QA', adGroups: ['skill-reviewers'] },
  ];

  beforeEach(async () => {
    prisma = {
      skillReview: {
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      reviewPolicy: {
        findFirst: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
      },
    };

    mockRedis = {
      set: jest.fn(),
      del: jest.fn(),
    };

    const mockNotification = {
      sendReviewTimeoutAlert: jest.fn(),
      sendReviewAssignedNotification: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewSchedulerService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationService, useValue: mockNotification },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<ReviewSchedulerService>(ReviewSchedulerService);
    notificationService = module.get(NotificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // Distributed Lock
  // ==========================================================
  describe('acquireLock', () => {
    it('should acquire lock with Redis SETNX', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const acquired = await service.acquireLock('lock:review-assignment', 300);

      expect(acquired).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'lock:review-assignment',
        expect.any(String),
        'EX',
        300,
        'NX',
      );
    });

    it('should fail to acquire lock if already held', async () => {
      mockRedis.set.mockResolvedValue(null);

      const acquired = await service.acquireLock('lock:review-assignment', 300);

      expect(acquired).toBe(false);
    });
  });

  describe('releaseLock', () => {
    it('should release the lock', async () => {
      mockRedis.del.mockResolvedValue(1);

      await service.releaseLock('lock:review-assignment');

      expect(mockRedis.del).toHaveBeenCalledWith('lock:review-assignment');
    });
  });

  // ==========================================================
  // Auto-assignment
  // ==========================================================
  describe('autoAssignReviews', () => {
    it('should find PENDING_MANUAL reviews and assign to least-loaded reviewer', async () => {
      prisma.skillReview.findMany.mockResolvedValue([mockPendingReview]);
      prisma.reviewPolicy.findFirst.mockResolvedValue(mockPolicy);
      prisma.user.findMany.mockResolvedValue(mockReviewers);
      prisma.skillReview.count
        .mockResolvedValueOnce(2) // reviewer-1 has 2 reviews
        .mockResolvedValueOnce(0); // reviewer-2 has 0 reviews
      prisma.skillReview.update.mockResolvedValue({
        ...mockPendingReview,
        reviewerId: 'reviewer-2',
        status: 'IN_REVIEW',
      });

      const result = await service.autoAssignReviews();

      expect(result.assigned).toBe(1);
      expect(prisma.skillReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'review-1' },
          data: expect.objectContaining({
            reviewerId: 'reviewer-2', // least loaded
          }),
        }),
      );
    });

    it('should exclude submitter from assignees', async () => {
      // submitter-1 is a reviewer too
      const reviewersIncludingSubmitter = [
        { id: 'submitter-1', displayName: 'Submitter', department: 'Engineering', adGroups: ['skill-reviewers'] },
        { id: 'reviewer-2', displayName: 'Reviewer Two', department: 'QA', adGroups: ['skill-reviewers'] },
      ];
      prisma.skillReview.findMany.mockResolvedValue([mockPendingReview]);
      prisma.reviewPolicy.findFirst.mockResolvedValue(mockPolicy);
      prisma.user.findMany.mockResolvedValue(reviewersIncludingSubmitter);
      prisma.skillReview.count.mockResolvedValue(0);
      prisma.skillReview.update.mockResolvedValue({
        ...mockPendingReview,
        reviewerId: 'reviewer-2',
      });

      await service.autoAssignReviews();

      // Should assign to reviewer-2, not submitter-1
      expect(prisma.skillReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reviewerId: 'reviewer-2',
          }),
        }),
      );
    });

    it('should exclude skill owner from assignees', async () => {
      const reviewWithOwner = {
        ...mockPendingReview,
        skill: {
          ...mockPendingReview.skill,
          ownerId: 'reviewer-1',
        },
      };
      prisma.skillReview.findMany.mockResolvedValue([reviewWithOwner]);
      prisma.reviewPolicy.findFirst.mockResolvedValue(mockPolicy);
      prisma.user.findMany.mockResolvedValue(mockReviewers);
      prisma.skillReview.count.mockResolvedValue(0);
      prisma.skillReview.update.mockResolvedValue({
        ...reviewWithOwner,
        reviewerId: 'reviewer-2',
      });

      await service.autoAssignReviews();

      expect(prisma.skillReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reviewerId: 'reviewer-2',
          }),
        }),
      );
    });

    it('should not assign if no eligible reviewers', async () => {
      const reviewFromOnlyReviewer = {
        ...mockPendingReview,
        submitterId: 'reviewer-1',
        skill: { ...mockPendingReview.skill, ownerId: 'reviewer-2' },
      };
      prisma.skillReview.findMany.mockResolvedValue([reviewFromOnlyReviewer]);
      prisma.reviewPolicy.findFirst.mockResolvedValue(mockPolicy);
      prisma.user.findMany.mockResolvedValue(mockReviewers);
      // Both reviewers are excluded (submitter + owner)

      const result = await service.autoAssignReviews();

      expect(result.assigned).toBe(0);
      expect(prisma.skillReview.update).not.toHaveBeenCalled();
    });

    it('should handle no pending reviews gracefully', async () => {
      prisma.skillReview.findMany.mockResolvedValue([]);

      const result = await service.autoAssignReviews();

      expect(result.assigned).toBe(0);
    });
  });

  // ==========================================================
  // Timeout Alerts
  // ==========================================================
  describe('checkTimeoutAlerts', () => {
    it('should send alerts for reviews exceeding maxReviewDays', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 5); // 5 days old, exceeds 3 day limit
      const overdueReview = {
        ...mockPendingReview,
        submittedAt: oldDate,
      };

      prisma.skillReview.findMany.mockResolvedValue([overdueReview]);
      prisma.reviewPolicy.findFirst.mockResolvedValue(mockPolicy);

      await service.checkTimeoutAlerts();

      expect(notificationService.sendReviewTimeoutAlert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'review-1' }),
        expect.any(Number),
      );
    });

    it('should not alert for fresh reviews', async () => {
      const freshReview = {
        ...mockPendingReview,
        submittedAt: new Date(), // just submitted
      };

      prisma.skillReview.findMany.mockResolvedValue([freshReview]);
      prisma.reviewPolicy.findFirst.mockResolvedValue(mockPolicy);

      await service.checkTimeoutAlerts();

      expect(notificationService.sendReviewTimeoutAlert).not.toHaveBeenCalled();
    });

    it('should check both PENDING_MANUAL and IN_REVIEW statuses', async () => {
      prisma.skillReview.findMany.mockResolvedValue([]);

      await service.checkTimeoutAlerts();

      expect(prisma.skillReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['PENDING_MANUAL', 'IN_REVIEW'] },
          }),
        }),
      );
    });
  });
});
