import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { SkillsController } from './skills.controller';
import { SkillsService } from './skills.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    CacheModule.register({
      ttl: 5 * 60 * 1000, // 5 minutes default
    }),
    StorageModule,
  ],
  controllers: [SkillsController],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}
