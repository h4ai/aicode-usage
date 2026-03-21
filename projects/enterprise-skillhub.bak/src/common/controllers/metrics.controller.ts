import { Controller, Get, Header } from '@nestjs/common';
import * as client from 'prom-client';

/**
 * Prometheus metrics endpoint.
 * Exposes all registered metrics for scraping.
 */
@Controller('metrics')
export class MetricsController {
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return client.register.metrics();
  }
}
