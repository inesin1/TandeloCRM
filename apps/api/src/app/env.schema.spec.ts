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
});
