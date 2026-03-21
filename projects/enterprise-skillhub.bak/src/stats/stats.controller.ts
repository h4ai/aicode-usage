import { Controller, Get, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin/stats')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'REVIEWER')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  /**
   * GET /api/v1/stats/overview
   * Dashboard overview: total skills, users, MAU, pending reviews.
   */
  @Get('overview')
  async getOverview() {
    return this.statsService.getOverview();
  }

  /**
   * GET /api/v1/stats/top-skills
   * Top 10 most installed skills.
   */
  @Get('top-skills')
  async getTopSkills() {
    return this.statsService.getTopSkills();
  }

  /**
   * GET /api/v1/stats/department-usage
   * Install count aggregated by department.
   */
  @Get('department-usage')
  async getDepartmentUsage() {
    return this.statsService.getDepartmentUsage();
  }

  /**
   * GET /api/v1/stats/review-efficiency
   * Review efficiency metrics: avg time, approval rate, timeout rate.
   */
  @Get('review-efficiency')
  async getReviewEfficiency() {
    return this.statsService.getReviewEfficiency();
  }

  /**
   * GET /api/v1/stats/trends
   * Daily trends over the last 30 days.
   */
  @Get('trends')
  async getTrends() {
    return this.statsService.getTrends();
  }
}
