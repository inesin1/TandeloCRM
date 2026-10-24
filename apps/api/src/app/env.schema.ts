import { z } from 'zod';
import { copilotApiFormats, copilotBaseUrlSchema, defaultCopilotBaseUrl } from './modules/copilot/copilot-config.schema';

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    COPILOT_ENABLED: z
      .preprocess(
        (value) => (value === undefined || value === '' ? 'false' : value),
        z.enum(['true', 'false']),
      )
      .transform((value) => value === 'true'),
    OPENAI_API_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().trim().min(1).max(4096).regex(/^[^\r\n]+$/).optional(),
    ),
    COPILOT_API_KEY: z.preprocess((value) => value === '' ? undefined : value, z.string().trim().min(1).max(4096).regex(/^[^\r\n]+$/).optional()),
    COPILOT_BASE_URL: z.preprocess((value) => value === '' ? undefined : value, copilotBaseUrlSchema.default(defaultCopilotBaseUrl)),
    COPILOT_API_FORMAT: z.preprocess((value) => value === '' ? undefined : value, z.enum(copilotApiFormats).default('responses')),
    COPILOT_MODEL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().trim().min(1).max(200).optional(),
    ),
  })
  .superRefine((env, context) => {
    const hasApiKey = env.COPILOT_API_KEY || (env.COPILOT_BASE_URL === defaultCopilotBaseUrl && env.OPENAI_API_KEY);
    if (env.COPILOT_ENABLED && URL.canParse(env.COPILOT_BASE_URL) && new URL(env.COPILOT_BASE_URL).hostname === 'api.openai.com' && !hasApiKey) {
      context.addIssue({
        code: 'custom',
        path: ['COPILOT_API_KEY'],
        message: 'COPILOT_API_KEY is required for OpenAI when COPILOT_ENABLED=true',
      });
    }
    if (env.COPILOT_ENABLED && !env.COPILOT_MODEL) {
      context.addIssue({
        code: 'custom',
        path: ['COPILOT_MODEL'],
        message: 'COPILOT_MODEL is required when COPILOT_ENABLED=true',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return envSchema.parse(config);
}
