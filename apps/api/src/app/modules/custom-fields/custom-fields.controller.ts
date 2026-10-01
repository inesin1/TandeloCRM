import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../access-control/require-permissions.decorator';
import { CustomFieldsService } from './custom-fields.service';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';
import { FindCustomFieldsDto } from './dto/find-custom-fields.dto';

@ApiTags('custom-fields')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('custom-fields')
export class CustomFieldsController {
  constructor(private readonly customFieldsService: CustomFieldsService) {}

  @Post()
  @RequirePermissions('custom-fields:write')
  create(@Body() dto: CreateCustomFieldDto) {
    return this.customFieldsService.create(dto);
  }

  @Get()
  @RequirePermissions('custom-fields:read')
  findAll(@Query() query: FindCustomFieldsDto) {
    return this.customFieldsService.findAll(query.entityType);
  }

  @Get(':id')
  @RequirePermissions('custom-fields:read')
  findOne(@Param('id') id: string) {
    return this.customFieldsService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('custom-fields:write')
  update(@Param('id') id: string, @Body() dto: UpdateCustomFieldDto) {
    return this.customFieldsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('custom-fields:write')
  remove(@Param('id') id: string) {
    return this.customFieldsService.remove(id);
  }
}
