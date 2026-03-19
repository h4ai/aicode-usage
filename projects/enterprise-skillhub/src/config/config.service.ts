import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class ConfigService {
  constructor(private readonly configService: NestConfigService) {}

  get port(): number {
    return this.configService.get<number>('PORT', 3000);
  }

  get apiPrefix(): string {
    return this.configService.get<string>('API_PREFIX', 'api/v1');
  }

  // JWT
  get jwtSecret(): string {
    return this.configService.getOrThrow<string>('JWT_SECRET');
  }

  get jwtExpiresIn(): string {
    return this.configService.get<string>('JWT_EXPIRES_IN', '12h');
  }

  // LDAP
  get ldapUrl(): string {
    return this.configService.getOrThrow<string>('LDAP_URL');
  }

  get ldapBindDn(): string {
    return this.configService.getOrThrow<string>('LDAP_BIND_DN');
  }

  get ldapBindPassword(): string {
    return this.configService.getOrThrow<string>('LDAP_BIND_PASSWORD');
  }

  get ldapSearchBase(): string {
    return this.configService.getOrThrow<string>('LDAP_SEARCH_BASE');
  }

  get ldapSearchFilter(): string {
    return this.configService.get<string>(
      'LDAP_SEARCH_FILTER',
      '(sAMAccountName={{username}})',
    );
  }

  get ldapGroupRoleMap(): Record<string, string> {
    const raw = this.configService.get<string>('LDAP_GROUP_ROLE_MAP', '{}');
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  // MinIO
  get minioEndpoint(): string {
    return this.configService.get<string>('MINIO_ENDPOINT', 'localhost');
  }

  get minioPort(): number {
    return this.configService.get<number>('MINIO_PORT', 9000);
  }

  get minioUseSsl(): boolean {
    return this.configService.get<string>('MINIO_USE_SSL', 'false') === 'true';
  }

  get minioAccessKey(): string {
    return this.configService.getOrThrow<string>('MINIO_ACCESS_KEY');
  }

  get minioSecretKey(): string {
    return this.configService.getOrThrow<string>('MINIO_SECRET_KEY');
  }

  get minioBucket(): string {
    return this.configService.get<string>('MINIO_BUCKET', 'skillhub');
  }

  // Redis
  get redisUrl(): string {
    return this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');
  }

  // CORS
  get corsOrigins(): string[] {
    const raw = this.configService.get<string>('CORS_ORIGINS', '');
    return raw
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  // BGE-M3
  get bgeM3Url(): string {
    return this.configService.get<string>('BGE_M3_URL', 'http://localhost:8080/v1/encode');
  }

  get bgeM3Timeout(): number {
    return this.configService.get<number>('BGE_M3_TIMEOUT', 5000);
  }

  get bgeM3BatchSize(): number {
    return this.configService.get<number>('BGE_M3_BATCH_SIZE', 32);
  }

  // Rate limiting
  get loginThrottleTtl(): number {
    return this.configService.get<number>('LOGIN_THROTTLE_TTL', 60);
  }

  get loginThrottleLimit(): number {
    return this.configService.get<number>('LOGIN_THROTTLE_LIMIT', 10);
  }

  // Webhook notifications
  get webhookUrl(): string {
    return this.configService.get<string>('WEBHOOK_URL', '');
  }

  get webhookType(): string {
    return this.configService.get<string>('WEBHOOK_TYPE', 'feishu');
  }
}
