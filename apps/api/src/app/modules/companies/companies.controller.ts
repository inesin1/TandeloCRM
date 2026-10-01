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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../access-control/require-permissions.decorator';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { FindCompaniesDto } from './dto/find-companies.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Request } from 'express';
import { JwtPayload } from '../auth/jwt.strategy';
import { CreateRecordNoteDto } from '../record-notes/dto/create-record-note.dto';

@ApiTags('companies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @RequirePermissions('companies:write')
  create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto);
  }

  @Get()
  @RequirePermissions('companies:read')
  findAll(@Query() filters: FindCompaniesDto) {
    return this.companiesService.findAll(filters);
  }

  @Get(':id')
  @RequirePermissions('companies:read')
  findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  @Get(':id/leads')
  @RequirePermissions('companies:read')
  findLeads(@Param('id') id: string) {
    return this.companiesService.findLeads(id);
  }

  @Get(':id/activity')
  @RequirePermissions('companies:read')
  findActivity(@Param('id') id: string) {
    return this.companiesService.findActivity(id);
  }

  @Post(':id/notes')
  @RequirePermissions('companies:write')
  addNote(
    @Param('id') id: string,
    @Body() dto: CreateRecordNoteDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.companiesService.addNote(id, dto.body, request.user.sub);
  }

  @Put(':id')
  @RequirePermissions('companies:write')
  update(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('companies:write')
  remove(@Param('id') id: string) {
    return this.companiesService.remove(id);
  }
}
