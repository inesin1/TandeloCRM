export type CopilotContext = {
  kind: 'lead' | 'company' | 'contact' | 'task';
  id: number;
};

export type CopilotProviderInputItem =
  { role: 'user' | 'assistant'; content: string } | Record<string, unknown>;

export type CopilotFunctionCall = {
  id: string;
  callId: string;
  name: string;
  arguments: string;
};

export type CopilotProviderResult = {
  text: string;
  functionCalls: CopilotFunctionCall[];
  responseItems: Record<string, unknown>[];
  usage?: Record<string, number>;
};

export type CopilotRunResult = {
  runId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  messages: Array<{
    id: number;
    role: 'user' | 'assistant';
    text: string;
    sources: Record<string, unknown>[];
    createdAt: Date;
  }>;
  actions: Array<{
    id: string;
    runId: string;
    toolName: string;
    status: 'proposed' | 'rejected' | 'expired' | 'conflict' | 'executed';
    expiresAt: Date;
    preview: Record<string, unknown>;
    result?: Record<string, unknown>;
  }>;
  errorCode?: string;
  usage?: Record<string, unknown>;
};

export const COPILOT_LIMITS = {
  maxMessageLength: 8000,
  maxTitleLength: 120,
  maxActiveRunsPerConversation: 1,
  maxActiveRunsPerUser: 2,
  maxRunsPerTenMinutes: 20,
  maxProviderCalls: 6,
  maxContextMessages: 20,
  maxContextChars: 60_000,
  maxOutputTokens: 4000,
  runTimeoutMs: 90_000,
  providerTimeoutMs: 30_000,
} as const;
