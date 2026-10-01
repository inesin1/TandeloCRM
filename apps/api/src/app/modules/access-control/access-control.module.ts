import { Global, Module } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { PermissionsService } from './permissions.service';
import { PermissionsController } from './permissions.controller';
import { PermissionsGuard } from './permissions.guard';

@Global()
@Module({
  controllers: [RolesController, PermissionsController],
  providers: [RolesService, PermissionsService, PermissionsGuard],
  exports: [RolesService, PermissionsService, PermissionsGuard],
})
export class AccessControlModule {}
