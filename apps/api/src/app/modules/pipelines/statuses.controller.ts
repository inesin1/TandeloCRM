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
import { StatusesService } from './statuses.service';
import { CreateStatusDto } from './dto/create-status.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@ApiTags('statuses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pipelines/:pipelineId/statuses')
export class StatusesController {
  constructor(private readonly statusesService: StatusesService) {}

  @Post()
  @RequirePermissions('pipelines:write')
  create(
    @Param('pipelineId') pipelineId: string,
    @Body() dto: CreateStatusDto,
  ) {
    return this.statusesService.create(pipelineId, dto);
  }

  @Get()
  @RequirePermissions('pipelines:read')
  findAll(@Param('pipelineId') pipelineId: string) {
    return this.statusesService.findAll(pipelineId);
  }

  @Get(':id')
  @RequirePermissions('pipelines:read')
  findOne(@Param('pipelineId') pipelineId: string, @Param('id') id: string) {
    return this.statusesService.findOne(pipelineId, id);
  }

  @Put(':id')
  @RequirePermissions('pipelines:write')
  update(
    @Param('pipelineId') pipelineId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.statusesService.update(pipelineId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('pipelines:write')
  remove(@Param('pipelineId') pipelineId: string, @Param('id') id: string) {
    return this.statusesService.remove(pipelineId, id);
  }
}
