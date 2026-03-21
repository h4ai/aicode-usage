import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SkillCategory } from '@prisma/client';
import { QueryReviewsDto } from './dto/query-reviews.dto';
import { AssignReviewDto } from './dto/assign-review.dto';
import { ReviewDecisionDto, ReviewDecision } from './dto/review-decision.dto';
import { PaginatedResult } from '../common/dto/pagination.dto';

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List reviews with pagination and role-based filtering
   * ADMIN sees all, REVIEWER sees assigned + PENDING_MANUAL
   */
  async findAll(query: QueryReviewsDto, user: any): Promise<PaginatedResult<any>> {
    const limit = Math.min(query.limit || 20, 100);
    const page = query.page || 1;
    const skip = (page - 1) * limit;

    const where: any = {};

    // Status filter
    if (query.status) {
      where.status = query.status;
    }

    // Role-based filtering
    if (user.role !== 'ADMIN') {
      where.OR = [
        { reviewerId: user.sub },
        { status: 'PENDING_MANUAL' },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.skillReview.findMany({
        where,
        skip,
        take: limit,
        orderBy: { submittedAt: 'desc' },
        include: {
          skill: true,
          version: true,
          submitter: { select: { id: true, displayName: true, department: true } },
          reviewer: { select: { id: true, displayName: true, department: true } },
        },
      }),
      this.prisma.skillReview.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get review detail by ID with skill/version info
   */
  async findOne(id: string): Promise<any> {
    const review = await this.prisma.skillReview.findUnique({
      where: { id },
      include: {
        skill: true,
        version: true,
        submitter: { select: { id: true, displayName: true, department: true } },
        reviewer: { select: { id: true, displayName: true, department: true } },
      },
    });

    if (!review) {
      throw new NotFoundException(`Review "${id}" not found`);
    }

    return review;
  }

  /**
   * Assign / claim a review
   * - No assigneeId → self-claim
   * - With assigneeId → transfer to another reviewer
   * - Only PENDING_MANUAL status can be assigned
   * - Enforces reviewer != submitter and reviewer != skill.ownerId
   */
  async assign(id: string, dto: AssignReviewDto, user: any): Promise<any> {
    const review = await this.prisma.skillReview.findUnique({
      where: { id },
      include: { skill: true },
    });

    if (!review) {
      throw new NotFoundException(`Review "${id}" not found`);
    }

    // Only PENDING_MANUAL can be assigned
    if (review.status !== 'PENDING_MANUAL') {
      throw new ConflictException(
        `Review cannot be assigned in "${review.status}" status. Must be PENDING_MANUAL.`,
      );
    }

    const assigneeId = dto.assigneeId || user.sub;

    // Separation of duties: reviewer != submitter
    if (assigneeId === review.submitterId) {
      throw new ForbiddenException(
        'Cannot assign review to the submitter (separation of duties)',
      );
    }

    // Separation of duties: reviewer != skill owner
    if (assigneeId === review.skill.ownerId) {
      throw new ForbiddenException(
        'Cannot assign review to the skill owner (separation of duties)',
      );
    }

    // Optimistic lock: update only if status is still PENDING_MANUAL
    try {
      const updated = await this.prisma.skillReview.update({
        where: {
          id,
          status: 'PENDING_MANUAL', // optimistic lock condition
        } as any,
        data: {
          reviewerId: assigneeId,
          status: 'IN_REVIEW',
          assignedAt: new Date(),
        },
        include: {
          skill: true,
          version: true,
        },
      });

      return updated;
    } catch (error: any) {
      // Prisma P2025: record not found (concurrent update changed status)
      if (error.code === 'P2025') {
        throw new ConflictException('Review already assigned by another reviewer');
      }
      throw error;
    }
  }

  /**
   * Make a decision on a review (APPROVE / REJECT / REVISION_REQUESTED)
   * - Only IN_REVIEW status allows decisions
   * - Only assigned reviewer or ADMIN can decide
   * - APPROVE triggers SkillVersion + Skill updates
   */
  async decision(id: string, dto: ReviewDecisionDto, user: any): Promise<any> {
    const review = await this.prisma.skillReview.findUnique({
      where: { id },
      include: { skill: true, version: true },
    });

    if (!review) {
      throw new NotFoundException(`Review "${id}" not found`);
    }

    // Only IN_REVIEW allows decisions
    if (review.status !== 'IN_REVIEW') {
      throw new ConflictException(
        `Cannot make decision on review in "${review.status}" status. Must be IN_REVIEW.`,
      );
    }

    // Authorization: must be assigned reviewer or ADMIN
    if (user.role !== 'ADMIN' && user.sub !== review.reviewerId) {
      throw new ForbiddenException(
        'Only the assigned reviewer or ADMIN can make a decision',
      );
    }

    // Separation of duties: submitter cannot decide own review
    if (user.sub === review.submitterId) {
      throw new ForbiddenException(
        'Cannot review your own submission (separation of duties)',
      );
    }

    const now = new Date();
    const updateData: any = {
      decision: dto.decision,
      comment: dto.comment || null,
      reviewScore: dto.reviewScore || null,
      reviewedAt: now,
    };

    switch (dto.decision) {
      case ReviewDecision.APPROVE:
        updateData.status = 'APPROVED';
        updateData.approvedAt = now;
        break;
      case ReviewDecision.REJECT:
        updateData.status = 'REJECTED';
        break;
      case ReviewDecision.REVISION_REQUESTED:
        updateData.status = 'REVISION_REQUESTED';
        break;
    }

    // Use transaction for APPROVE to ensure atomicity
    const updated = await this.prisma.$transaction(async (tx: any) => {
      const result = await tx.skillReview.update({
        where: { id },
        data: updateData,
        include: { skill: true, version: true },
      });

      // APPROVE side effects: update SkillVersion + Skill
      if (dto.decision === ReviewDecision.APPROVE) {
        await tx.skillVersion.update({
          where: { id: review.versionId },
          data: { reviewStatus: 'APPROVED' },
        });

        await tx.skill.update({
          where: { id: review.skillId },
          data: { publishedVersionId: review.versionId },
        });
      }

      return result;
    });

    return updated;
  }

  /**
   * Match the best ReviewPolicy for a given category + department
   * Priority: category+department > category > department > global
   */
  async matchPolicy(category: string, department: string): Promise<any> {
    const cat = category as SkillCategory;
    // 1. category + department
    let policy = await this.prisma.reviewPolicy.findFirst({
      where: { category: cat, department, isActive: true },
    });
    if (policy) return policy;

    // 2. category only
    policy = await this.prisma.reviewPolicy.findFirst({
      where: { category: cat, department: null, isActive: true },
    });
    if (policy) return policy;

    // 3. department only
    policy = await this.prisma.reviewPolicy.findFirst({
      where: { category: null, department, isActive: true },
    });
    if (policy) return policy;

    // 4. global (both null)
    policy = await this.prisma.reviewPolicy.findFirst({
      where: { category: null, department: null, isActive: true },
    });

    return policy || null;
  }

  /**
   * Create a new SkillReview record (called when version is uploaded)
   */
  async createReview(data: {
    skillId: string;
    versionId: string;
    submitterId: string;
  }): Promise<any> {
    return this.prisma.skillReview.create({
      data: {
        skillId: data.skillId,
        versionId: data.versionId,
        submitterId: data.submitterId,
        status: 'PENDING_AUTO',
      },
    });
  }
}
