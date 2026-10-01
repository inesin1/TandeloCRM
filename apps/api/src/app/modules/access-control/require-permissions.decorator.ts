import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';
import { REQUIRED_PERMISSIONS } from './permissions.constants';

export function RequirePermissions(...permissions: string[]) {
  return applyDecorators(
    SetMetadata(REQUIRED_PERMISSIONS, permissions),
    UseGuards(PermissionsGuard),
  );
}
