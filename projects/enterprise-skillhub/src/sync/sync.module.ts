import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncProcessor } from './sync.processor';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    HttpModule,
    ScheduleModule.forRoot(),
    BullModule.registerQueue({
      name: 'sync',
    }),
  ],
  controllers: [SyncController],
  providers: [
    SyncService,
    SyncProcessor,
    {
      provide: 'HTTP_SERVICE',
      useFactory: () => {
        const axios = require('axios');
        return { axiosRef: axios };
      },
    },
  ],
  exports: [SyncService],
})
export class SyncModule {}
