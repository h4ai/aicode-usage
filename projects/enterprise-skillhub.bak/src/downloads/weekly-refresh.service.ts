import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WeeklyRefreshService {
  private readonly logger = new Logger(WeeklyRefreshService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Refresh weeklyDownloads for all Skills and Templates.
   * Runs every Monday at 00:00, counting downloads from the last 7 days.
   */
  @Cron(CronExpression.EVERY_WEEK)
  async refreshWeeklyDownloads(): Promise<{ skillsUpdated: number; templatesUpdated: number }> {
    this.logger.log('Starting weekly download refresh...');
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Get skill download counts from last 7 days
    const skillCounts = await this.prisma.downloadLog.groupBy({
      by: ['resourceId'],
      where: {
        resourceType: 'SKILL',
        createdAt: { gte: sevenDaysAgo },
      },
      _count: { id: true },
    });

    // Reset all skills to 0, then update those with downloads
    await this.prisma.skill.updateMany({
      data: { weeklyDownloads: 0 },
    });

    let skillsUpdated = 0;
    for (const entry of skillCounts) {
      await this.prisma.skill.updateMany({
        where: { id: entry.resourceId },
        data: { weeklyDownloads: entry._count.id },
      });
      skillsUpdated++;
    }

    // Get template download counts from last 7 days
    const templateCounts = await this.prisma.downloadLog.groupBy({
      by: ['resourceId'],
      where: {
        resourceType: 'TEMPLATE',
        createdAt: { gte: sevenDaysAgo },
      },
      _count: { id: true },
    });

    // Reset all templates to 0, then update those with downloads
    await this.prisma.template.updateMany({
      data: { weeklyDownloads: 0 },
    });

    let templatesUpdated = 0;
    for (const entry of templateCounts) {
      await this.prisma.template.updateMany({
        where: { id: entry.resourceId },
        data: { weeklyDownloads: entry._count.id },
      });
      templatesUpdated++;
    }

    this.logger.log(
      `Weekly download refresh complete: ${skillsUpdated} skills, ${templatesUpdated} templates updated`,
    );

    return { skillsUpdated, templatesUpdated };
  }
}
