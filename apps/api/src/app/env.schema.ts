import { z } from 'zod';

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
      z.string().min(1).optional(),
    ),
    COPILOT_MODEL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
  })
  .superRefine((env, context) => {
    if (env.COPILOT_ENABLED && !env.OPENAI_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['OPENAI_API_KEY'],
        message: 'OPENAI_API_KEY is required when COPILOT_ENABLED=true',
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
