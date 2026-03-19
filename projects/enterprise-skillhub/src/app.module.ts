import { Module, Controller, Get } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SkillsModule } from './skills/skills.module';
import { StorageModule } from './storage/storage.module';
import { SearchModule } from './search/search.module';
import { ReviewModule } from './review/review.module';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from './config/config.service';

@Controller('health')
class HealthController {
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    SkillsModule,
    StorageModule,
    SearchModule,
    ReviewModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.redisUrl,
        },
      }),
    }),
  ],
  controllers: [HealthController],
})
export class AppModule {}
