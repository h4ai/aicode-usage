import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TemplateListQueryDto, TemplateSortEnum } from './dto/template-list-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DownloadsService } from '../downloads/downloads.service';
import { ResourceTypeEnum, PeriodEnum } from '../downloads/dto/query-downloads.dto';

@Controller('web/templates')
export class TemplatePageController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly downloadsService: DownloadsService,
  ) {}

  /**
   * GET /api/v1/web/templates
   * Template listing with card data for the web frontend.
   * Default sort: weeklyDownloads DESC (popular first).
   */
  @Get()
  async listTemplates(@Query() query: TemplateListQueryDto) {
    const where: any = { isPublic: true };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.tag) {
      where.tags = { has: query.tag };
    }

    if (query.namespaceId) {
      where.namespaceId = query.namespaceId;
    }

    // Determine sort order
    let orderBy: any;
    switch (query.sort) {
      case TemplateSortEnum.NEWEST:
        orderBy = { createdAt: 'desc' };
        break;
      case TemplateSortEnum.NAME:
        orderBy = { name: 'asc' };
        break;
      case TemplateSortEnum.POPULAR:
      default:
        orderBy = { weeklyDownloads: 'desc' };
        break;
    }

    const [items, total] = await Promise.all([
      this.prisma.template.findMany({
        where,
        orderBy,
        take: query.limit || 20,
        skip: query.offset || 0,
        select: {
          id: true,
          name: true,
          description: true,
          tags: true,
          downloadCount: true,
          weeklyDownloads: true,
          createdAt: true,
          updatedAt: true,
          namespace: {
            select: { id: true, name: true },
          },
          author: {
            select: { id: true, displayName: true },
          },
        },
      }),
      this.prisma.template.count({ where }),
    ]);

    return { items, total, limit: query.limit || 20, offset: query.offset || 0 };
  }

  /**
   * GET /api/v1/web/templates/:id
   * Template detail page with version history, dependencies, and download trend.
   */
  @Get(':id')
  async getTemplateDetail(@Param('id') id: string) {
    const template = await this.prisma.template.findUniqueOrThrow({
      where: { id },
      include: {
        namespace: { select: { id: true, name: true } },
        author: { select: { id: true, displayName: true } },
        versions: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            version: true,
            status: true,
            publishedAt: true,
            createdAt: true,
            skills: {
              select: { skillName: true, versionRange: true },
            },
          },
        },
      },
    });

    // Get download trend for last 30 days
    const trend = await this.downloadsService.getDownloadTrend(
      ResourceTypeEnum.TEMPLATE,
      id,
      PeriodEnum.MONTH,
    );

    return {
      ...template,
      downloadTrend: trend,
    };
  }

  /**
   * GET /api/v1/web/templates/:id/install-command
   * Generate one-click install command for a template.
   */
  @Get(':id/install-command')
  async getInstallCommand(@Param('id') id: string) {
    const template = await this.prisma.template.findUniqueOrThrow({
      where: { id },
      select: {
        name: true,
        namespace: { select: { name: true } },
        versions: {
          where: { status: 'PUBLISHED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { version: true },
        },
      },
    });

    const latestVersion = template.versions[0]?.version || 'latest';
    const fullName = `@${template.namespace.name}/${template.name}`;

    return {
      command: `skillhub install ${fullName}@${latestVersion}`,
      fullName,
      version: latestVersion,
    };
  }
}
