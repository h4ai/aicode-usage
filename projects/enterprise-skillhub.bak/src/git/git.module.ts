import { Module } from '@nestjs/common';
import { GitCredentialService } from './git-credential.service';
import { GitCredentialController } from './git-credential.controller';
import { GitCloneService } from './git-clone.service';
import { GitWebhookController } from './git-webhook.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '../config/config.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrismaModule, ConfigModule, StorageModule],
  controllers: [GitCredentialController, GitWebhookController],
  providers: [GitCredentialService, GitCloneService],
  exports: [GitCredentialService, GitCloneService],
})
export class GitModule {}
