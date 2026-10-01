import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { FindLeadsDto } from './dto/find-leads.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../access-control/require-permissions.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { CreateLeadNoteDto } from './dto/create-lead-note.dto';

@ApiTags('leads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @RequirePermissions('leads:write')
  create(@Body() dto: CreateLeadDto) {
    return this.leadsService.create(dto);
  }

  @Get()
  @RequirePermissions('leads:read')
  findAll(@Query() filters: FindLeadsDto) {
    return this.leadsService.findAll(filters);
  }

  @Get(':id')
  @RequirePermissions('leads:read')
  findOne(@Param('id') id: string) {
    return this.leadsService.findOne(id);
  }

  @Get(':id/activity')
  @RequirePermissions('leads:read')
  findActivity(@Param('id') id: string) {
    return this.leadsService.findActivity(id);
  }

  @Post(':id/notes')
  @RequirePermissions('leads:write')
  addNote(
    @Param('id') id: string,
    @Body() dto: CreateLeadNoteDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.leadsService.addNote(id, dto.body, request.user.sub);
  }

  @Put(':id')
  @RequirePermissions('leads:write')
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.leadsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('leads:write')
  remove(@Param('id') id: string) {
    return this.leadsService.remove(id);
  }
}
