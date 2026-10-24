import { describe, expect, it } from 'vitest';
import { envSchema, validateEnv } from './env.schema';

const baseEnv = {
  DATABASE_URL: 'postgres://localhost/test',
  JWT_SECRET: 'x'.repeat(32),
};

describe('Copilot environment configuration', () => {
  it('defaults to disabled and does not require provider credentials', () => {
    expect(validateEnv(baseEnv)).toMatchObject({
      COPILOT_ENABLED: false,
    });
    expect(validateEnv(baseEnv)).not.toHaveProperty('OPENAI_API_KEY');
    expect(validateEnv(baseEnv)).not.toHaveProperty('COPILOT_MODEL');
  });

  it('parses false as false and requires key and model when enabled', () => {
    expect(
      envSchema.safeParse({ ...baseEnv, COPILOT_ENABLED: 'false' }).success,
    ).toBe(true);
    expect(
      envSchema.safeParse({ ...baseEnv, COPILOT_ENABLED: 'true' }).success,
    ).toBe(false);
    expect(
      envSchema.safeParse({
        ...baseEnv,
        COPILOT_ENABLED: 'true',
        OPENAI_API_KEY: 'secret',
        COPILOT_MODEL: 'model-name',
      }).success,
    ).toBe(true);
  });

  it('rejects unsupported boolean values', () => {
    expect(
      envSchema.safeParse({ ...baseEnv, COPILOT_ENABLED: 'yes' }).success,
    ).toBe(false);
  });

  it('supports a keyless local compatible server and rejects unsafe URLs or formats', () => {
    expect(validateEnv({ ...baseEnv, COPILOT_ENABLED: 'true', COPILOT_MODEL: 'local-model', COPILOT_API_FORMAT: 'chat-completions', COPILOT_BASE_URL: 'http://localhost:11434/v1/' })).toMatchObject({ COPILOT_BASE_URL: 'http://localhost:11434/v1', COPILOT_API_FORMAT: 'chat-completions' });
    for (const url of ['not-a-url', 'file:///etc/passwd', 'https://u:p@example.test', 'https://example.test/?key=secret']) {
      expect(envSchema.safeParse({ ...baseEnv, COPILOT_BASE_URL: url }).success).toBe(false);
      expect(envSchema.safeParse({ ...baseEnv, COPILOT_ENABLED: 'true', COPILOT_MODEL: 'test-model', COPILOT_BASE_URL: url }).success).toBe(false);
    }
    expect(envSchema.safeParse({ ...baseEnv, COPILOT_API_FORMAT: 'unknown' }).success).toBe(false);
    expect(envSchema.safeParse({ ...baseEnv, COPILOT_ENABLED: 'true', COPILOT_MODEL: 'model', COPILOT_BASE_URL: 'https://api.openai.com/custom', OPENAI_API_KEY: 'legacy' }).success).toBe(false);
  });
});
