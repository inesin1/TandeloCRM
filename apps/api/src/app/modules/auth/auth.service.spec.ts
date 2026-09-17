import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PublicUser, users } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

const password = 'correct-test-password';
const publicUser: PublicUser = {
  id: 7,
  email: 'alex@example.test',
  name: 'Alex',
  isActive: true,
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  updatedAt: new Date('2026-09-02T10:00:00.000Z'),
};
let passwordHash: string;

async function setup(user: typeof users.$inferSelect | null) {
  const findByEmail = vi
    .fn<(email: string) => Promise<typeof users.$inferSelect | null>>()
    .mockResolvedValue(user);
  const jwtService = new JwtService({ secret: 'unit-test-signing-secret' });
  const module = await Test.createTestingModule({
    providers: [
      { provide: UsersService, useValue: { findByEmail } },
      {
        provide: AuthService,
        useFactory: (usersService: UsersService) =>
          new AuthService(usersService, jwtService),
        inject: [UsersService],
      },
    ],
  }).compile();
  const service = module.get(AuthService);

  return { service, findByEmail, jwtService };
}

beforeAll(async () => {
  passwordHash = await argon2.hash(password);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AuthService', () => {
  describe('validateUser', () => {
    it('returns null when no user matches the supplied email', async () => {
      const { service, findByEmail } = await setup(null);

      const result = await service.validateUser(
        'missing@example.test',
        password,
      );

      expect(result).toBeNull();
      expect(findByEmail).toHaveBeenCalledExactlyOnceWith(
        'missing@example.test',
      );
    });

    it('rejects an incorrect password for an existing user', async () => {
      const { service, findByEmail } = await setup({
        ...publicUser,
        passwordHash,
      });

      const result = await service.validateUser(
        publicUser.email,
        'wrong-password',
      );

      expect(result).toBeNull();
      expect(findByEmail).toHaveBeenCalledExactlyOnceWith(publicUser.email);
    });

    it('returns the public user without the password hash when the password matches', async () => {
      const { service, findByEmail } = await setup({
        ...publicUser,
        passwordHash,
      });

      const result = await service.validateUser(publicUser.email, password);

      expect(result).toEqual(publicUser);
      expect(result).not.toHaveProperty('passwordHash');
      expect(findByEmail).toHaveBeenCalledExactlyOnceWith(publicUser.email);
    });
  });

  describe('login', () => {
    it('signs an access token containing the user id and email', async () => {
      const { service, jwtService } = await setup(null);

      const result = service.login(publicUser);

      expect(jwtService.verify(result.accessToken)).toEqual({
        sub: publicUser.id,
        email: publicUser.email,
        iat: expect.any(Number),
      });
    });
  });
});
