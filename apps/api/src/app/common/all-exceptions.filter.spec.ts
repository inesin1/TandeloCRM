import { ArgumentsHost, BadRequestException, Logger } from '@nestjs/common';
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
    const { json, status } = captureResponse(new Error('Example internal detail'));
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 500,
      message: 'Internal server error',
    }));
  });

  it('preserves client validation errors', () => {
    const exception = new BadRequestException(['name is required']);
    const { json, status } = captureResponse(exception);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      message: exception.getResponse(),
    }));
  });
});
