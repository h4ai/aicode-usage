import { Module } from '@nestjs/common';
import { NamespacesService } from './namespaces.service';
import { NamespacesController } from './namespaces.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [NamespacesController],
  providers: [NamespacesService],
  exports: [NamespacesService],
})
export class NamespacesModule {}
