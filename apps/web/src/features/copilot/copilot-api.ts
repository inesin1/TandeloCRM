import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { AuthApi } from '../auth/auth-api';
import { CopilotAction, CopilotConversation, CopilotMessage, CopilotPage, CopilotRun, CopilotStatus, SendMessageRequest } from './copilot-types';

@Service()
export class CopilotApi {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthApi);

  status() {
    return this.http.get<CopilotStatus>('/api/copilot/status');
  }

  conversations(cursor: string | null) {
    return this.http.get<CopilotPage<CopilotConversation>>('/api/copilot/conversations', {
      params: { limit: 20, ...(cursor ? { cursor } : {}) },
    });
  }

  createConversation() {
    return this.http.post<CopilotConversation>('/api/copilot/conversations', {});
  }

  renameConversation(id: number, title: string) {
    return this.http.patch<CopilotConversation>(`/api/copilot/conversations/${id}`, { title });
  }

  deleteConversation(id: number) {
    return this.http.delete<{ deleted: true }>(`/api/copilot/conversations/${id}`);
  }

  messages(id: number, beforeId: number | null) {
    return this.http.get<CopilotPage<CopilotMessage>>(`/api/copilot/conversations/${id}/messages`, {
      params: { limit: 50, ...(beforeId ? { beforeId } : {}) },
    });
  }

  sendMessage(id: number, request: SendMessageRequest) {
    return this.http.post<{ runId: string; status: 'running' | 'completed' | 'failed' | 'cancelled' }>(
      `/api/copilot/conversations/${id}/messages`, request,
    );
  }

  run(id: string) {
    return this.http.get<CopilotRun>(`/api/copilot/runs/${id}`);
  }

  openRunEvents(id: string, signal: AbortSignal) {
    const token = this.auth.token();
    return fetch(`/api/copilot/runs/${encodeURIComponent(id)}/events`, {
      headers: { Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal,
    });
  }

  cancelRun(id: string) {
    return this.http.post<{ runId: string; status: CopilotRun['status'] }>(`/api/copilot/runs/${id}/cancel`, {});
  }

  confirmAction(id: string) {
    return this.http.post<{ id: string; status: CopilotAction['status']; result?: Record<string, unknown> }>(`/api/copilot/actions/${id}/confirm`, {});
  }

  rejectAction(id: string) {
    return this.http.post<{ id: string; status: CopilotAction['status'] }>(`/api/copilot/actions/${id}/reject`, {});
  }
}
