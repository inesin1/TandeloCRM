import { describe, expect, it, vi } from 'vitest';
import { CopilotService } from './copilot.service';
import { COPILOT_LIMITS, CopilotProviderInputItem } from './copilot.types';

describe('CopilotService provider context', () => {
  it('carries permissions of admitted assistant turns and omits revoked turns', async () => {
    const rows = [
      { runId: 'current', role: 'user', text: 'Repeat it', requiredPermissions: [] },
      { runId: 'old', role: 'assistant', text: 'Lead price', requiredPermissions: ['leads:read'] },
      { runId: 'revoked', role: 'assistant', text: 'Hidden contact', requiredPermissions: ['contacts:read'] },
    ];
    const query = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue(rows) };
    const service = new CopilotService(
      { select: () => query } as never,
      { getEffectivePermissions: async () => ['leads:read'] } as never,
      {} as never,
    );
    const prompt = await service['buildProviderInput'](7, 3, 'current', null, 'UTC', new Date());
    expect(prompt.requiredPermissions).toEqual(['leads:read']);
    expect(prompt.input).toContainEqual({ role: 'assistant', content: 'Lead price' });
    expect(prompt.input).not.toContainEqual({ role: 'assistant', content: 'Hidden contact' });
  });

  it('includes current context and timezone once, redacts revoked turns, and caps serialized history', async () => {
    const currentText = 'current turn '.repeat(500);
    const rows = Array.from({ length: 21 }, (_, index) => {
      const id = 24 - index;
      const current = id === 24;
      const revoked = id === 23;
      return {
        id,
        conversationId: 3,
        runId: current ? 'run-current' : null,
        role: current || id % 2 === 0 ? 'user' : 'assistant',
        text: current
          ? currentText
          : revoked
            ? 'REDACTED-CONTENT'
            : 'x'.repeat(4000),
        sources: [],
        requiredPermissions: revoked ? ['leads:read'] : [],
        createdAt: new Date(),
      };
    });
    const query = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
    };
    const db = { select: vi.fn(() => query) };
    const permissions = {
      getEffectivePermissions: vi.fn().mockResolvedValue([]),
    };
    const service = new CopilotService(
      db as never,
      permissions as never,
      {} as never,
    );
    const build = (
      service as unknown as {
        buildProviderInput: (
          userId: number,
          conversationId: number,
          runId: string,
          context: { kind: string; id: number } | null,
          timezone: string,
          serverNow: Date,
        ) => Promise<{
          input: CopilotProviderInputItem[];
          instructions: string;
        }>;
      }
    ).buildProviderInput;

    const prompt = await build.call(
      service,
      10,
      3,
      'run-current',
      { kind: 'lead', id: 43 },
      'Asia/Tbilisi',
      new Date('2026-10-24T00:00:00.000Z'),
    );

    const serialized = JSON.stringify({
      instructions: prompt.instructions,
      input: prompt.input,
    });
    expect(serialized.length).toBeLessThanOrEqual(
      COPILOT_LIMITS.maxContextChars,
    );
    expect(
      prompt.input.filter((item) => item.content === currentText),
    ).toHaveLength(1);
    expect(serialized).not.toContain('REDACTED-CONTENT');
    expect(prompt.instructions).toContain('Asia/Tbilisi');
    expect(prompt.instructions).toContain('2026-10-24T00:00:00.000Z');
    expect(prompt.instructions).toContain('{"kind":"lead","id":43}');
    expect(prompt.instructions).toContain('Earlier chat history was omitted');
    expect(query.limit).toHaveBeenCalledWith(
      COPILOT_LIMITS.maxContextMessages + 1,
    );
    expect(query.where).toHaveBeenCalledWith(expect.anything());
  });
});
