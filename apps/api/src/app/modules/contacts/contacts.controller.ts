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
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { FindContactsDto } from './dto/find-contacts.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { Request } from 'express';
import { JwtPayload } from '../auth/jwt.strategy';
import { CreateRecordNoteDto } from '../record-notes/dto/create-record-note.dto';

@ApiTags('contacts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  @RequirePermissions('contacts:write')
  create(@Body() dto: CreateContactDto) {
    return this.contactsService.create(dto);
  }

  @Get()
  @RequirePermissions('contacts:read')
  findAll(@Query() filters: FindContactsDto) {
    return this.contactsService.findAll(filters);
  }

  @Get(':id')
  @RequirePermissions('contacts:read')
  findOne(@Param('id') id: string) {
    return this.contactsService.findOne(id);
  }

  @Get(':id/leads')
  @RequirePermissions('contacts:read')
  findLeads(@Param('id') id: string) {
    return this.contactsService.findLeads(id);
  }

  @Get(':id/activity')
  @RequirePermissions('contacts:read')
  findActivity(@Param('id') id: string) {
    return this.contactsService.findActivity(id);
  }

  @Post(':id/notes')
  @RequirePermissions('contacts:write')
  addNote(
    @Param('id') id: string,
    @Body() dto: CreateRecordNoteDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.contactsService.addNote(id, dto.body, request.user.sub);
  }

  @Put(':id')
  @RequirePermissions('contacts:write')
  update(@Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.contactsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('contacts:write')
  remove(@Param('id') id: string) {
    return this.contactsService.remove(id);
  }
}
