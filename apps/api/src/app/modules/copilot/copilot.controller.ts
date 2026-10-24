import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  ServiceUnavailableException,
  Sse,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { Env } from '../../env.schema';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { CopilotService } from './copilot.service';
import { ConversationsQueryDto } from './dto/conversations-query.dto';
import { MessagesQueryDto } from './dto/messages-query.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { EmptyActionBodyDto } from './dto/empty-action-body.dto';

@ApiTags('copilot')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('copilot')
export class CopilotController {
  constructor(
    private readonly copilotService: CopilotService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get('status')
  getStatus() {
    return this.copilotService.getStatus(
      this.config.get('COPILOT_ENABLED', { infer: true }),
    );
  }

  @Get('conversations')
  listConversations(
    @Query() query: ConversationsQueryDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.copilotService.listConversations(request.user.sub, query);
  }

  @Post('conversations')
  createConversation(
    @Body() dto: CreateConversationDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.copilotService.createConversation(request.user.sub, dto.title);
  }

  @Patch('conversations/:id')
  renameConversation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateConversationDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.copilotService.renameConversation(
      request.user.sub,
      id,
      dto.title,
    );
  }

  @Delete('conversations/:id')
  deleteConversation(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.copilotService.deleteConversation(request.user.sub, id);
  }

  @Get('conversations/:id/messages')
  listMessages(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: MessagesQueryDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.copilotService.listMessages(request.user.sub, id, query);
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.ACCEPTED)
  startMessage(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendMessageDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    if (!this.config.get('COPILOT_ENABLED', { infer: true })) {
      throw new ServiceUnavailableException('Copilot is disabled');
    }
    return this.copilotService.startMessage(request.user.sub, id, dto);
  }

  @Get('runs/:id')
  getRun(
    @Param('id', ParseUUIDPipe) runId: string,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.copilotService.getRun(request.user.sub, runId);
  }

  @Sse('runs/:id/events')
  streamRun(
    @Param('id', ParseUUIDPipe) runId: string,
    @Req() request: Request & { user: JwtPayload },
  ): Promise<Observable<MessageEvent>> {
    return this.copilotService.streamRun(request.user.sub, runId);
  }

  @Post('runs/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelRun(
    @Param('id', ParseUUIDPipe) runId: string,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.copilotService.cancelRun(request.user.sub, runId);
  }

  @Post('actions/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectAction(
    @Param('id', ParseUUIDPipe) actionId: string,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.copilotService.rejectAction(request.user.sub, actionId);
  }

  @Post('actions/:id/confirm')
  @HttpCode(HttpStatus.OK)
  confirmAction(
    @Param('id', ParseUUIDPipe) actionId: string,
    @Body() _body: EmptyActionBodyDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.copilotService.confirmAction(request.user.sub, actionId);
  }
}
