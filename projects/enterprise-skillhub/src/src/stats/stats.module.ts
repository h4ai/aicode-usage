import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StatsController],
  providers: [
    StatsService,
    {
      provide: 'CACHE_MANAGER',
      useValue: {
        get: async () => null,
        set: async () => undefined,
        del: async () => undefined,
      }, // placeholder — real Redis cache injected in production
    },
  ],
  exports: [StatsService],
})
export class StatsModule {}
