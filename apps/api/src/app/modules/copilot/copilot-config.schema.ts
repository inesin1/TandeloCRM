import { z } from 'zod';

export const copilotApiFormats = ['responses', 'chat-completions'] as const;
export const defaultCopilotBaseUrl = 'https://api.openai.com/v1';

export const copilotBaseUrlSchema = z.string().trim().max(2048).url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
}, 'Use an HTTP(S) API base URL without credentials, query parameters or fragments').transform((value) => value.replace(/\/+$/, ''));

export type CopilotConfiguration = {
  enabled: boolean;
  apiFormat: (typeof copilotApiFormats)[number];
  baseUrl: string;
  model: string;
  apiKey?: string;
};

export type CopilotPublicSettings = Omit<CopilotConfiguration, 'apiKey'> & {
  apiKeySet: boolean;
  source: 'environment' | 'database';
};
