import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PermissionsService } from './permissions.service';
import { PermissionsGuard } from './permissions.guard';
import { REQUIRED_PERMISSIONS } from './permissions.constants';

function setup(required: string[] | undefined, permissions: string[] = []) {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(required),
  } as unknown as Reflector;
  const permissionsService = {
    getEffectivePermissions: vi.fn().mockResolvedValue(permissions),
  } as unknown as PermissionsService;
  const request: { user?: { sub: number; email: string } } = {
    user: { sub: 7, email: 'member@example.com' },
  };
  const context = {
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return {
    context,
    guard: new PermissionsGuard(reflector, permissionsService),
    permissionsService,
    reflector,
    request,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PermissionsGuard', () => {
  it('allows routes without permission metadata', async () => {
    const { context, guard, permissionsService } = setup(undefined);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(permissionsService.getEffectivePermissions).not.toHaveBeenCalled();
  });

  it('allows a user with one of the required permissions', async () => {
    const { context, guard, permissionsService } = setup(
      ['tasks:read', 'tasks:write'],
      ['tasks:read'],
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(permissionsService.getEffectivePermissions).toHaveBeenCalledWith(7);
  });

  it('rejects users without a required permission', async () => {
    const { context, guard } = setup(['groups:write'], ['groups:read']);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('Insufficient permissions'),
    );
  });

  it('rejects a protected route without an authenticated user', async () => {
    const { context, guard, request } = setup(['tasks:read']);
    delete request.user;

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('uses the handler and class metadata keys', async () => {
    const { context, guard, reflector } = setup(undefined);

    await guard.canActivate(context);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      REQUIRED_PERMISSIONS,
      expect.any(Array),
    );
  });
});
