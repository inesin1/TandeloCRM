import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { JwtPayload } from '../auth/jwt.strategy';
import { REQUIRED_PERMISSIONS } from './permissions.constants';
import { PermissionsService } from './permissions.service';

type AuthenticatedRequest = Request & { user: JwtPayload };

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user?.sub) {
      throw new UnauthorizedException();
    }
    const permissions = await this.permissionsService.getEffectivePermissions(
      request.user.sub,
    );
    if (
      requiredPermissions.some((permission) => permissions.includes(permission))
    ) {
      return true;
    }

    throw new ForbiddenException('Insufficient permissions');
  }
}
