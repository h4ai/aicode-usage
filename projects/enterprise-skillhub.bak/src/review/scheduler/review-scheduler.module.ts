import { Module } from '@nestjs/common';
import { ReviewSchedulerService } from './review-scheduler.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationService } from '../notification/notification.service';
import { ConfigModule } from '../../config/config.module';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [ReviewSchedulerService, NotificationService],
  exports: [ReviewSchedulerService],
})
export class ReviewSchedulerModule {}
