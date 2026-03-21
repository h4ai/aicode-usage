import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SyncService } from './sync.service';

@Processor('sync')
export class SyncProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncProcessor.name);

  constructor(private readonly syncService: SyncService) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Starting upstream sync job ${job.id}`);

    try {
      const result = await this.syncService.processSync();

      this.logger.log(
        `Sync completed: ${result.created} created, ${result.updated} updated, ` +
        `${result.skipped} skipped, ${result.failed} failed`,
      );
    } catch (error: any) {
      this.logger.error(`Sync job ${job.id} failed: ${error.message}`);
      throw error; // BullMQ handles retries
    }
  }
}
