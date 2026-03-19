import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SkillsModule } from './skills/skills.module';
import { StorageModule } from './storage/storage.module';
import { SearchModule } from './search/search.module';
import { ReviewModule } from './review/review.module';
import { AuditModule } from './audit/audit.module';
import { AdminModule } from './admin/admin.module';
import { StatsModule } from './stats/stats.module';
import { SyncModule } from './sync/sync.module';
import { HealthModule } from './health/health.module';
import { MetricsController } from './common/controllers/metrics.controller';
import { MetricsMiddleware } from './common/middleware/metrics.middleware';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { SkillHubThrottleGuard } from './common/guards/throttle.guard';
import { ConfigService } from './config/config.service';

@Module({
  imports: [
    // Core
    ConfigModule,
    PrismaModule,

    // Rate limiting: global 100 req/min
    ThrottlerModule.forRoot([
      {
        name: 'global',
        ttl: 60000,
        limit: 100,
      },
    ]),

    // BullMQ
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.redisUrl,
        },
      }),
    }),

    // Feature modules
    AuthModule,
    SkillsModule,
    StorageModule,
    SearchModule,
    ReviewModule,
    AuditModule,
    AdminModule,
    StatsModule,
    SyncModule,

    // Infrastructure
    HealthModule,
  ],
  controllers: [MetricsController],
  providers: [
    // Global throttle guard
    {
      provide: APP_GUARD,
      useClass: SkillHubThrottleGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply metrics middleware to all routes
    consumer.apply(MetricsMiddleware).forRoutes('*');
  }
}
