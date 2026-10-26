import { describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller';

describe('AppController', () => {
  it('returns ok for liveness probe without hitting database', () => {
    const mockDb = { execute: vi.fn() };
    const controller = new AppController(mockDb as never);

    expect(controller.getHealth()).toEqual({ status: 'ok' });
    expect(mockDb.execute).not.toHaveBeenCalled();
  });

  it('returns ok and connected when database is accessible', async () => {
    const mockDb = {
      execute: vi.fn().mockResolvedValueOnce([{ '?column?': 1 }]),
    };
    const controller = new AppController(mockDb as never);

    const result = await controller.getReadiness();
    expect(result).toEqual({ status: 'ok', database: 'connected' });
    expect(mockDb.execute).toHaveBeenCalledTimes(1);
  });

  it('throws ServiceUnavailableException when database is inaccessible', async () => {
    const mockDb = {
      execute: vi.fn().mockRejectedValueOnce(new Error('Connection terminated')),
    };
    const controller = new AppController(mockDb as never);

    await expect(controller.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(mockDb.execute).toHaveBeenCalledTimes(1);
  });
});
