export interface CopilotStatus {
  enabled: boolean;
  capabilities: { conversations: boolean; messaging: boolean };
}

export interface CopilotConversation {
  id: number;
  title: string;
  updatedAt: string;
  createdAt: string;
}

export interface CopilotMessage {
  id: number;
  conversationId?: number;
  runId?: string | null;
  clientRequestId?: string;
  role: 'user' | 'assistant';
  text: string;
  sources: CopilotSource[];
  createdAt: string;
  redacted?: boolean;
}

export interface CopilotContext {
  kind: 'lead' | 'company' | 'contact' | 'task';
  id: number;
}

export interface CopilotPanelContext {
  context: CopilotContext;
  label: string;
}

export interface CopilotSource {
  sourceId: string;
  kind: string;
  id: string | number;
  label: string;
}

export interface CopilotAction {
  id: string;
  runId: string;
  toolName: string;
  status: 'proposed' | 'rejected' | 'expired' | 'conflict' | 'executed';
  expiresAt: string;
  preview: CopilotPreview;
  result?: Record<string, unknown>;
}

export interface CopilotPreview extends Record<string, unknown> {
  operation?: string;
  kind?: string;
  recordLabel?: string;
  note?: string;
  changes?: Array<{ field: string; label: string; before: unknown; after: unknown }>;
}

export interface CopilotRun {
  runId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  context?: CopilotContext | null;
  messages: Array<Pick<CopilotMessage, 'id' | 'role' | 'text' | 'sources' | 'createdAt' | 'clientRequestId'>>;
  actions: CopilotAction[];
  errorCode?: string;
}

export interface SendMessageRequest {
  clientRequestId: string;
  text: string;
  timezone: string;
  context?: CopilotContext;
}

export interface CopilotPage<T> {
  items: T[];
  nextCursor: string | number | null;
}

export interface CopilotPendingRequest {
  conversationId: number;
  clientRequestId: string;
  text: string;
  timezone: string;
  context?: SendMessageRequest['context'];
}
