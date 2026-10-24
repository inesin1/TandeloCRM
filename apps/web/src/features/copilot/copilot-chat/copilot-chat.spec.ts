import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthApi } from '../../auth/auth-api';
import { CopilotApi } from '../copilot-api';
import { CopilotState } from '../copilot-state';
import { CopilotChat } from './copilot-chat';

describe('CopilotChat', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CopilotChat],
      providers: [
        provideRouter([]),
        CopilotState,
        { provide: AuthApi, useValue: { isAuthenticated: signal(true) } },
        { provide: CopilotApi, useValue: {
          status: () => of({ enabled: true, capabilities: { conversations: true, messaging: true } }),
          conversations: () => of({ items: [], nextCursor: null }),
          createConversation: () => of({ id: 1, title: 'Chat', createdAt: '', updatedAt: '' }),
          renameConversation: () => of({ id: 1, title: 'Chat', createdAt: '', updatedAt: '' }),
          deleteConversation: () => of({ deleted: true }),
          messages: () => of({ items: [], nextCursor: null }),
          sendMessage: () => of({ runId: 'run-1', status: 'completed' }),
          run: () => of({ runId: 'run-1', status: 'completed', messages: [], actions: [] }),
          cancelRun: () => of({ runId: 'run-1', status: 'cancelled' }),
          confirmAction: () => of({ id: 'action', status: 'executed' }),
          rejectAction: () => of({ id: 'action', status: 'rejected' }),
        } },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('renders assistant text as text and hides sources on a redacted message', () => {
    const state = TestBed.inject(CopilotState);
    state.status.set({ enabled: true, capabilities: { conversations: true, messaging: true } });
    state.currentConversationId.set(1);
    state.messages.set([
      { id: 1, role: 'assistant', text: '<script>alert(1)</script>', sources: [{ sourceId: 's1', kind: 'lead', id: 8, label: 'Lead 8' }], createdAt: '' },
      { id: 2, role: 'assistant', text: 'Сообщение скрыто: доступ к использованным данным отозван.', sources: [{ sourceId: 's2', kind: 'lead', id: 9, label: 'Lead 9' }], createdAt: '', redacted: true },
    ]);
    const fixture = TestBed.createComponent(CopilotChat);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('script')).toBeNull();
    expect(element.querySelector('a.source-link')?.getAttribute('href')).toBe('/leads/8');
    expect(element.textContent).toContain('<script>alert(1)</script>');
    expect(element.querySelector('a[href="/leads/9"]')).toBeNull();
    expect(element.textContent).toContain('доступ к использованным данным отозван');
  });

  it('shows the selected context and preserves each user turn’s original reference', () => {
    const state = TestBed.inject(CopilotState);
    state.status.set({ enabled: true, capabilities: { conversations: true, messaging: true } });
    state.currentConversationId.set(1);
    state.runContexts.set({ 'run-1': { kind: 'lead', id: 8 } });
    state.messages.set([
      { id: 1, role: 'user', runId: 'run-1', text: 'Summarize this', sources: [], createdAt: '' },
    ]);
    const fixture = TestBed.createComponent(CopilotChat);
    fixture.componentRef.setInput('context', { context: { kind: 'company', id: 12 }, label: 'Northwind' });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Discussing Northwind');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Context: Lead #8');
  });
});
