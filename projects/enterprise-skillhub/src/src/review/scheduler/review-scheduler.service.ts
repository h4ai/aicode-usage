import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';

/**
 * Review Scheduler Service:
 * - Auto-assigns PENDING_MANUAL reviews to least-loaded reviewers
 * - Checks for overdue reviews and sends timeout alerts
 * - Uses Redis SETNX for distributed lock (K8s multi-replica safe)
 */
@Injectable()
export class ReviewSchedulerService {
  private readonly logger = new Logger(ReviewSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    @Inject('REDIS_CLIENT') private readonly redis: any,
  ) {}

  /**
   * Acquire a distributed lock using Redis SETNX
   * @returns true if lock acquired, false if already held
   */
  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(
      key,
      Date.now().toString(),
      'EX',
      ttlSeconds,
      'NX',
    );
    return result === 'OK';
  }

  /**
   * Release distributed lock
   */
  async releaseLock(key: string): Promise<void> {
    await this.redis.del(key);
  }

  /**
   * Auto-assign PENDING_MANUAL reviews to eligible reviewers
   * Returns count of assigned reviews
   */
  async autoAssignReviews(): Promise<{ assigned: number }> {
    // Find all unassigned PENDING_MANUAL reviews
    const pendingReviews = await this.prisma.skillReview.findMany({
      where: {
        status: 'PENDING_MANUAL' as any,
        reviewerId: null,
      },
      include: {
        skill: {
          include: {
            owner: { select: { department: true } },
          },
        },
      },
    });

    if (pendingReviews.length === 0) {
      return { assigned: 0 };
    }

    let assignedCount = 0;

    for (const review of pendingReviews) {
      try {
        // Find matching policy
        const policy = await this.prisma.reviewPolicy.findFirst({
          where: { isActive: true },
        });

        if (!policy) continue;

        // Find eligible reviewers (match AD groups)
        const reviewerAdGroups = (policy as any).reviewerAdGroups || [];
        const allReviewers = await this.prisma.user.findMany({
          where: {
            role: { in: ['REVIEWER', 'ADMIN'] as any },
            isActive: true,
          },
        });

        // Filter: exclude submitter + skill owner
        const eligible = allReviewers.filter((r: any) => {
          if (r.id === review.submitterId) return false;
          if (r.id === review.skill.ownerId) return false;
          return true;
        });

        if (eligible.length === 0) continue;

        // Find least loaded reviewer
        const loadCounts = await Promise.all(
          eligible.map(async (r: any) => ({
            reviewer: r,
            load: await this.prisma.skillReview.count({
              where: {
                reviewerId: r.id,
                status: 'IN_REVIEW' as any,
              },
            }),
          })),
        );

        loadCounts.sort((a, b) => a.load - b.load);
        const bestReviewer = loadCounts[0].reviewer;

        // Assign
        await this.prisma.skillReview.update({
          where: { id: review.id },
          data: {
            reviewerId: bestReviewer.id,
            status: 'IN_REVIEW' as any,
            assignedAt: new Date(),
          },
        });

        assignedCount++;

        this.logger.log(
          `Auto-assigned review ${review.id} to ${bestReviewer.displayName}`,
        );
      } catch (error: any) {
        this.logger.error(
          `Failed to auto-assign review ${review.id}: ${error.message}`,
        );
      }
    }

    return { assigned: assignedCount };
  }

  /**
   * Check for overdue reviews and send timeout alerts
   */
  async checkTimeoutAlerts(): Promise<void> {
    // Find all reviews in PENDING_MANUAL or IN_REVIEW status
    const activeReviews = await this.prisma.skillReview.findMany({
      where: {
        status: { in: ['PENDING_MANUAL', 'IN_REVIEW'] },
      },
      include: {
        skill: true,
        version: true,
        submitter: { select: { displayName: true } },
      },
    });

    const now = new Date();

    for (const review of activeReviews) {
      // Find matching policy for timeout threshold
      const policy = await this.prisma.reviewPolicy.findFirst({
        where: { isActive: true },
      });

      const maxDays = (policy as any)?.maxReviewDays || policy?.timeoutHours
        ? Math.ceil((policy?.timeoutHours || 72) / 24)
        : 3;

      const submittedAt = new Date(review.submittedAt);
      const daysPending = Math.floor(
        (now.getTime() - submittedAt.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysPending > maxDays) {
        try {
          await this.notificationService.sendReviewTimeoutAlert(
            review,
            daysPending,
          );
          this.logger.warn(
            `Review ${review.id} is overdue: ${daysPending} days (max: ${maxDays})`,
          );
        } catch (error: any) {
          this.logger.error(
            `Failed to send timeout alert for review ${review.id}: ${error.message}`,
          );
        }
      }
    }
  }

  /**
   * Main scheduler tick — runs every hour
   * Acquires distributed lock before executing
   */
  async tick(): Promise<void> {
    const lockKey = 'lock:review-assignment';
    const lockTtl = 300; // 5 minutes

    const acquired = await this.acquireLock(lockKey, lockTtl);
    if (!acquired) {
      this.logger.log('Another instance holds the scheduler lock, skipping');
      return;
    }

    try {
      const assignResult = await this.autoAssignReviews();
      this.logger.log(`Auto-assignment: ${assignResult.assigned} reviews assigned`);

      await this.checkTimeoutAlerts();
    } finally {
      await this.releaseLock(lockKey);
    }
  }
}
