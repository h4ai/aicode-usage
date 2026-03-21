import { Test, TestingModule } from '@nestjs/testing';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { ReviewDecision } from './dto/review-decision.dto';

// ============================================================
// TDD Test Suite: ReviewController
// Written BEFORE implementation per Sprint 3 TDD mandate
// ============================================================

describe('ReviewController', () => {
  let controller: ReviewController;
  let reviewService: jest.Mocked<ReviewService>;

  const mockUser = {
    sub: 'reviewer-1',
    role: 'REVIEWER',
    department: 'Engineering',
  };

  const mockAdmin = {
    sub: 'admin-1',
    role: 'ADMIN',
    department: 'Engineering',
  };

  const mockReview = {
    id: 'review-1',
    skillId: 'skill-1',
    versionId: 'version-1',
    submitterId: 'submitter-1',
    reviewerId: null,
    status: 'PENDING_MANUAL',
    decision: null,
    comment: null,
    scanResult: null,
    reviewScore: null,
    submittedAt: new Date(),
    autoScannedAt: new Date(),
    assignedAt: null,
    reviewedAt: null,
    approvedAt: null,
    skill: { id: 'skill-1', name: 'Test' },
    version: { id: 'version-1', version: '1.0.0' },
  };

  const mockPaginated = {
    data: [mockReview],
    total: 1,
    page: 1,
    limit: 20,
    totalPages: 1,
  };

  beforeEach(async () => {
    const mockReviewService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      assign: jest.fn(),
      decision: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReviewController],
      providers: [
        { provide: ReviewService, useValue: mockReviewService },
      ],
    }).compile();

    controller = module.get<ReviewController>(ReviewController);
    reviewService = module.get(ReviewService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==========================================================
  // GET /api/v1/reviews
  // ==========================================================
  describe('findAll', () => {
    it('should return paginated reviews', async () => {
      reviewService.findAll.mockResolvedValue(mockPaginated);

      const req = { user: mockAdmin } as any;
      const result = await controller.findAll({} as any, req);

      expect(result).toEqual(mockPaginated);
      expect(reviewService.findAll).toHaveBeenCalled();
    });

    it('should pass query and user to service', async () => {
      reviewService.findAll.mockResolvedValue(mockPaginated);

      const query = { status: 'PENDING_MANUAL', page: 1, limit: 20 } as any;
      const req = { user: mockUser } as any;
      await controller.findAll(query, req);

      expect(reviewService.findAll).toHaveBeenCalledWith(query, mockUser);
    });
  });

  // ==========================================================
  // GET /api/v1/reviews/:id
  // ==========================================================
  describe('findOne', () => {
    it('should return review detail', async () => {
      reviewService.findOne.mockResolvedValue(mockReview);

      const result = await controller.findOne('review-1');

      expect(result).toEqual(mockReview);
      expect(reviewService.findOne).toHaveBeenCalledWith('review-1');
    });
  });

  // ==========================================================
  // POST /api/v1/reviews/:id/assign
  // ==========================================================
  describe('assign', () => {
    it('should assign review to self', async () => {
      const assigned = { ...mockReview, status: 'IN_REVIEW', reviewerId: 'reviewer-1' };
      reviewService.assign.mockResolvedValue(assigned);

      const req = { user: mockUser } as any;
      const result = await controller.assign('review-1', {}, req);

      expect(result.status).toBe('IN_REVIEW');
      expect(reviewService.assign).toHaveBeenCalledWith('review-1', {}, mockUser);
    });

    it('should assign review to another reviewer', async () => {
      const assigned = { ...mockReview, status: 'IN_REVIEW', reviewerId: 'reviewer-2' };
      reviewService.assign.mockResolvedValue(assigned);

      const req = { user: mockAdmin } as any;
      const result = await controller.assign('review-1', { assigneeId: 'reviewer-2' }, req);

      expect(result.reviewerId).toBe('reviewer-2');
    });
  });

  // ==========================================================
  // POST /api/v1/reviews/:id/decision
  // ==========================================================
  describe('decision', () => {
    it('should approve a review', async () => {
      const approved = { ...mockReview, status: 'APPROVED' };
      reviewService.decision.mockResolvedValue(approved);

      const req = { user: mockUser } as any;
      const dto = { decision: ReviewDecision.APPROVE, comment: 'LGTM', reviewScore: 5 };
      const result = await controller.decision('review-1', dto, req);

      expect(result.status).toBe('APPROVED');
      expect(reviewService.decision).toHaveBeenCalledWith('review-1', dto, mockUser);
    });

    it('should reject a review', async () => {
      const rejected = { ...mockReview, status: 'REJECTED' };
      reviewService.decision.mockResolvedValue(rejected);

      const req = { user: mockUser } as any;
      const dto = { decision: ReviewDecision.REJECT, comment: 'Issues found' };
      const result = await controller.decision('review-1', dto, req);

      expect(result.status).toBe('REJECTED');
    });

    it('should request revision', async () => {
      const revision = { ...mockReview, status: 'REVISION_REQUESTED' };
      reviewService.decision.mockResolvedValue(revision);

      const req = { user: mockUser } as any;
      const dto = { decision: ReviewDecision.REVISION_REQUESTED, comment: 'Fix formatting' };
      const result = await controller.decision('review-1', dto, req);

      expect(result.status).toBe('REVISION_REQUESTED');
    });
  });
});
