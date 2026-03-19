import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SearchService } from './search.service';
import { PrismaService } from '../prisma/prisma.service';

export interface EmbeddingJobData {
  skillVersionId: string;
  text: string;
}

@Processor('embedding')
export class EmbeddingProcessor extends WorkerHost {
  private readonly logger = new Logger(EmbeddingProcessor.name);

  constructor(
    private readonly searchService: SearchService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<EmbeddingJobData>): Promise<void> {
    const { skillVersionId, text } = job.data;

    this.logger.log(
      `Processing embedding for SkillVersion ${skillVersionId}`,
    );

    try {
      const embedding = await this.searchService.generateEmbedding(text);

      if (!embedding) {
        this.logger.warn(
          `Embedding generation failed for ${skillVersionId}, will retry`,
        );
        throw new Error('Embedding generation failed');
      }

      // Store embedding using raw query (Prisma doesn't support vector natively)
      const embeddingStr = `[${embedding.join(',')}]`;
      await this.prisma.$queryRawUnsafe(
        `UPDATE "SkillVersion" SET embedding = $1::vector WHERE id = $2`,
        embeddingStr,
        skillVersionId,
      );

      this.logger.log(
        `Successfully generated embedding for SkillVersion ${skillVersionId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process embedding for ${skillVersionId}: ${error.message}`,
      );
      throw error; // BullMQ will handle retries
    }
  }
}
