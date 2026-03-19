import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { EmbeddingProcessor } from './embedding.processor';
import { ConfigService } from '../config/config.service';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    ConfigModule,
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        timeout: config.bgeM3Timeout,
      }),
    }),
    BullModule.registerQueue({
      name: 'embedding',
    }),
  ],
  controllers: [SearchController],
  providers: [SearchService, EmbeddingProcessor],
  exports: [SearchService],
})
export class SearchModule {}
