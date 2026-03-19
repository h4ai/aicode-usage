import { Module } from '@nestjs/common';
import { TemplatePageController } from './template-page.controller';
import { AdminDashboardController } from './admin-dashboard.controller';
import { CsvExportService } from './csv-export.service';
import { PrismaModule } from '../prisma/prisma.module';
import { DownloadsModule } from '../downloads/downloads.module';

@Module({
  imports: [PrismaModule, DownloadsModule],
  controllers: [TemplatePageController, AdminDashboardController],
  providers: [CsvExportService],
  exports: [CsvExportService],
})
export class WebModule {}
