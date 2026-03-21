import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as client from 'prom-client';

// Initialize default metrics (CPU, memory, event loop, GC, etc.)
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({
  prefix: 'skillhub_',
  labels: { app: 'enterprise-skillhub' },
});

// Custom metrics
export const httpRequestDuration = new client.Histogram({
  name: 'skillhub_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const httpRequestsTotal = new client.Counter({
  name: 'skillhub_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

export const httpRequestsInFlight = new client.Gauge({
  name: 'skillhub_http_requests_in_flight',
  help: 'Number of HTTP requests currently being processed',
  labelNames: ['method'],
});

export const reviewQueueSize = new client.Gauge({
  name: 'skillhub_review_queue_size',
  help: 'Number of pending reviews in queue',
});

export const searchLatency = new client.Histogram({
  name: 'skillhub_search_latency_seconds',
  help: 'Search request latency in seconds',
  labelNames: ['type'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

export const skillUploadsTotal = new client.Counter({
  name: 'skillhub_skill_uploads_total',
  help: 'Total number of skill uploads',
  labelNames: ['status'],
});

export const activeUsers = new client.Gauge({
  name: 'skillhub_active_users',
  help: 'Number of active authenticated users (last 15min)',
});

export const dbPoolConnections = new client.Gauge({
  name: 'skillhub_db_pool_connections',
  help: 'Database connection pool status',
  labelNames: ['state'],
});

/**
 * Prometheus metrics middleware.
 * Tracks request duration, count, and in-flight requests.
 */
@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  private readonly logger = new Logger(MetricsMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    const start = process.hrtime.bigint();

    httpRequestsInFlight.inc({ method: req.method });

    res.on('finish', () => {
      const duration = Number(process.hrtime.bigint() - start) / 1e9;
      const route = this.normalizeRoute(req.route?.path || req.path);
      const labels = {
        method: req.method,
        route,
        status_code: String(res.statusCode),
      };

      httpRequestDuration.observe(labels, duration);
      httpRequestsTotal.inc(labels);
      httpRequestsInFlight.dec({ method: req.method });
    });

    next();
  }

  /**
   * Normalize route to avoid cardinality explosion.
   * e.g., /api/v1/skills/123 → /api/v1/skills/:id
   */
  private normalizeRoute(path: string): string {
    return path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
      .replace(/\/\d+/g, '/:id');
  }
}
