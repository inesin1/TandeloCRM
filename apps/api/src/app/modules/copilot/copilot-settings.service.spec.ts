import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { CopilotSettingsService } from './copilot-settings.service';
import { copilotSettings } from './copilot.entity';

function setup(envOverrides: Record<string, unknown> = {}) {
  let row: typeof copilotSettings.$inferSelect | undefined;
  const env = { JWT_SECRET: 'test-only-secret'.repeat(3), COPILOT_ENABLED: false, COPILOT_API_FORMAT: 'responses', COPILOT_BASE_URL: 'https://api.openai.com/v1', COPILOT_MODEL: 'test-model', OPENAI_API_KEY: 'legacy-test-key', ...envOverrides };
  const config = { get: (key: string) => env[key as keyof typeof env] };
  const query = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn(async () => row ? [row] : []) };
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: () => query,
    insert: vi.fn(() => ({ values: vi.fn((values) => ({ onConflictDoUpdate: vi.fn(async () => { row = values; }) })) })),
  };
  const db = { ...tx, transaction: vi.fn(async (callback) => callback(tx)) };
  const service = new CopilotSettingsService(db as never, config as never);
  return { service, tx, getRow: () => row!, setRow: (value: typeof row) => { row = value; } };
}

const local = { enabled: true, apiFormat: 'chat-completions' as const, baseUrl: 'http://localhost:11434/v1/', model: 'local-model' };

describe('CopilotSettingsService', () => {
  it('falls back to env but never exposes the key in public settings', async () => {
    const { service } = setup();
    expect(await service.getEffective()).toMatchObject({ apiKey: 'legacy-test-key', enabled: false });
    const publicSettings = await service.getPublic();
    expect(publicSettings).toMatchObject({ apiKeySet: true, source: 'environment' });
    expect(JSON.stringify(publicSettings)).not.toContain('legacy-test-key');
    expect(publicSettings).not.toHaveProperty('apiKey');
  });

  it('does not forward a legacy OpenAI key to a custom env endpoint', async () => {
    const { service } = setup({ COPILOT_BASE_URL: 'http://localhost:11434/v1' });
    expect((await service.getEffective()).apiKey).toBeUndefined();
  });

  it('encrypts keys at rest, keeps them on unchanged saves and clears on endpoint change', async () => {
    const { service, tx, getRow } = setup();
    await service.save({ ...local, apiKey: 'new-test-key' });
    const firstEncrypted = getRow().apiKeyEncrypted;
    expect(firstEncrypted).toBeTruthy();
    expect(firstEncrypted).not.toContain('new-test-key');
    expect(await service.getEffective()).toMatchObject({ apiKey: 'new-test-key', baseUrl: 'http://localhost:11434/v1' });
    await service.save({ ...local, model: 'another-model' });
    expect(getRow().apiKeyEncrypted).toBe(firstEncrypted);
    const publicSettings = await service.save({ ...local, baseUrl: 'https://other.example/v1' });
    expect(publicSettings.apiKeySet).toBe(false);
    expect(getRow().apiKeyEncrypted).toBeNull();
    expect((await service.getEffective()).apiKey).toBeUndefined();
    expect(tx.execute).toHaveBeenCalled();
  });

  it('can explicitly remove a saved key and retain DB settings across reads', async () => {
    const { service } = setup();
    await service.save({ ...local, apiKey: 'test-key' });
    const settings = await service.save({ ...local, apiKey: null });
    expect(settings).toMatchObject({ enabled: true, apiKeySet: false, source: 'database' });
    expect((await service.getEffective()).apiKey).toBeUndefined();
  });

  it('fails safely on a damaged encrypted key while allowing admins to read and replace it', async () => {
    const { service, getRow } = setup();
    await service.save({ ...local, apiKey: 'test-key' });
    getRow().apiKeyEncrypted = 'damaged';
    await expect(service.getEffective()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.getPublic()).resolves.toMatchObject({ apiKeySet: true });
    await service.save({ ...local, apiKey: 'replacement' });
    expect((await service.getEffective()).apiKey).toBe('replacement');
  });

  it.each(['file:///etc/passwd', 'https://user:secret@example.test/v1', 'https://example.test/v1?key=secret', 'https://example.test/v1#fragment'])('rejects an unsafe URL: %s', async (baseUrl) => {
    const { service, tx } = setup();
    await expect(service.save({ ...local, baseUrl })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('rejects enabled empty models and header injection in credentials', async () => {
    const { service } = setup();
    await expect(service.save({ ...local, model: ' ' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.save({ ...local, apiKey: 'key\r\nHeader: value' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.save({ ...local, baseUrl: 'https://api.openai.com/v1', apiKey: null })).rejects.toBeInstanceOf(BadRequestException);
  });
});
