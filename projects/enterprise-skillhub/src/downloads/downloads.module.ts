import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DownloadsService } from './downloads.service';
import { DownloadsController } from './downloads.controller';
import { WeeklyRefreshService } from './weekly-refresh.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  controllers: [DownloadsController],
  providers: [
    DownloadsService,
    WeeklyRefreshService,
    {
      provide: 'REDIS_CLIENT',
      useValue: {
        get: async () => null,
        set: async () => undefined,
      }, // placeholder — real Redis client injected in production
    },
  ],
  exports: [DownloadsService],
})
export class DownloadsModule {}
