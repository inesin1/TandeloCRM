import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../access-control/require-permissions.decorator';
import { PipelinesService } from './pipelines.service';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';

@ApiTags('pipelines')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pipelines')
export class PipelinesController {
  constructor(private readonly pipelinesService: PipelinesService) {}

  @Post()
  @RequirePermissions('pipelines:write')
  create(@Body() dto: CreatePipelineDto) {
    return this.pipelinesService.create(dto);
  }

  @Get()
  @RequirePermissions('pipelines:read')
  findAll() {
    return this.pipelinesService.findAll();
  }

  @Get(':id')
  @RequirePermissions('pipelines:read')
  findOne(@Param('id') id: string) {
    return this.pipelinesService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('pipelines:write')
  update(@Param('id') id: string, @Body() dto: UpdatePipelineDto) {
    return this.pipelinesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('pipelines:write')
  remove(@Param('id') id: string) {
    return this.pipelinesService.remove(id);
  }
}
