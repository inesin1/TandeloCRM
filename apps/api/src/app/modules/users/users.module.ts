import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';

@Module({
  controllers: [UsersController, GroupsController],
  providers: [UsersService, GroupsService],
  exports: [UsersService, GroupsService],
})
export class UsersModule {}
