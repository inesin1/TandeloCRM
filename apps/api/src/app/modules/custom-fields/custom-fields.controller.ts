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
  create(@Body() dto: CreateCustomFieldDto) {
    return this.customFieldsService.create(dto);
  }

  @Get()
  findAll(@Query() query: FindCustomFieldsDto) {
    return this.customFieldsService.findAll(query.entityType);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customFieldsService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomFieldDto) {
    return this.customFieldsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customFieldsService.remove(id);
  }
}
