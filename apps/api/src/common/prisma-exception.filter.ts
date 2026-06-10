import { type ArgumentsHost, Catch, type ExceptionFilter, Logger } from '@nestjs/common';
import { Prisma } from '@my-erp/db';
import type { Response } from 'express';

/**
 * Maps known Prisma errors to clean HTTP status codes instead of a blanket 500.
 * P2002 (unique violation — e.g. a concurrent double-accept that slips past the
 * app-level check) → 409; P2025 (record not found) → 404. Anything else is
 * logged with its code and returned as a generic 500. HttpExceptions thrown by
 * handlers/guards are NOT caught here (Nest's default filter handles them).
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('PrismaExceptionFilter');

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    switch (exception.code) {
      case 'P2002':
        res
          .status(409)
          .json({ statusCode: 409, error: 'Conflict', message: 'resource already exists' });
        return;
      case 'P2025':
        res
          .status(404)
          .json({ statusCode: 404, error: 'Not Found', message: 'resource not found' });
        return;
      default:
        this.logger.error(`Unmapped Prisma error ${exception.code}: ${exception.message}`);
        res
          .status(500)
          .json({ statusCode: 500, error: 'Internal Server Error', message: 'database error' });
    }
  }
}
