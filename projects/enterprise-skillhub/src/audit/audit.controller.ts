import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AuditService } from './audit.service';
import { QueryAuditLogsDto, ExportAuditLogsDto } from './dto/query-audit-logs.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('api/v1/admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * GET /api/v1/admin/audit-logs
   * Query audit logs with filters and pagination.
   */
  @Get()
  async findAll(@Query() query: QueryAuditLogsDto) {
    return this.auditService.findAll(query);
  }

  /**
   * GET /api/v1/admin/audit-logs/export
   * Export audit logs as CSV.
   */
  @Get('export')
  async exportCsv(@Query() query: ExportAuditLogsDto, @Res() res: Response) {
    const csv = await this.auditService.exportCsv(query);
    const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
