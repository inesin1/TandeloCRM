import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm';
import { Request, Response } from 'express';
import { DatabaseError } from 'pg';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const httpException =
      exception instanceof HttpException
        ? exception
        : databaseHttpError(exception);
    const status =
      httpException?.getStatus() ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const message =
      status < HttpStatus.INTERNAL_SERVER_ERROR && httpException
        ? httpException.getResponse()
        : 'Internal server error';

    const logContext = { path: request.url, status, message };
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({ ...logContext, exception });
    } else {
      this.logger.warn(logContext);
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }
}

function databaseHttpError(exception: unknown): HttpException | undefined {
  const cause =
    exception instanceof DrizzleQueryError ? exception.cause : exception;
  if (!(cause instanceof DatabaseError)) return undefined;

  switch (cause.code) {
    case '23505':
      return new HttpException(
        'A record with this value already exists',
        HttpStatus.CONFLICT,
      );
    case '23503':
      return new HttpException(
        'The operation conflicts with a related record',
        HttpStatus.CONFLICT,
      );
    case '22P02':
    case '22003':
      return new HttpException(
        'A value has an invalid format or is out of range',
        HttpStatus.BAD_REQUEST,
      );
  }
}
