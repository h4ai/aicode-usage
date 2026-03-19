import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DownloadsService } from './downloads.service';
import {
  QueryTopResourcesDto,
  QueryDownloadTrendDto,
  QueryUserDownloadsDto,
  QueryAdminDownloadLogsDto,
  PeriodEnum,
} from './dto/query-downloads.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller()
export class DownloadsController {
  constructor(private readonly downloadsService: DownloadsService) {}

  // ==========================================================
  // Public Stats APIs
  // ==========================================================

  /**
   * GET /api/v1/stats/top-skills?period=week&limit=20
   * Get top skills by download count.
   */
  @Get('stats/top-skills')
  @UseGuards(JwtAuthGuard)
  async getTopSkills(@Query() query: QueryTopResourcesDto) {
    return this.downloadsService.getTopSkills(
      query.period || PeriodEnum.WEEK,
      query.limit || 20,
    );
  }

  /**
   * GET /api/v1/stats/top-templates?period=week&limit=20
   * Get top templates by download count.
   */
  @Get('stats/top-templates')
  @UseGuards(JwtAuthGuard)
  async getTopTemplates(@Query() query: QueryTopResourcesDto) {
    return this.downloadsService.getTopTemplates(
      query.period || PeriodEnum.WEEK,
      query.limit || 20,
    );
  }

  /**
   * GET /api/v1/stats/downloads?resourceType=SKILL&resourceId=xxx
   * Get download trend data for a resource.
   */
  @Get('stats/downloads')
  @UseGuards(JwtAuthGuard)
  async getDownloadTrend(@Query() query: QueryDownloadTrendDto) {
    return this.downloadsService.getDownloadTrend(
      query.resourceType,
      query.resourceId,
      query.period || PeriodEnum.MONTH,
    );
  }

  /**
   * GET /api/v1/stats/user-downloads?userId=xxx
   * Get a user's download history.
   */
  @Get('stats/user-downloads')
  @UseGuards(JwtAuthGuard)
  async getUserDownloads(@Query() query: QueryUserDownloadsDto) {
    return this.downloadsService.getUserDownloads(
      query.userId,
      query.limit || 50,
      query.offset || 0,
    );
  }

  // ==========================================================
  // Admin APIs (require ADMIN role)
  // ==========================================================

  /**
   * GET /api/v1/admin/download-logs
   * Get download logs with filtering and pagination.
   */
  @Get('admin/download-logs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getAdminDownloadLogs(@Query() query: QueryAdminDownloadLogsDto) {
    return this.downloadsService.getAdminDownloadLogs(query);
  }

  /**
   * GET /api/v1/admin/usage-report
   * Get usage report summary.
   */
  @Get('admin/usage-report')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getUsageReport() {
    return this.downloadsService.getUsageReport();
  }
}
