import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

export interface ErrorResponse {
  code: string;
  message: string;
  statusCode: number;
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const statusCode = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let code = 'UNKNOWN_ERROR';
    let message = exception.message;

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const resp = exceptionResponse as Record<string, unknown>;
      if (resp.code) code = resp.code as string;
      if (resp.message) {
        message = Array.isArray(resp.message)
          ? (resp.message as string[]).join('; ')
          : (resp.message as string);
      }
    }

    // Map common status codes to error codes if not explicitly set
    if (code === 'UNKNOWN_ERROR') {
      switch (statusCode) {
        case HttpStatus.UNAUTHORIZED:
          code = 'AUTH_UNAUTHORIZED';
          break;
        case HttpStatus.FORBIDDEN:
          code = 'AUTH_FORBIDDEN';
          break;
        case HttpStatus.NOT_FOUND:
          code = 'NOT_FOUND';
          break;
        case HttpStatus.CONFLICT:
          code = 'CONFLICT';
          break;
        case HttpStatus.TOO_MANY_REQUESTS:
          code = 'RATE_LIMIT_EXCEEDED';
          break;
        case HttpStatus.SERVICE_UNAVAILABLE:
          code = 'SERVICE_UNAVAILABLE';
          break;
      }
    }

    const errorResponse: ErrorResponse = {
      code,
      message,
      statusCode,
    };

    response.status(statusCode).json(errorResponse);
  }
}
