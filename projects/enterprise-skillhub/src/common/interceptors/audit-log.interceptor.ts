import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const { method, url, ip, headers } = request;
    const userAgent = headers['user-agent'] || '';
    const user = request.user;

    return next.handle().pipe(
      tap(async () => {
        // Only log mutating operations
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
          try {
            await this.prisma.auditLog.create({
              data: {
                action: `${method} ${url}`,
                userId: user?.sub || null,
                ip,
                userAgent,
                detail: {
                  method,
                  url,
                  statusCode: context.switchToHttp().getResponse().statusCode,
                },
              },
            });
          } catch {
            // Audit logging should never break the request
          }
        }
      }),
    );
  }
}
