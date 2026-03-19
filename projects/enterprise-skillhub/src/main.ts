import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ConfigService } from './config/config.service';
import helmet from 'helmet';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  // Global prefix
  app.setGlobalPrefix(configService.apiPrefix);

  // ==========================================
  // Security: Helmet middleware
  // ==========================================
  app.use(
    helmet({
      // Content Security Policy
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'none'"],
          frameSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      // HTTP Strict Transport Security
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
      // X-Frame-Options: DENY
      frameguard: { action: 'deny' },
      // X-Content-Type-Options: nosniff
      noSniff: true,
      // Referrer-Policy
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      // X-XSS-Protection (legacy browsers)
      xssFilter: true,
      // Hide X-Powered-By
      hidePoweredBy: true,
      // X-DNS-Prefetch-Control
      dnsPrefetchControl: { allow: false },
      // X-Download-Options (IE)
      ieNoOpen: true,
      // X-Permitted-Cross-Domain-Policies
      permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    }),
  );

  // ==========================================
  // CORS: Whitelist internal domains only
  // ==========================================
  const corsOrigins = configService.corsOrigins;
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Remaining'],
    maxAge: 3600,
  });

  // ==========================================
  // Global pipes
  // ==========================================
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // ==========================================
  // Graceful shutdown
  // ==========================================
  app.enableShutdownHooks();

  const port = configService.port;
  await app.listen(port);
  logger.log(
    `🚀 Enterprise SkillHub running on http://localhost:${port}/${configService.apiPrefix}`,
  );
  logger.log(`📊 Prometheus metrics at http://localhost:${port}/${configService.apiPrefix}/metrics`);
  logger.log(`❤️  Health checks at http://localhost:${port}/${configService.apiPrefix}/health`);
}

bootstrap();
