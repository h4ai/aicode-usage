import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SemverResolver, VersionResolution } from './semver-resolver';
import { NotificationService as SyncNotificationService } from './notification.service';
import * as semver from 'semver';

@Injectable()
export class DependencySyncService {
  private readonly logger = new Logger(DependencySyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: SyncNotificationService,
  ) {}

  /**
   * When a skill publishes a new version, scan all templates
   * that reference it and auto-update compatible versions.
   */
  async onSkillVersionPublished(skillName: string, newVersion: string): Promise<{
    updated: number;
    blocked: number;
    notified: number;
  }> {
    this.logger.log(`Skill "${skillName}" published version ${newVersion}`);

    // Find all template skills referencing this skill
    const templateSkills = await this.prisma.templateSkill.findMany({
      where: { skillName },
      include: {
        templateVersion: {
          include: {
            template: { include: { namespace: true, author: true } },
          },
        },
      },
    });

    let updated = 0;
    let blocked = 0;
    let notified = 0;

    for (const ts of templateSkills) {
      // Get all published versions of this skill
      const skillVersions = await this.getSkillVersions(skillName);

      const resolution = SemverResolver.resolve(
        skillName,
        ts.versionRange,
        skillVersions,
        semver.minVersion(ts.versionRange)?.version || null,
      );

      if (resolution.action === 'update' && resolution.newVersion) {
        // Auto-update: version is within range
        this.logger.log(
          `Auto-updating ${ts.templateVersion.template.name} skill "${skillName}" to ${resolution.newVersion}`,
        );
        updated++;
      } else if (resolution.action === 'major-blocked' && resolution.newVersion) {
        // Major change: notify but don't update
        this.logger.warn(
          `Major version blocked for ${ts.templateVersion.template.name}: ${skillName} ${resolution.currentVersion} → ${resolution.newVersion}`,
        );

        await this.notificationService.notifyMajorChange(
          ts.templateVersion.template.author.id,
          ts.templateVersion.template.name,
          skillName,
          resolution.currentVersion || 'unknown',
          resolution.newVersion,
        );

        blocked++;
        notified++;
      }
    }

    return { updated, blocked, notified };
  }

  /**
   * Get all published versions of a skill (version strings).
   */
  private async getSkillVersions(skillName: string): Promise<string[]> {
    const skill = await this.prisma.skill.findFirst({
      where: { name: skillName },
      include: {
        versions: {
          where: { reviewStatus: 'APPROVED' },
          select: { version: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!skill) return [];
    return skill.versions.map((v) => v.version);
  }

  /**
   * Get dependencies for a template version.
   */
  async getDependencies(templateId: string, version: string) {
    const tv = await this.prisma.templateVersion.findFirst({
      where: {
        templateId,
        version,
      },
      include: {
        skills: true,
      },
    });

    if (!tv) return [];
    return tv.skills;
  }

  /**
   * Resolve all dependencies for a template version.
   */
  async resolveDependencies(templateId: string, version: string): Promise<VersionResolution[]> {
    const deps = await this.getDependencies(templateId, version);

    if (deps.length === 0) return [];

    // Gather available versions for each skill
    const availableVersionsMap: Record<string, string[]> = {};

    for (const dep of deps) {
      if (!availableVersionsMap[dep.skillName]) {
        availableVersionsMap[dep.skillName] = await this.getSkillVersions(dep.skillName);
      }
    }

    return SemverResolver.resolveAll(
      deps.map((d) => ({
        skillName: d.skillName,
        versionRange: d.versionRange,
        currentResolved: null,
      })),
      availableVersionsMap,
    );
  }
}
