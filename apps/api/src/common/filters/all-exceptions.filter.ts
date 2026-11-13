import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { ERROR_CODES, ErrorCode } from '@pharmacy/shared';

export interface ApiErrorResponse {
  type: string;
  title: string;
  status: number;
  code: ErrorCode | string;
  detail: string;
  errors?: Array<{ field?: string; message: string }>;
  requestId: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId =
      (request.headers['x-request-id'] as string) ||
      (request as any).id ||
      `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode | string = 'INTERNAL_ERROR';
    let title = 'Internal Server Error';
    let detail = 'An unexpected error occurred. Please contact system support.';
    let errors: Array<{ field?: string; message: string }> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        detail = res;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, any>;
        detail = body.message || body.detail || exception.message;
        code = body.code || this.mapStatusToCode(status);
        title = body.error || this.mapStatusToTitle(status);
        if (body.errors) errors = body.errors;
      }
    } else if (exception instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST;
      code = ERROR_CODES.VALIDATION_FAILED;
      title = 'Validation Failed';
      detail = 'The request payload failed input validation rules.';
      errors = exception.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = ERROR_CODES.DUPLICATE_REQUEST;
        title = 'Unique Constraint Violation';
        const target = (exception.meta?.target as string[]) || [];
        detail = `A duplicate record already exists with matching unique key (${target.join(', ')}).`;
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = ERROR_CODES.NOT_FOUND;
        title = 'Record Not Found';
        detail = 'The requested entity could not be found or has been removed.';
      } else if (exception.code === 'P2003') {
        status = HttpStatus.BAD_REQUEST;
        code = ERROR_CODES.VALIDATION_FAILED;
        title = 'Reference Constraint Violation';
        detail = 'The operation failed because an associated entity constraint was not met.';
      } else {
        status = HttpStatus.BAD_REQUEST;
        code = 'DATABASE_ERROR';
        title = 'Database Query Error';
        detail = 'A database operation could not be completed.';
      }
    } else if (exception instanceof Error) {
      detail = exception.message;
    }

    // Log the error for internal auditing (never leaking stack traces in response)
    this.logger.error(
      `[${requestId}] ${request.method} ${request.url} -> Status ${status} (${code}): ${detail}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    const errorPayload: ApiErrorResponse = {
      type: `https://pharmacy.local/errors/${String(code).toLowerCase().replace(/_/g, '-')}`,
      title,
      status,
      code,
      detail,
      errors,
      requestId,
    };

    response.status(status).json(errorPayload);
  }

  private mapStatusToCode(status: number): ErrorCode | string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return ERROR_CODES.UNAUTHENTICATED;
      case HttpStatus.FORBIDDEN:
        return ERROR_CODES.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ERROR_CODES.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.TOO_MANY_REQUESTS:
        return ERROR_CODES.RATE_LIMITED;
      case HttpStatus.BAD_REQUEST:
        return ERROR_CODES.VALIDATION_FAILED;
      default:
        return 'INTERNAL_ERROR';
    }
  }

  private mapStatusToTitle(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return 'Unauthenticated';
      case HttpStatus.FORBIDDEN:
        return 'Forbidden';
      case HttpStatus.NOT_FOUND:
        return 'Not Found';
      case HttpStatus.CONFLICT:
        return 'Conflict';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'Rate Limit Exceeded';
      case HttpStatus.BAD_REQUEST:
        return 'Bad Request';
      default:
        return 'Internal Server Error';
    }
  }
}
