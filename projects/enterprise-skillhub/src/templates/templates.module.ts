import { Module } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NamespacesModule } from '../namespaces/namespaces.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrismaModule, NamespacesModule, StorageModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
