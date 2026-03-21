import { Module } from '@nestjs/common';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { ScannerService } from './scanner/scanner.service';
import { NotificationService } from './notification/notification.service';
import { ReviewSchedulerService } from './scheduler/review-scheduler.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [ReviewController],
  providers: [
    ReviewService,
    ScannerService,
    NotificationService,
    ReviewSchedulerService,
    {
      provide: 'REDIS_CLIENT',
      useValue: {
        set: async () => 'OK',
        del: async () => 1,
      }, // placeholder — real Redis injected via ConfigModule in production
    },
  ],
  exports: [ReviewService, ScannerService],
})
export class ReviewModule {}
