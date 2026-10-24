import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CopilotController } from './copilot.controller';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { EmptyActionBodyDto } from './dto/empty-action-body.dto';

describe('CopilotController', () => {
  it('returns status without configuration secrets', async () => {
    const service = {
      getStatus: vi.fn().mockReturnValue({ enabled: false, capabilities: {} }),
    };
    const controller = new CopilotController(
      service as never,
      {
        getPublic: async () => ({ enabled: false }),
      } as never,
      {} as never,
    );

    expect(await controller.getStatus()).toEqual({
      enabled: false,
      capabilities: {},
    });
    expect(JSON.stringify(await controller.getStatus())).not.toContain(
      'OPENAI_API_KEY',
    );
  });

  it('returns 503 instead of starting a message when Copilot is disabled', async () => {
    const service = { startMessage: vi.fn() };
    const controller = new CopilotController(
      service as never,
      {
        getPublic: async () => ({ enabled: false }),
      } as never,
      {} as never,
    );

    await expect(
      controller.startMessage(
        5,
        {
          clientRequestId: '9c2e10b1-3e8e-42ae-9631-2a8645c07e52',
          text: 'hello',
          timezone: 'UTC',
        },
        { user: { sub: 42, email: 'user@example.test' } } as never,
      ),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(service.startMessage).not.toHaveBeenCalled();
  });

  it('takes the actor id from the authenticated request', async () => {
    const service = {
      listConversations: vi
        .fn()
        .mockResolvedValue({ items: [], nextCursor: null }),
    };
    const controller = new CopilotController(service as never, {} as never, {} as never);
    const request = { user: { sub: 42, email: 'user@example.test' } };

    await controller.listConversations({ limit: 20 }, request as never);

    expect(service.listConversations).toHaveBeenCalledWith(42, { limit: 20 });
  });

  it('confirms actions with an empty DTO and takes the actor from JWT', async () => {
    const service = { confirmAction: vi.fn().mockResolvedValue({ id: 'action-id', status: 'executed' }) };
    const controller = new CopilotController(service as never, {} as never, {} as never);

    await controller.confirmAction('action-id', {}, { user: { sub: 42, email: 'user@example.test' } } as never);

    expect(service.confirmAction).toHaveBeenCalledWith(42, 'action-id');
    const emptyBody = plainToInstance(EmptyActionBodyDto, { payload: { name: 'client patch' } });
    const errors = await validate(emptyBody, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects unknown body fields through the strict validation contract', async () => {
    const dto = plainToInstance(CreateConversationDto, {
      title: 'Chat',
      userId: 99,
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map(({ property }) => property)).toContain('userId');
  });

  it('rejects unknown message and nested context fields', async () => {
    const dto = plainToInstance(SendMessageDto, {
      clientRequestId: '9c2e10b1-3e8e-42ae-9631-2a8645c07e52',
      text: 'hello',
      timezone: 'UTC',
      role: 'system',
      context: { kind: 'lead', id: 3, userId: 99 },
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    });

    expect(errors.map(({ property }) => property)).toContain('role');
    expect(
      errors.find(({ property }) => property === 'context')?.children?.[0]
        ?.property,
    ).toBe('userId');
  });
});
