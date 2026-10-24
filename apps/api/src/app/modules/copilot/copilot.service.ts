import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
  MessageEvent,
  Optional,
} from '@nestjs/common';
import { and, count, desc, eq, getTableColumns, gte, gt, lt, lte, or } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { Observable } from 'rxjs';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import { Inject } from '@nestjs/common';
import { PermissionsService } from '../access-control/permissions.service';
import { users } from '../users/user.entity';
import { permissions, rolePermissions, userRoles } from '../access-control/access-control.entity';
import {
  copilotConversations,
  copilotMessages,
  copilotRuns,
} from './copilot.entity';
import { ConversationsQueryDto } from './dto/conversations-query.dto';
import { MessagesQueryDto } from './dto/messages-query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import {
  COPILOT_LIMITS,
  CopilotProviderInputItem,
} from './copilot.types';
import { CopilotCompletion, CopilotRunnerService } from './copilot-runner.service';
import { COPILOT_SYSTEM_PROMPT } from './copilot-prompt';
import { CopilotActionsService } from './copilot-actions.service';

const REDACTED_MESSAGE =
  'Сообщение скрыто: доступ к использованным данным отозван.';

@Injectable()
export class CopilotService {
  private readonly sseConnections = new Map<number, number>();

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly permissionsService: PermissionsService,
    private readonly runner: CopilotRunnerService,
    @Optional() private readonly actions?: CopilotActionsService,
  ) {}

  getStatus(enabled: boolean) {
    return {
      enabled,
      capabilities: { conversations: true, messaging: enabled },
    };
  }

  async listConversations(userId: number, query: ConversationsQueryDto) {
    const cursor = query.cursor
      ? this.decodeConversationCursor(query.cursor)
      : null;
    const conditions = [eq(copilotConversations.userId, userId)];
    if (cursor) {
      conditions.push(
        or(
          lt(copilotConversations.updatedAt, cursor.updatedAt),
          and(
            eq(copilotConversations.updatedAt, cursor.updatedAt),
            lt(copilotConversations.id, cursor.id),
          ),
        )!,
      );
    }

    const rows = await this.db
      .select()
      .from(copilotConversations)
      .where(and(...conditions))
      .orderBy(
        desc(copilotConversations.updatedAt),
        desc(copilotConversations.id),
      )
      .limit(query.limit + 1);
    const hasMore = rows.length > query.limit;
    const items = rows.slice(0, query.limit);
    return {
      items,
      nextCursor: hasMore ? this.encodeConversationCursor(items.at(-1)!) : null,
    };
  }

  async createConversation(userId: number, title?: string) {
    const [conversation] = await this.db
      .insert(copilotConversations)
      .values({ userId, title: title?.trim() || 'Новый чат' })
      .returning();
    return conversation;
  }

  async renameConversation(userId: number, id: number, title: string) {
    await this.getOwnedConversation(userId, id);
    const [conversation] = await this.db
      .update(copilotConversations)
      .set({ title: title.trim(), updatedAt: new Date() })
      .where(
        and(
          eq(copilotConversations.id, id),
          eq(copilotConversations.userId, userId),
        ),
      )
      .returning();
    return conversation;
  }

  async deleteConversation(userId: number, id: number) {
    return this.db.transaction(async (tx) => {
      const [conversation] = await tx
        .select()
        .from(copilotConversations)
        .where(
          and(
            eq(copilotConversations.id, id),
            eq(copilotConversations.userId, userId),
          ),
        )
        .for('update');
      if (!conversation) throw new NotFoundException();

      const [activeRun] = await tx
        .select({ id: copilotRuns.id })
        .from(copilotRuns)
        .where(
          and(
            eq(copilotRuns.conversationId, id),
            eq(copilotRuns.status, 'running'),
          ),
        )
        .limit(1);
      if (activeRun)
        throw new ConflictException('Conversation has an active run');

      await tx
        .delete(copilotConversations)
        .where(eq(copilotConversations.id, id));
      return { deleted: true as const };
    });
  }

  async listMessages(userId: number, id: number, query: MessagesQueryDto) {
    await this.getOwnedConversation(userId, id);
    const permissions = new Set(
      await this.permissionsService.getEffectivePermissions(userId),
    );
    const filters = [eq(copilotMessages.conversationId, id)];
    if (query.beforeId) filters.push(lt(copilotMessages.id, query.beforeId));
    const rows = await this.db
      .select({ ...getTableColumns(copilotMessages), clientRequestId: copilotRuns.clientRequestId })
      .from(copilotMessages)
      .leftJoin(copilotRuns, eq(copilotMessages.runId, copilotRuns.id))
      .where(and(...filters))
      .orderBy(desc(copilotMessages.id))
      .limit(query.limit + 1);
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit).reverse();
    return {
      items: page.map((message) => {
        const redacted =
          message.role === 'assistant' &&
          message.requiredPermissions.some(
            (permission) => !permissions.has(permission),
          );
        return {
          id: message.id,
          conversationId: message.conversationId,
          runId: message.runId,
          clientRequestId: message.role === 'user' ? message.clientRequestId : null,
          role: message.role,
          text: redacted ? REDACTED_MESSAGE : message.text,
          sources: redacted ? [] : message.sources,
          createdAt: message.createdAt,
          redacted,
        };
      }),
      nextCursor: hasMore ? (page[0]?.id ?? null) : null,
    };
  }

  async startMessage(
    userId: number,
    conversationId: number,
    dto: SendMessageDto,
  ) {
    const text = dto.text.trim();
    if (!text) throw new BadRequestException('Message cannot be empty');
    const timezone = dto.timezone.trim();
    this.validateTimezone(timezone);
    const normalized = {
      text,
      context: dto.context
        ? { kind: dto.context.kind, id: dto.context.id }
        : null,
      timezone,
    };
    const requestHash = createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex');
    const now = new Date();

    const result = await this.db.transaction(async (tx) => {
      // Serialize starts for one user; the conversation lock also serializes against deletion.
      const [user] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');
      if (!user) throw new NotFoundException();

      const [conversation] = await tx
        .select()
        .from(copilotConversations)
        .where(
          and(
            eq(copilotConversations.id, conversationId),
            eq(copilotConversations.userId, userId),
          ),
        )
        .for('update');
      if (!conversation) throw new NotFoundException();

      await tx
        .update(copilotRuns)
        .set({
          status: 'failed',
          errorCode: 'deadline_exceeded',
          finishedAt: now,
        })
        .where(
          and(
            eq(copilotRuns.userId, userId),
            eq(copilotRuns.status, 'running'),
            lte(copilotRuns.deadlineAt, now),
          ),
        );

      const [existing] = await tx
        .select()
        .from(copilotRuns)
        .where(
          and(
            eq(copilotRuns.conversationId, conversationId),
            eq(copilotRuns.clientRequestId, dto.clientRequestId),
          ),
        )
        .limit(1);
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException(
            'clientRequestId was used with a different request',
          );
        }
        return { run: existing, created: false };
      }

      const [{ value: conversationRuns }] = await tx
        .select({ value: count() })
        .from(copilotRuns)
        .where(
          and(
            eq(copilotRuns.conversationId, conversationId),
            eq(copilotRuns.status, 'running'),
          ),
        );
      if (conversationRuns >= COPILOT_LIMITS.maxActiveRunsPerConversation) {
        throw new ConflictException('Conversation already has an active run');
      }

      const [{ value: userRuns }] = await tx
        .select({ value: count() })
        .from(copilotRuns)
        .where(
          and(
            eq(copilotRuns.userId, userId),
            eq(copilotRuns.status, 'running'),
          ),
        );
      if (userRuns >= COPILOT_LIMITS.maxActiveRunsPerUser) {
        throw new ConflictException('User already has the maximum active runs');
      }

      const [{ value: recentRuns }] = await tx
        .select({ value: count() })
        .from(copilotRuns)
        .where(
          and(
            eq(copilotRuns.userId, userId),
            gte(
              copilotRuns.createdAt,
              new Date(now.getTime() - 10 * 60 * 1000),
            ),
          ),
        );
      if (recentRuns >= COPILOT_LIMITS.maxRunsPerTenMinutes) {
        throw new HttpException(
          'Copilot run limit reached',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const [run] = await tx
        .insert(copilotRuns)
        .values({
          conversationId,
          userId,
          clientRequestId: dto.clientRequestId,
          requestHash,
          context: normalized.context,
          timezone: normalized.timezone,
          deadlineAt: new Date(now.getTime() + COPILOT_LIMITS.runTimeoutMs),
        })
        .returning();
      await tx.insert(copilotMessages).values({
        conversationId,
        runId: run.id,
        role: 'user',
        text,
        sources: [],
        requiredPermissions: [],
      });
      if (conversation.title === 'Новый чат') {
        await tx
          .update(copilotConversations)
          .set({
            title: [...text].slice(0, COPILOT_LIMITS.maxTitleLength).join(''),
            updatedAt: now,
          })
          .where(eq(copilotConversations.id, conversationId));
      } else {
        await tx
          .update(copilotConversations)
          .set({ updatedAt: now })
          .where(eq(copilotConversations.id, conversationId));
      }
      return { run, created: true };
    });

    if (result.created) {
      try {
        const prompt = await this.buildProviderInput(
          userId,
          conversationId,
          result.run.id,
          result.run.context,
          result.run.timezone,
          result.run.createdAt,
        );
        this.runner.launch(
          result.run.id,
          userId,
          prompt.input,
          prompt.instructions,
          result.run.deadlineAt,
          {
            serverNow: result.run.createdAt,
            requiredPermissions: prompt.requiredPermissions,
            canStart: async () => {
              const [activeRun] = await this.db
                .select({ id: copilotRuns.id })
                .from(copilotRuns)
                .where(
                  and(
                    eq(copilotRuns.id, result.run.id),
                    eq(copilotRuns.status, 'running'),
                    gt(copilotRuns.deadlineAt, new Date()),
                  ),
                )
                .limit(1);
              return !!activeRun;
            },
            complete: (providerResult) =>
              this.completeRun(result.run.id, userId, providerResult),
            fail: (errorCode) => this.failRun(result.run.id, errorCode),
          },
        );
      } catch {
        await this.failRun(result.run.id, 'internal_error');
        return { runId: result.run.id, status: 'failed' as const };
      }
    }
    return { runId: result.run.id, status: result.run.status };
  }

  async getRun(userId: number, runId: string) {
    let run = await this.getOwnedRun(userId, runId);
    if (run.status === 'running' && run.deadlineAt <= new Date()) {
      await this.failRun(runId, 'deadline_exceeded');
      run = await this.getOwnedRun(userId, runId);
    }
    const permissions = new Set(
      await this.permissionsService.getEffectivePermissions(userId),
    );
    const rows = await this.db
      .select()
      .from(copilotMessages)
      .where(
        and(
          eq(copilotMessages.runId, runId),
          eq(copilotMessages.conversationId, run.conversationId),
        ),
      )
      .orderBy(copilotMessages.id);
    const messages = rows.map((message) => {
      const redacted =
        message.role === 'assistant' &&
        message.requiredPermissions.some(
          (permission) => !permissions.has(permission),
        );
      return {
        id: message.id,
        clientRequestId: message.role === 'user' ? run.clientRequestId : null,
        role: message.role,
        text: redacted ? REDACTED_MESSAGE : message.text,
        sources: redacted ? [] : message.sources,
        createdAt: message.createdAt,
      };
    });
    return {
      runId,
      status: run.status,
      context: run.context,
      messages,
      actions: await this.actions?.listPublishedForRun(userId, runId) ?? [],
      ...(run.errorCode ? { errorCode: run.errorCode } : {}),
      ...(run.usage ? { usage: run.usage } : {}),
    };
  }

  async streamRun(userId: number, runId: string): Promise<Observable<MessageEvent>> {
    let initialRun = await this.getOwnedRun(userId, runId);
    if (initialRun.status === 'running' && initialRun.deadlineAt <= new Date()) {
      await this.failRun(runId, 'deadline_exceeded');
      initialRun = await this.getOwnedRun(userId, runId);
    }
    const active = this.sseConnections.get(userId) ?? 0;
    if (active >= 2) throw new HttpException('Too many Copilot event streams', HttpStatus.TOO_MANY_REQUESTS);
    this.sseConnections.set(userId, active + 1);

    return new Observable<MessageEvent>((subscriber) => {
      let closed = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let lastStatus = initialRun.status;
      let lastStatusEventAt = Date.now();
      const progress = this.runner.subscribeToRunEvents(runId).subscribe((event) => {
        subscriber.next({ type: event.type, data: event.data });
      });

      const emitTerminal = async (status: string) => {
        const run = await this.getRun(userId, runId);
        if (status === 'completed') {
          for (const message of run.messages.filter((item) => item.role === 'assistant')) {
            const chars = Array.from(message.text);
            for (let index = 0; index < chars.length; index += 80) {
              subscriber.next({
                type: 'text_delta',
                data: { runId, messageId: message.id, sequence: index / 80, delta: chars.slice(index, index + 80).join('') },
              });
            }
          }
          subscriber.next({ type: 'completed', data: { runId } });
        } else {
          subscriber.next({
            type: status,
            data: { runId, ...(status === 'failed' && run.errorCode ? { errorCode: run.errorCode } : {}) },
          });
        }
        subscriber.complete();
      };

      const poll = async () => {
        if (closed) return;
        try {
          let run = await this.getOwnedRun(userId, runId);
          if (run.status === 'running' && run.deadlineAt <= new Date()) {
            await this.failRun(runId, 'deadline_exceeded');
            run = await this.getOwnedRun(userId, runId);
          }
          if (run.status !== lastStatus || Date.now() - lastStatusEventAt >= 15_000) {
            lastStatus = run.status;
            lastStatusEventAt = Date.now();
            subscriber.next({ type: 'status', data: { runId, status: run.status } });
          }
          if (run.status !== 'running') {
            await emitTerminal(run.status);
            return;
          }
          timer = setTimeout(() => void poll(), 1000);
        } catch (error) {
          subscriber.error(error);
        }
      };

      subscriber.next({ type: 'status', data: { runId, status: initialRun.status } });
      if (initialRun.status === 'running') timer = setTimeout(() => void poll(), 1000);
      else void emitTerminal(initialRun.status).catch((error) => subscriber.error(error));

      return () => {
        closed = true;
        if (timer) clearTimeout(timer);
        progress.unsubscribe();
        const remaining = (this.sseConnections.get(userId) ?? 1) - 1;
        if (remaining) this.sseConnections.set(userId, remaining);
        else this.sseConnections.delete(userId);
      };
    });
  }

  async cancelRun(userId: number, runId: string) {
    const [cancelled] = await this.db
      .update(copilotRuns)
      .set({ status: 'cancelled', finishedAt: new Date(), errorCode: null })
      .where(
        and(
          eq(copilotRuns.id, runId),
          eq(copilotRuns.userId, userId),
          eq(copilotRuns.status, 'running'),
        ),
      )
      .returning();
    if (cancelled) {
      this.runner.cancelLocal(runId);
      return { runId, status: 'cancelled' as const };
    }
    const run = await this.getOwnedRun(userId, runId);
    return { runId, status: run.status };
  }

  rejectAction(userId: number, actionId: string) {
    if (!this.actions) throw new NotFoundException();
    return this.actions.reject(userId, actionId);
  }

  confirmAction(userId: number, actionId: string) {
    if (!this.actions) throw new NotFoundException();
    return this.actions.confirm(userId, actionId);
  }

  private async completeRun(runId: string, userId: number, result: CopilotCompletion) {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const permissionRows = await tx
        .select({ key: permissions.key })
        .from(userRoles)
        .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(eq(userRoles.userId, userId));
      const current = new Set(permissionRows.map(({ key }) => key));
      if (result.requiredPermissions.some((key) => !current.has(key))) {
        await tx
          .update(copilotRuns)
          .set({ status: 'failed', errorCode: 'permissions_changed', finishedAt: now })
          .where(and(eq(copilotRuns.id, runId), eq(copilotRuns.status, 'running')));
        return false;
      }
      const [run] = await tx
        .update(copilotRuns)
        .set({
          status: 'completed',
          finishedAt: now,
          usage: result.usage ?? null,
          errorCode: null,
        })
        .where(
          and(
            eq(copilotRuns.id, runId),
            eq(copilotRuns.status, 'running'),
            gt(copilotRuns.deadlineAt, now),
          ),
        )
        .returning({
          id: copilotRuns.id,
          conversationId: copilotRuns.conversationId,
        });
      if (!run) return false;
      await tx.insert(copilotMessages).values({
        conversationId: run.conversationId,
        runId,
        role: 'assistant',
        text: result.text,
        sources: result.sources,
        requiredPermissions: result.requiredPermissions,
      });
      return true;
    });
  }

  private async failRun(runId: string, errorCode: string) {
    await this.db
      .update(copilotRuns)
      .set({ status: 'failed', errorCode, finishedAt: new Date() })
      .where(and(eq(copilotRuns.id, runId), eq(copilotRuns.status, 'running')));
  }

  private async getOwnedRun(userId: number, runId: string) {
    const [run] = await this.db
      .select()
      .from(copilotRuns)
      .where(and(eq(copilotRuns.id, runId), eq(copilotRuns.userId, userId)))
      .limit(1);
    if (!run) throw new NotFoundException();
    return run;
  }

  private validateTimezone(timezone: string) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    } catch {
      throw new BadRequestException('Invalid timezone');
    }
  }

  private async buildProviderInput(
    userId: number,
    conversationId: number,
    runId: string,
    context: { kind: string; id: number } | null,
    timezone: string,
    serverNow: Date,
  ) {
    const permissions = new Set(
      await this.permissionsService.getEffectivePermissions(userId),
    );
    const rows = await this.db
      .select()
      .from(copilotMessages)
      .where(eq(copilotMessages.conversationId, conversationId))
      .orderBy(desc(copilotMessages.id))
      .limit(COPILOT_LIMITS.maxContextMessages + 1);
    const latest = rows.slice(0, COPILOT_LIMITS.maxContextMessages).reverse();
    let truncated = rows.length > COPILOT_LIMITS.maxContextMessages;
    const allowed = latest.filter((message) => {
      const hasAccess =
        message.role !== 'assistant' ||
        message.requiredPermissions.every((permission) =>
          permissions.has(permission),
        );
      if (!hasAccess) truncated = true;
      return hasAccess;
    });
    const currentTurns = allowed.filter(
      (message) => message.runId === runId && message.role === 'user',
    );
    if (currentTurns.length !== 1) throw new Error('Current user turn missing');

    const input: CopilotProviderInputItem[] = allowed.map((message) => ({
      role: message.role,
      content: message.text,
    }));
    const contextDetails = context
      ? `Saved record context reference: ${JSON.stringify(context)}.`
      : 'No saved record context was supplied.';
    const promptContext = `Current server time (UTC): ${serverNow.toISOString()}. Current user timezone: ${timezone}. ${contextDetails}`;
    const instructions = () =>
      `${COPILOT_SYSTEM_PROMPT}\n\n${promptContext}${truncated ? '\nEarlier chat history was omitted because of context limits or changed permissions.' : ''}`;
    while (
      input.length > 1 &&
      JSON.stringify({ instructions: instructions(), input }).length >
        COPILOT_LIMITS.maxContextChars
    ) {
      input.shift();
      allowed.shift();
      truncated = true;
    }
    if (
      JSON.stringify({ instructions: instructions(), input }).length >
      COPILOT_LIMITS.maxContextChars
    ) {
      throw new Error('Current user turn exceeds context limit');
    }
    const requiredPermissions = [...new Set(allowed
      .filter((message) => message.role === 'assistant')
      .flatMap((message) => message.requiredPermissions))];
    return { input, instructions: instructions(), requiredPermissions };
  }

  private async getOwnedConversation(userId: number, id: number) {
    const [conversation] = await this.db
      .select()
      .from(copilotConversations)
      .where(
        and(
          eq(copilotConversations.id, id),
          eq(copilotConversations.userId, userId),
        ),
      )
      .limit(1);
    if (!conversation) throw new NotFoundException();
    return conversation;
  }

  private encodeConversationCursor(conversation: {
    updatedAt: Date;
    id: number;
  }) {
    return Buffer.from(
      `${conversation.updatedAt.toISOString()}|${conversation.id}`,
    ).toString('base64url');
  }

  private decodeConversationCursor(cursor: string) {
    try {
      const decoded = Buffer.from(cursor, 'base64url').toString();
      const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)\|(\d+)$/.exec(
        decoded,
      );
      const updatedAt = match && new Date(match[1]);
      const id = match && Number(match[2]);
      if (
        !updatedAt ||
        Number.isNaN(updatedAt.getTime()) ||
        !Number.isSafeInteger(id) ||
        id! < 1
      ) {
        throw new Error('invalid cursor');
      }
      return { updatedAt, id: id! };
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }
}
