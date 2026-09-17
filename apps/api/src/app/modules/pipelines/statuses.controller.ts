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
  create(
    @Param('pipelineId') pipelineId: string,
    @Body() dto: CreateStatusDto,
  ) {
    return this.statusesService.create(pipelineId, dto);
  }

  @Get()
  findAll(@Param('pipelineId') pipelineId: string) {
    return this.statusesService.findAll(pipelineId);
  }

  @Get(':id')
  findOne(@Param('pipelineId') pipelineId: string, @Param('id') id: string) {
    return this.statusesService.findOne(pipelineId, id);
  }

  @Put(':id')
  update(
    @Param('pipelineId') pipelineId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.statusesService.update(pipelineId, id, dto);
  }

  @Delete(':id')
  remove(@Param('pipelineId') pipelineId: string, @Param('id') id: string) {
    return this.statusesService.remove(pipelineId, id);
  }
}
