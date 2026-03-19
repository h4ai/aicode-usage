import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { SkillsController } from './skills.controller';
import { SkillsService } from './skills.service';

@Module({
  imports: [
    CacheModule.register({
      ttl: 5 * 60 * 1000, // 5 minutes default
    }),
  ],
  controllers: [SkillsController],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}
