import {
  Injectable,
  Logger,
  Inject,
  ConflictException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as semver from 'semver';

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  [key: string]: unknown;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  /** Rate limit delay in ms (200ms = 5 req/s) */
  readonly rateLimitDelay = 200;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('sync') private readonly syncQueue: Queue,
    @Inject('HTTP_SERVICE') private readonly httpService: any,
  ) {}

  // ==========================================================
  // TRIGGER SYNC
  // ==========================================================

  async triggerSync(): Promise<{ jobId: string }> {
    // Prevent concurrent syncs
    const counts = await this.syncQueue.getJobCounts('active', 'waiting');
    if (counts.active > 0) {
      throw new ConflictException('A sync job is already running');
    }

    const job = await this.syncQueue.add(
      'sync-upstream',
      { triggeredAt: new Date().toISOString() },
      {
        removeOnComplete: true,
        removeOnFail: 50,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    return { jobId: job.id as string };
  }

  // ==========================================================
  // GET STATUS
  // ==========================================================

  async getStatus(): Promise<any> {
    const lastRun = await this.prisma.systemConfig.findUnique({
      where: { key: 'sync_last_run' },
    });

    const counts = await this.syncQueue.getJobCounts('waiting', 'active', 'completed', 'failed');

    if (!lastRun) {
      return {
        lastRunTime: null,
        successCount: 0,
        failCount: 0,
        queueDepth: counts.waiting || 0,
      };
    }

    const value = lastRun.value as any;
    return {
      lastRunTime: value.time || null,
      successCount: value.successCount || 0,
      failCount: value.failCount || 0,
      queueDepth: counts.waiting || 0,
    };
  }

  // ==========================================================
  // PROCESS SYNC (called by worker)
  // ==========================================================

  async processSync(): Promise<SyncResult> {
    const result: SyncResult = { created: 0, updated: 0, skipped: 0, failed: 0 };

    // Fetch upstream skills from ClawHub
    const response = await this.httpService.axiosRef.get(
      'https://clawhub.com/api/v1/skills',
      { params: { limit: 500 } },
    );

    const upstreamSkills = response.data.skills || [];

    for (const upstream of upstreamSkills) {
      try {
        await this.processSingleSkill(upstream, result);

        // Rate limiting: wait between requests
        await this.sleep(this.rateLimitDelay);
      } catch (error: any) {
        this.logger.warn(`Failed to sync ${upstream.slug}: ${error.message}`);
        result.failed++;
      }
    }

    // Persist sync results
    await this.saveSyncStatus(result);

    return result;
  }

  private async processSingleSkill(upstream: any, result: SyncResult): Promise<void> {
    const localSkill = await this.prisma.skill.findUnique({
      where: { slug: upstream.slug },
      include: { versions: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    if (!localSkill) {
      // New skill — create it
      await this.createFromUpstream(upstream);
      result.created++;
      return;
    }

    // Check if locally modified
    const sourceConfig = await this.prisma.systemConfig.findUnique({
      where: { key: `skill_source:${upstream.slug}` },
    });

    if (sourceConfig && (sourceConfig.value as any) === 'LOCAL') {
      result.skipped++;
      return;
    }

    // Compare versions
    const localVersion = localSkill.versions[0]?.version;
    if (localVersion && upstream.version && localVersion === upstream.version) {
      // Same version, skip
      result.skipped++;
      return;
    }

    // Newer upstream version — update
    if (
      localVersion &&
      upstream.version &&
      semver.valid(upstream.version) &&
      semver.valid(localVersion) &&
      !semver.gt(upstream.version, localVersion)
    ) {
      result.skipped++;
      return;
    }

    await this.updateFromUpstream(localSkill.id, upstream);
    result.updated++;
  }

  private async createFromUpstream(upstream: any): Promise<void> {
    const parsed = semver.parse(upstream.version) || { major: 1, minor: 0, patch: 0 };

    const skill = await this.prisma.skill.create({
      data: {
        name: upstream.name,
        slug: upstream.slug,
        summary: upstream.summary || null,
        category: upstream.category || 'GENERAL',
        tags: upstream.tags || [],
        ownerId: 'system', // system user for upstream skills
      },
    });

    await this.prisma.skillVersion.create({
      data: {
        skillId: skill.id,
        version: upstream.version,
        major: parsed.major,
        minor: parsed.minor,
        patch: parsed.patch,
        reviewStatus: 'APPROVED', // upstream skills are pre-approved
        createdById: 'system',
      },
    });

    // Mark source as UPSTREAM
    await this.prisma.systemConfig.upsert({
      where: { key: `skill_source:${upstream.slug}` },
      update: { value: 'UPSTREAM' },
      create: { key: `skill_source:${upstream.slug}`, value: 'UPSTREAM' },
    });
  }

  private async updateFromUpstream(skillId: string, upstream: any): Promise<void> {
    const parsed = semver.parse(upstream.version) || { major: 1, minor: 0, patch: 0 };

    const version = await this.prisma.skillVersion.create({
      data: {
        skillId,
        version: upstream.version,
        major: parsed.major,
        minor: parsed.minor,
        patch: parsed.patch,
        reviewStatus: 'APPROVED',
        createdById: 'system',
      },
    });

    await this.prisma.skill.update({
      where: { id: skillId },
      data: {
        latestVersionId: version.id,
        publishedVersionId: version.id,
      },
    });
  }

  // ==========================================================
  // SAVE SYNC STATUS
  // ==========================================================

  async saveSyncStatus(result: SyncResult): Promise<void> {
    const syncValue = {
      time: new Date().toISOString(),
      successCount: result.created + result.updated,
      failCount: result.failed,
      details: result as unknown as Prisma.InputJsonValue,
    } as Prisma.InputJsonValue;

    await this.prisma.systemConfig.upsert({
      where: { key: 'sync_last_run' },
      update: {
        value: syncValue,
      },
      create: {
        key: 'sync_last_run',
        value: syncValue,
      },
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
