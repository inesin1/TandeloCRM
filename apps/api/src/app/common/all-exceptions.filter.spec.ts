import { ArgumentsHost, BadRequestException, Logger } from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter';

function captureResponse(exception: unknown) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ url: '/api/example' }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;

  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  new AllExceptionsFilter().catch(exception, host);
  return { json, status };
}

describe('AllExceptionsFilter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses a generic message for unexpected failures', () => {
    const { json, status } = captureResponse(
      new Error('Example internal detail'),
    );
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
      }),
    );
  });

  it('preserves client validation errors', () => {
    const exception = new BadRequestException(['name is required']);
    const { json, status } = captureResponse(exception);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: exception.getResponse(),
      }),
    );
  });

  it.each([
    ['23505', 409, 'A record with this value already exists'],
    ['23503', 409, 'The operation conflicts with a related record'],
    ['22P02', 400, 'A value has an invalid format or is out of range'],
  ])(
    'returns a safe HTTP error for PostgreSQL code %s',
    (code, expectedStatus, message) => {
      const error = new DatabaseError('Database details', 0, 'error');
      error.code = code;
      const { json, status } = captureResponse(
        new DrizzleQueryError('Example query', ['Sensitive value'], error),
      );

      expect(status).toHaveBeenCalledWith(expectedStatus);
      expect(json).toHaveBeenCalledWith(expect.objectContaining({ message }));
    },
  );
});
