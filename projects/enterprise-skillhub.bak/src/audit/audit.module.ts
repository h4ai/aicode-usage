import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditLogProcessor } from './audit-log.processor';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'audit-log',
    }),
  ],
  controllers: [AuditController],
  providers: [AuditService, AuditLogProcessor],
  exports: [AuditService],
})
export class AuditModule {}
