import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

/**
 * Health check endpoints for Kubernetes probes.
 * These endpoints are NOT protected by JWT auth.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Liveness probe — returns 200 if the process is alive.
   * K8s uses this to decide whether to restart the container.
   */
  @Get('live')
  live() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  /**
   * Readiness probe — returns 200 only if all dependencies are connected.
   * K8s uses this to decide whether to route traffic to the pod.
   */
  @Get('ready')
  async ready() {
    const checks = await this.healthService.checkDependencies();
    const allHealthy = Object.values(checks).every((c) => c.status === 'up');

    return {
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  /**
   * Detailed health — full dependency status for monitoring dashboards.
   */
  @Get()
  async detail() {
    const checks = await this.healthService.checkDependencies();
    const allHealthy = Object.values(checks).every((c) => c.status === 'up');

    return {
      status: allHealthy ? 'ok' : 'degraded',
      version: process.env.APP_VERSION || '0.1.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      checks,
    };
  }
}
