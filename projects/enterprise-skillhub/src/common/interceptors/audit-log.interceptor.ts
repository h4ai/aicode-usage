import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  Optional,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    @Optional() @Inject(AuditService) private readonly auditService?: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const { method, url, ip, headers } = request;
    const userAgent = headers['user-agent'] || '';
    const user = request.user;

    return next.handle().pipe(
      tap(async () => {
        // Only log mutating operations
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
          if (this.auditService) {
            await this.auditService.log({
              action: `${method} ${url}`,
              actorId: user?.sub || null,
              ipAddress: ip,
              userAgent,
              detail: {
                method,
                url,
                statusCode: context.switchToHttp().getResponse().statusCode,
              },
            });
          }
        }
      }),
    );
  }
}
