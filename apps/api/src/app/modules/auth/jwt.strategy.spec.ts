import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Env } from '../../env.schema';
import { UsersService } from '../users/users.service';
import { JwtPayload, JwtStrategy } from './jwt.strategy';

function setup(activeUser: { id: number; email: string } | null) {
  const usersService = {
    findActiveById: vi.fn().mockResolvedValue(activeUser),
  } as unknown as UsersService;
  const config = {
    get: vi.fn().mockReturnValue('unit-test-signing-secret'),
  } as unknown as ConfigService;

  return {
    strategy: new JwtStrategy(
      config as ConfigService<Env, true>,
      usersService,
    ),
    usersService,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('JwtStrategy', () => {
  it('validates active users against their current database record', async () => {
    const { strategy, usersService } = setup({
      id: 7,
      email: 'current@example.com',
    });
    const payload: JwtPayload = { sub: 7, email: 'old@example.com' };

    await expect(strategy.validate(payload)).resolves.toEqual({
      sub: 7,
      email: 'current@example.com',
    });
    expect(usersService.findActiveById).toHaveBeenCalledExactlyOnceWith(7);
  });

  it('rejects tokens for disabled or deleted users', async () => {
    const { strategy } = setup(null);

    await expect(
      strategy.validate({ sub: 7, email: 'alex@example.com' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
