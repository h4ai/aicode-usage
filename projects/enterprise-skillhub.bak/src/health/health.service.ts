import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { createClient } from 'redis';
import * as Minio from 'minio';

export interface HealthCheck {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async checkDependencies(): Promise<Record<string, HealthCheck>> {
    const [postgres, redis, minio] = await Promise.allSettled([
      this.checkPostgres(),
      this.checkRedis(),
      this.checkMinio(),
    ]);

    return {
      postgres:
        postgres.status === 'fulfilled'
          ? postgres.value
          : { status: 'down', error: String((postgres as PromiseRejectedResult).reason) },
      redis:
        redis.status === 'fulfilled'
          ? redis.value
          : { status: 'down', error: String((redis as PromiseRejectedResult).reason) },
      minio:
        minio.status === 'fulfilled'
          ? minio.value
          : { status: 'down', error: String((minio as PromiseRejectedResult).reason) },
    };
  }

  private async checkPostgres(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (error) {
      this.logger.error('PostgreSQL health check failed', error);
      return { status: 'down', latencyMs: Date.now() - start, error: String(error) };
    }
  }

  private async checkRedis(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      const client = createClient({ url: this.config.redisUrl });
      await client.connect();
      await client.ping();
      await client.disconnect();
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (error) {
      this.logger.error('Redis health check failed', error);
      return { status: 'down', latencyMs: Date.now() - start, error: String(error) };
    }
  }

  private async checkMinio(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      const client = new Minio.Client({
        endPoint: this.config.minioEndpoint,
        port: this.config.minioPort,
        useSSL: this.config.minioUseSsl,
        accessKey: this.config.minioAccessKey,
        secretKey: this.config.minioSecretKey,
      });
      await client.listBuckets();
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (error) {
      this.logger.error('MinIO health check failed', error);
      return { status: 'down', latencyMs: Date.now() - start, error: String(error) };
    }
  }
}
