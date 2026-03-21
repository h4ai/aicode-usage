import { Test, TestingModule } from '@nestjs/testing';
import { ReviewService } from './review.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ReviewDecision } from './dto/review-decision.dto';

// ============================================================
// TDD Test Suite: ReviewService
// Written BEFORE implementation per Sprint 3 TDD mandate
// ============================================================

describe('ReviewService', () => {
  let service: ReviewService;
  let prisma: any;

  // ---- Mock data ----
  const mockReviewer = {
    sub: 'reviewer-1',
    role: 'REVIEWER',
    department: 'Engineering',
  };

  const mockAdmin = {
    sub: 'admin-1',
    role: 'ADMIN',
    department: 'Engineering',
  };

  const mockSubmitter = {
    sub: 'submitter-1',
    role: 'PUBLISHER',
    department: 'Engineering',
  };

  const mockSkill = {
    id: 'skill-1',
    name: 'Test Skill',
    slug: 'test-skill',
    ownerId: 'owner-1',
    category: 'GENERAL',
  };

  const mockVersion = {
    id: 'version-1',
    skillId: 'skill-1',
    version: '1.0.0',
    reviewStatus: 'PENDING_AUTO',
    createdById: 'submitter-1',
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
    submittedAt: new Date('2026-01-01'),
    autoScannedAt: new Date('2026-01-01'),
    assignedAt: null,
    reviewedAt: null,
    approvedAt: null,
    skill: mockSkill,
    version: mockVersion,
  };

  const mockAssignedReview = {
    ...mockReview,
    status: 'IN_REVIEW',
    reviewerId: 'reviewer-1',
    assignedAt: new Date('2026-01-02'),
  };

  beforeEach(async () => {
    prisma = {
      skillReview: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      skillVersion: {
        update: jest.fn(),
      },
      skill: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      reviewPolicy: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ReviewService>(ReviewService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // LIST REVIEWS
  // ==========================================================
  describe('findAll', () => {
    it('should return paginated review list', async () => {
      prisma.skillReview.findMany.mockResolvedValue([mockReview]);
      prisma.skillReview.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20, skip: 0 } as any, mockAdmin);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total', 1);
      expect(result).toHaveProperty('page', 1);
      expect(result).toHaveProperty('limit', 20);
    });

    it('should filter by status', async () => {
      prisma.skillReview.findMany.mockResolvedValue([]);
      prisma.skillReview.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20, skip: 0, status: 'PENDING_MANUAL' } as any, mockAdmin);

      expect(prisma.skillReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING_MANUAL' }),
        }),
      );
    });

    it('should show all reviews for ADMIN', async () => {
      prisma.skillReview.findMany.mockResolvedValue([]);
      prisma.skillReview.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20, skip: 0 } as any, mockAdmin);

      // ADMIN should NOT have reviewerId filter
      expect(prisma.skillReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ reviewerId: expect.anything() }),
        }),
      );
    });

    it('should show only assigned reviews for REVIEWER', async () => {
      prisma.skillReview.findMany.mockResolvedValue([]);
      prisma.skillReview.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20, skip: 0 } as any, mockReviewer);

      expect(prisma.skillReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { reviewerId: 'reviewer-1' },
              { status: 'PENDING_MANUAL' },
            ]),
          }),
        }),
      );
    });
  });

  // ==========================================================
  // GET REVIEW BY ID
  // ==========================================================
  describe('findOne', () => {
    it('should return review with skill and version details', async () => {
      prisma.skillReview.findUnique.mockResolvedValue(mockReview);

      const result = await service.findOne('review-1');

      expect(result).toEqual(mockReview);
      expect(prisma.skillReview.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'review-1' },
          include: expect.objectContaining({
            skill: true,
            version: true,
          }),
        }),
      );
    });

    it('should throw NotFoundException if review not found', async () => {
      prisma.skillReview.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================================
  // ASSIGN REVIEW (TASK-A9)
  // ==========================================================
  describe('assign', () => {
    it('should allow reviewer to self-claim (no assigneeId)', async () => {
      prisma.skillReview.findUnique.mockResolvedValue(mockReview);
      prisma.skillReview.update.mockResolvedValue({
        ...mockReview,
        status: 'IN_REVIEW',
        reviewerId: 'reviewer-1',
        assignedAt: expect.any(Date),
      });

      const result = await service.assign('review-1', {}, mockReviewer);

      expect(result.status).toBe('IN_REVIEW');
      expect(result.reviewerId).toBe('reviewer-1');
    });

    it('should allow admin to assign to another reviewer', async () => {
      prisma.skillReview.findUnique.mockResolvedValue(mockReview);
      prisma.skillReview.update.mockResolvedValue({
        ...mockReview,
        status: 'IN_REVIEW',
        reviewerId: 'reviewer-2',
        assignedAt: expect.any(Date),
      });

      const result = await service.assign('review-1', { assigneeId: 'reviewer-2' }, mockAdmin);

      expect(result.reviewerId).toBe('reviewer-2');
    });

    it('should reject assignment if review is not PENDING_MANUAL', async () => {
      const approvedReview = { ...mockReview, status: 'APPROVED' };
      prisma.skillReview.findUnique.mockResolvedValue(approvedReview);

      await expect(
        service.assign('review-1', {}, mockReviewer),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject if reviewer is the submitter (self-review)', async () => {
      prisma.skillReview.findUnique.mockResolvedValue(mockReview);

      await expect(
        service.assign('review-1', {}, mockSubmitter), // submitter-1 == submitterId
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject if reviewer is the skill owner', async () => {
      const reviewWithOwner = {
        ...mockReview,
        skill: { ...mockSkill, ownerId: 'reviewer-1' },
      };
      prisma.skillReview.findUnique.mockResolvedValue(reviewWithOwner);

      await expect(
        service.assign('review-1', {}, mockReviewer),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should handle concurrent assignment (optimistic lock)', async () => {
      prisma.skillReview.findUnique.mockResolvedValue(mockReview);
      // Simulate concurrent update — another reviewer already claimed it
      prisma.skillReview.update.mockRejectedValue(
        new ConflictException('Review already assigned'),
      );

      await expect(
        service.assign('review-1', {}, mockReviewer),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException for non-existent review', async () => {
      prisma.skillReview.findUnique.mockResolvedValue(null);

      await expect(
        service.assign('nonexistent', {}, mockReviewer),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================================
  // DECISION (TASK-A9)
  // ==========================================================
  describe('decision', () => {
    // ---- APPROVE ----
    describe('APPROVE', () => {
      it('should approve a review in IN_REVIEW status', async () => {
        prisma.skillReview.findUnique.mockResolvedValue(mockAssignedReview);
        prisma.skillReview.update.mockResolvedValue({
          ...mockAssignedReview,
          status: 'APPROVED',
          decision: 'APPROVE',
          approvedAt: new Date(),
        });
        prisma.skillVersion.update.mockResolvedValue({});
        prisma.skill.update.mockResolvedValue({});

        const result = await service.decision(
          'review-1',
          { decision: ReviewDecision.APPROVE, comment: 'Looks good', reviewScore: 5 },
          mockReviewer,
        );

        expect(result.status).toBe('APPROVED');
      });

      it('should update SkillVersion.reviewStatus to APPROVED on approve', async () => {
        prisma.skillReview.findUnique.mockResolvedValue(mockAssignedReview);
        prisma.skillReview.update.mockResolvedValue({
          ...mockAssignedReview,
          status: 'APPROVED',
        });
        prisma.skillVersion.update.mockResolvedValue({});
        prisma.skill.update.mockResolvedValue({});

        await service.decision(
          'review-1',
          { decision: ReviewDecision.APPROVE },
          mockReviewer,
        );

        expect(prisma.skillVersion.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'version-1' },
            data: expect.objectContaining({ reviewStatus: 'APPROVED' }),
          }),
        );
      });

      it('should update Skill.publishedVersionId on approve', async () => {
        prisma.skillReview.findUnique.mockResolvedValue(mockAssignedReview);
        prisma.skillReview.update.mockResolvedValue({
          ...mockAssignedReview,
          status: 'APPROVED',
        });
        prisma.skillVersion.update.mockResolvedValue({});
        prisma.skill.update.mockResolvedValue({});

        await service.decision(
          'review-1',
          { decision: ReviewDecision.APPROVE },
          mockReviewer,
        );

        expect(prisma.skill.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'skill-1' },
            data: expect.objectContaining({ publishedVersionId: 'version-1' }),
          }),
        );
      });
    });

    // ---- REJECT ----
    describe('REJECT', () => {
      it('should reject a review in IN_REVIEW status', async () => {
        prisma.skillReview.findUnique.mockResolvedValue(mockAssignedReview);
        prisma.skillReview.update.mockResolvedValue({
          ...mockAssignedReview,
          status: 'REJECTED',
          decision: 'REJECT',
          comment: 'Security issues',
          reviewedAt: new Date(),
        });

        const result = await service.decision(
          'review-1',
          { decision: ReviewDecision.REJECT, comment: 'Security issues' },
          mockReviewer,
        );

        expect(result.status).toBe('REJECTED');
      });

      it('should be a final state — no further transitions from REJECTED', async () => {
        const rejectedReview = { ...mockAssignedReview, status: 'REJECTED' };
        prisma.skillReview.findUnique.mockResolvedValue(rejectedReview);

        await expect(
          service.decision(
            'review-1',
            { decision: ReviewDecision.APPROVE },
            mockReviewer,
          ),
        ).rejects.toThrow(ConflictException);
      });
    });

    // ---- REVISION_REQUESTED ----
    describe('REVISION_REQUESTED', () => {
      it('should request revision for IN_REVIEW review', async () => {
        prisma.skillReview.findUnique.mockResolvedValue(mockAssignedReview);
        prisma.skillReview.update.mockResolvedValue({
          ...mockAssignedReview,
          status: 'REVISION_REQUESTED',
          decision: 'REVISION_REQUESTED',
          comment: 'Please fix formatting',
          reviewedAt: new Date(),
        });

        const result = await service.decision(
          'review-1',
          { decision: ReviewDecision.REVISION_REQUESTED, comment: 'Please fix formatting' },
          mockReviewer,
        );

        expect(result.status).toBe('REVISION_REQUESTED');
      });
    });

    // ---- State machine illegal transitions ----
    describe('illegal state transitions', () => {
      it('should reject APPROVE from PENDING_MANUAL (not IN_REVIEW)', async () => {
        prisma.skillReview.findUnique.mockResolvedValue(mockReview); // status=PENDING_MANUAL

        await expect(
          service.decision(
            'review-1',
            { decision: ReviewDecision.APPROVE },
            mockReviewer,
          ),
        ).rejects.toThrow(ConflictException);
      });

      it('should reject decision from AUTO_REJECTED', async () => {
        const autoRejected = { ...mockReview, status: 'AUTO_REJECTED' };
        prisma.skillReview.findUnique.mockResolvedValue(autoRejected);

        await expect(
          service.decision(
            'review-1',
            { decision: ReviewDecision.APPROVE },
            mockReviewer,
          ),
        ).rejects.toThrow(ConflictException);
      });

      it('should reject decision from APPROVED', async () => {
        const approved = { ...mockAssignedReview, status: 'APPROVED' };
        prisma.skillReview.findUnique.mockResolvedValue(approved);

        await expect(
          service.decision(
            'review-1',
            { decision: ReviewDecision.REJECT },
            mockReviewer,
          ),
        ).rejects.toThrow(ConflictException);
      });

      it('should reject decision from PENDING_AUTO', async () => {
        const pendingAuto = { ...mockReview, status: 'PENDING_AUTO' };
        prisma.skillReview.findUnique.mockResolvedValue(pendingAuto);

        await expect(
          service.decision(
            'review-1',
            { decision: ReviewDecision.APPROVE },
            mockReviewer,
          ),
        ).rejects.toThrow(ConflictException);
      });
    });

    // ---- Authorization ----
    describe('authorization', () => {
      it('should reject if user is not the assigned reviewer and not admin', async () => {
        const otherReviewer = { sub: 'other-reviewer', role: 'REVIEWER', department: 'Eng' };
        prisma.skillReview.findUnique.mockResolvedValue(mockAssignedReview); // reviewerId = reviewer-1

        await expect(
          service.decision(
            'review-1',
            { decision: ReviewDecision.APPROVE },
            otherReviewer,
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should allow admin to make decision even if not assigned', async () => {
        prisma.skillReview.findUnique.mockResolvedValue(mockAssignedReview);
        prisma.skillReview.update.mockResolvedValue({
          ...mockAssignedReview,
          status: 'APPROVED',
        });
        prisma.skillVersion.update.mockResolvedValue({});
        prisma.skill.update.mockResolvedValue({});

        const result = await service.decision(
          'review-1',
          { decision: ReviewDecision.APPROVE },
          mockAdmin,
        );

        expect(result.status).toBe('APPROVED');
      });

      it('should reject if submitter tries to decide own review', async () => {
        const selfAssigned = { ...mockAssignedReview, reviewerId: 'submitter-1' };
        prisma.skillReview.findUnique.mockResolvedValue(selfAssigned);

        await expect(
          service.decision(
            'review-1',
            { decision: ReviewDecision.APPROVE },
            mockSubmitter,
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    // ---- Review score validation ----
    describe('review score', () => {
      it('should save reviewScore with decision', async () => {
        prisma.skillReview.findUnique.mockResolvedValue(mockAssignedReview);
        prisma.skillReview.update.mockResolvedValue({
          ...mockAssignedReview,
          status: 'APPROVED',
          reviewScore: 4,
        });
        prisma.skillVersion.update.mockResolvedValue({});
        prisma.skill.update.mockResolvedValue({});

        const result = await service.decision(
          'review-1',
          { decision: ReviewDecision.APPROVE, reviewScore: 4 },
          mockReviewer,
        );

        expect(prisma.skillReview.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ reviewScore: 4 }),
          }),
        );
      });
    });
  });

  // ==========================================================
  // POLICY MATCHING (TASK-A7)
  // ==========================================================
  describe('matchPolicy', () => {
    const defaultPolicy = {
      id: 'policy-global',
      name: 'Global',
      category: null,
      department: null,
      autoApprove: false,
    };

    it('should match category+department policy first (highest priority)', async () => {
      const catDeptPolicy = {
        id: 'policy-cat-dept',
        name: 'DevEng',
        category: 'DEVELOPMENT',
        department: 'Engineering',
      };
      prisma.reviewPolicy.findFirst
        .mockResolvedValueOnce(catDeptPolicy); // cat+dept match

      const result = await service.matchPolicy('DEVELOPMENT', 'Engineering');

      expect(result.id).toBe('policy-cat-dept');
    });

    it('should fall back to category-only policy', async () => {
      const catPolicy = {
        id: 'policy-cat',
        name: 'Dev',
        category: 'DEVELOPMENT',
        department: null,
      };
      prisma.reviewPolicy.findFirst
        .mockResolvedValueOnce(null)    // no cat+dept
        .mockResolvedValueOnce(catPolicy); // cat match

      const result = await service.matchPolicy('DEVELOPMENT', 'Engineering');

      expect(result.id).toBe('policy-cat');
    });

    it('should fall back to department-only policy', async () => {
      const deptPolicy = {
        id: 'policy-dept',
        name: 'Eng',
        category: null,
        department: 'Engineering',
      };
      prisma.reviewPolicy.findFirst
        .mockResolvedValueOnce(null)     // no cat+dept
        .mockResolvedValueOnce(null)     // no cat
        .mockResolvedValueOnce(deptPolicy); // dept match

      const result = await service.matchPolicy('DEVELOPMENT', 'Engineering');

      expect(result.id).toBe('policy-dept');
    });

    it('should fall back to global policy', async () => {
      prisma.reviewPolicy.findFirst
        .mockResolvedValueOnce(null)  // no cat+dept
        .mockResolvedValueOnce(null)  // no cat
        .mockResolvedValueOnce(null)  // no dept
        .mockResolvedValueOnce(defaultPolicy); // global

      const result = await service.matchPolicy('DEVELOPMENT', 'Engineering');

      expect(result.id).toBe('policy-global');
    });

    it('should return null if no policy matches', async () => {
      prisma.reviewPolicy.findFirst.mockResolvedValue(null);

      const result = await service.matchPolicy('DEVELOPMENT', 'Engineering');

      expect(result).toBeNull();
    });
  });

  // ==========================================================
  // CREATE REVIEW (called when version is uploaded)
  // ==========================================================
  describe('createReview', () => {
    it('should create a SkillReview in PENDING_AUTO status', async () => {
      prisma.skillReview.create.mockResolvedValue({
        ...mockReview,
        status: 'PENDING_AUTO',
      });

      const result = await service.createReview({
        skillId: 'skill-1',
        versionId: 'version-1',
        submitterId: 'submitter-1',
      });

      expect(result.status).toBe('PENDING_AUTO');
      expect(prisma.skillReview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            skillId: 'skill-1',
            versionId: 'version-1',
            submitterId: 'submitter-1',
            status: 'PENDING_AUTO',
          }),
        }),
      );
    });
  });
});
