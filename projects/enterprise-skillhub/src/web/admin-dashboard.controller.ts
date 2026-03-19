import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { DownloadsService } from '../downloads/downloads.service';
import { CsvExportService } from './csv-export.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { QueryAdminDownloadLogsDto } from '../downloads/dto/query-downloads.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminDashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly downloadsService: DownloadsService,
    private readonly csvExportService: CsvExportService,
  ) {}

  /**
   * GET /api/v1/admin/dashboard
   * Overview dashboard data for the admin panel.
   */
  @Get('dashboard')
  async getDashboard() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalSkills,
      totalTemplates,
      totalUsers,
      totalDownloads,
      activeUsers30d,
      pendingReviews,
      recentDownloads,
    ] = await Promise.all([
      this.prisma.skill.count(),
      this.prisma.template.count(),
      this.prisma.user.count(),
      this.prisma.downloadLog.count(),
      this.prisma.downloadLog
        .groupBy({
          by: ['userId'],
          where: { createdAt: { gte: thirtyDaysAgo } },
        })
        .then((r) => r.length),
      this.prisma.skillReview.count({
        where: { status: { in: ['PENDING_AUTO', 'PENDING_MANUAL', 'IN_REVIEW'] } },
      }),
      this.prisma.downloadLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          resourceType: true,
          resourceName: true,
          version: true,
          source: true,
          createdAt: true,
          user: { select: { displayName: true } },
        },
      }),
    ]);

    return {
      totalSkills,
      totalTemplates,
      totalUsers,
      totalDownloads,
      activeUsers30d,
      pendingReviews,
      recentDownloads,
    };
  }

  /**
   * GET /api/v1/admin/download-logs/export
   * Export download logs as CSV.
   */
  @Get('download-logs/export')
  async exportDownloadLogs(
    @Query() query: QueryAdminDownloadLogsDto,
    @Res() res: Response,
  ) {
    // Override limit for export — get all matching records (up to 10000)
    const exportQuery = { ...query, limit: 10000, offset: 0 };
    const result = await this.downloadsService.getAdminDownloadLogs(exportQuery);

    const columns = [
      { header: 'ID', key: 'id' },
      { header: 'User', key: 'userName' },
      { header: 'Department', key: 'department' },
      { header: 'Resource Type', key: 'resourceType' },
      { header: 'Resource Name', key: 'resourceName' },
      { header: 'Version', key: 'version' },
      { header: 'Source', key: 'source' },
      { header: 'IP', key: 'ip' },
      { header: 'User Agent', key: 'userAgent' },
      { header: 'Created At', key: 'createdAt' },
    ];

    const flatData = result.items.map((item: any) => ({
      id: item.id,
      userName: item.user?.displayName || item.userId,
      department: item.user?.department || '',
      resourceType: item.resourceType,
      resourceName: item.resourceName,
      version: item.version,
      source: item.source,
      ip: item.ip || '',
      userAgent: item.userAgent || '',
      createdAt: item.createdAt,
    }));

    const csv = this.csvExportService.generateCsv(flatData, columns);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="download-logs-${new Date().toISOString().split('T')[0]}.csv"`,
    );
    res.send(csv);
  }
}
