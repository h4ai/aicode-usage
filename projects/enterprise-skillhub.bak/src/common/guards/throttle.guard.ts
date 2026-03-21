import {
  Injectable,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';

/**
 * Custom Throttle decorator metadata key.
 */
export const THROTTLE_CONFIG_KEY = 'SKILLHUB_THROTTLE_CONFIG';

/**
 * Throttle configuration interface.
 */
export interface ThrottleConfig {
  /** Requests per window */
  limit: number;
  /** Window size in seconds */
  ttl: number;
  /** Throttle by IP (true) or by user (false) */
  byIp?: boolean;
}

/**
 * Predefined throttle presets.
 */
export const ThrottlePresets = {
  /** Global default: 100 req/min */
  GLOBAL: { limit: 100, ttl: 60, byIp: false } as ThrottleConfig,
  /** Login: 10 req/min per IP */
  LOGIN: { limit: 10, ttl: 60, byIp: true } as ThrottleConfig,
  /** Search: 30 req/min per user */
  SEARCH: { limit: 30, ttl: 60, byIp: false } as ThrottleConfig,
  /** Upload: 5 req/min per user */
  UPLOAD: { limit: 5, ttl: 60, byIp: false } as ThrottleConfig,
};

/**
 * Decorator to apply specific throttle config to a route.
 * Usage: @Throttle(ThrottlePresets.LOGIN)
 */
import { SetMetadata } from '@nestjs/common';
export const Throttle = (config: ThrottleConfig) =>
  SetMetadata(THROTTLE_CONFIG_KEY, config);

/**
 * Enhanced throttle guard with per-endpoint configuration.
 *
 * Rate limits:
 * - Global: 100 req/min per user
 * - Login: 10 req/min per IP
 * - Search: 30 req/min per user
 * - Upload: 5 req/min per user
 */
@Injectable()
export class SkillHubThrottleGuard extends ThrottlerGuard {
  private readonly customLogger = new Logger(SkillHubThrottleGuard.name);

  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Determine tracking key based on route config
    const context = req['executionContext'] as ExecutionContext | undefined;
    if (context) {
      const reflector = new Reflector();
      const config = reflector.get<ThrottleConfig>(
        THROTTLE_CONFIG_KEY,
        context.getHandler(),
      );
      if (config?.byIp) {
        return this.getClientIp(req);
      }
    }

    // Default: track by user ID if authenticated, else by IP
    return req.user?.sub || this.getClientIp(req);
  }

  private getClientIp(req: Record<string, any>): string {
    return (
      req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers?.['x-real-ip'] ||
      req.ip ||
      req.connection?.remoteAddress ||
      'unknown'
    );
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
  ): Promise<void> {
    const request = context.switchToHttp().getRequest();
    this.customLogger.warn(
      `Rate limit exceeded: ${request.method} ${request.url} from ${this.getClientIp(request)}`,
    );
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests. Please try again later.',
        error: 'Too Many Requests',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
