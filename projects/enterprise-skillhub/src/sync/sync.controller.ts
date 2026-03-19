import {
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('api/v1/admin/sync')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  /**
   * POST /api/v1/admin/sync/trigger
   * Manually trigger upstream sync.
   */
  @Post('trigger')
  async triggerSync() {
    return this.syncService.triggerSync();
  }

  /**
   * GET /api/v1/admin/sync/status
   * Get sync status and queue info.
   */
  @Get('status')
  async getStatus() {
    return this.syncService.getStatus();
  }
}
