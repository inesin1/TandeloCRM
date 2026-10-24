import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ReadableStream } from 'node:stream/web';
import { finalize, of, Subject, throwError } from 'rxjs';
import { AuthApi } from '../auth/auth-api';
import { CopilotApi } from './copilot-api';
import { CopilotState, sourceRoute } from './copilot-state';
import { CopilotAction } from './copilot-types';

const emptyPage = { items: [], nextCursor: null };
const completedRun = (runId = 'run-1') => ({ runId, status: 'completed' as const, messages: [], actions: [] });

@Component({ template: '' })
class EmptyPage {}

function eventStream(...events: string[]) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(events.join('')));
      controller.close();
    },
  });
  return { status: 200, ok: true, body } as Response;
}

function setup(overrides: Record<string, unknown> = {}) {
  const authenticated = signal(true);
  const api = {
    status: vi.fn(() => of({ enabled: true, capabilities: { conversations: true, messaging: true } })),
    conversations: vi.fn(() => of(emptyPage)),
    createConversation: vi.fn(() => of({ id: 5, title: 'Chat', createdAt: '', updatedAt: '' })),
    renameConversation: vi.fn(() => of({ id: 5, title: 'Renamed', createdAt: '', updatedAt: '' })),
    deleteConversation: vi.fn(() => of({ deleted: true as const })),
    messages: vi.fn(() => of(emptyPage)),
    sendMessage: vi.fn(() => of({ runId: 'run-1', status: 'completed' as const })),
    run: vi.fn(() => of(completedRun())),
    cancelRun: vi.fn(() => of({ runId: 'run-1', status: 'cancelled' as const })),
    confirmAction: vi.fn(() => of({ id: 'action-1', status: 'executed' as const, result: { recordId: 9 } })),
    rejectAction: vi.fn(() => of({ id: 'action-2', status: 'rejected' as const })),
    ...overrides,
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'login', component: EmptyPage }]),
      CopilotState,
      { provide: CopilotApi, useValue: api },
      { provide: AuthApi, useValue: { isAuthenticated: authenticated, logout: vi.fn(() => authenticated.set(false)) } },
    ],
  });
  return { state: TestBed.inject(CopilotState), api, authenticated };
}

describe('CopilotState', () => {
  beforeEach(() => sessionStorage.removeItem('copilot-active-run'));
  afterEach(() => {
    sessionStorage.removeItem('copilot-active-run');
    TestBed.resetTestingModule();
  });

  it('reuses the same clientRequestId after a failed send', async () => {
    const sendMessage = vi.fn()
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })))
      .mockReturnValueOnce(of({ runId: 'run-1', status: 'completed' as const }));
    const { state, api } = setup({ sendMessage });
    state.status.set({ enabled: true, capabilities: { conversations: true, messaging: true } });
    state.currentConversationId.set(5);

    await state.send('Find my latest lead');
    const pending = state.pendingRequest();
    expect(pending?.clientRequestId).toBeTruthy();
    const stored = sessionStorage.getItem('copilot-active-run');
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored ?? '{}').pending.clientRequestId).toBe(pending?.clientRequestId);
    const timezone = sendMessage.mock.calls[0][1].timezone;
    expect(state.canSend()).toBe(false);

    await state.retrySend();
    expect(sendMessage.mock.calls[1][1].clientRequestId).toBe(sendMessage.mock.calls[0][1].clientRequestId);
    expect(sendMessage.mock.calls[1][1].timezone).toBe(timezone);
    expect(api.sendMessage).toHaveBeenCalledTimes(2);
    expect(state.pendingRequest()).toBeNull();
  });

  it('restores a pending request as a run when the POST response was lost', async () => {
    const pending = { conversationId: 5, clientRequestId: 'request-1', text: 'Show open leads', timezone: 'Asia/Tbilisi' };
    sessionStorage.setItem('copilot-active-run', JSON.stringify({ runs: {}, pending }));
    const api = {
      status: vi.fn(() => of({ enabled: true, capabilities: { conversations: true, messaging: true } })),
      conversations: vi.fn(() => of(emptyPage)),
      messages: vi.fn(() => of({ items: [{ id: 10, conversationId: 5, runId: 'run-10', clientRequestId: pending.clientRequestId, role: 'user', text: pending.text, sources: [], createdAt: '' }], nextCursor: null })),
      run: vi.fn(() => of(completedRun('run-10'))),
      ...setupApiNoNetwork(),
    };
    const { state } = setup(api);

    await state.initialize();

    expect(state.activeRunId()).toBeNull();
    expect(api.run).toHaveBeenCalledWith('run-10');
    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('copilot-active-run')).toBeNull();
  });

  it('does not treat an older same-text message as an accepted pending request', async () => {
    const pending = { conversationId: 5, clientRequestId: 'request-new', text: 'Show open leads', timezone: 'UTC' };
    sessionStorage.setItem('copilot-active-run', JSON.stringify({ runs: {}, pending }));
    const api = {
      status: vi.fn(() => of({ enabled: true, capabilities: { conversations: true, messaging: true } })),
      conversations: vi.fn(() => of(emptyPage)),
      messages: vi.fn(() => of({ items: [
        { id: 10, conversationId: 5, runId: 'run-old', clientRequestId: 'request-old', role: 'user', text: pending.text, sources: [], createdAt: '' },
      ], nextCursor: null })),
      run: vi.fn(() => of(completedRun('run-old'))),
      ...setupApiNoNetwork(),
    };
    const { state } = setup(api);

    await state.initialize();

    expect(state.pendingRequest()?.clientRequestId).toBe(pending.clientRequestId);
    expect(state.activeRunId()).toBeNull();
    expect(api.run).not.toHaveBeenCalled();
  });

  it('ignores and cancels requests from a logged-out session after a new login', async () => {
    const oldPage = new Subject<{ items: Array<{ id: number; title: string; createdAt: string; updatedAt: string }>; nextCursor: null }>();
    const requestCancelled = vi.fn();
    let conversationsCall = 0;
    const conversations = vi.fn(() => {
      conversationsCall += 1;
      return conversationsCall === 1
        ? oldPage.pipe(finalize(requestCancelled))
        : of({ items: [{ id: 8, title: 'New session', createdAt: '', updatedAt: '' }], nextCursor: null });
    });
    const { state, authenticated } = setup({ conversations });

    const oldInitialization = state.initialize();
    await vi.waitFor(() => expect(conversations).toHaveBeenCalledOnce());
    authenticated.set(false);
    TestBed.tick();
    authenticated.set(true);
    TestBed.tick();
    await state.initialize();
    oldPage.next({ items: [{ id: 7, title: 'Old session', createdAt: '', updatedAt: '' }], nextCursor: null });
    await oldInitialization;

    expect(requestCancelled).toHaveBeenCalledOnce();
    expect(state.conversations().map((conversation) => conversation.id)).toEqual([8]);
  });

  it('cancels a pending send on logout and ignores its late response after login', async () => {
    const oldResponse = new Subject<{ runId: string; status: 'running' }>();
    const requestCancelled = vi.fn();
    const sendMessage = vi.fn(() => oldResponse.pipe(finalize(requestCancelled)));
    const { state, authenticated } = setup({ sendMessage });
    state.status.set({ enabled: true, capabilities: { conversations: true, messaging: true } });
    state.currentConversationId.set(5);

    const oldSend = state.send('Private question');
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
    authenticated.set(false);
    TestBed.tick();
    authenticated.set(true);
    TestBed.tick();
    state.status.set({ enabled: true, capabilities: { conversations: true, messaging: true } });
    state.currentConversationId.set(8);
    const newSessionMessage = { id: 20, conversationId: 8, role: 'user' as const, text: 'New session', sources: [], createdAt: '' };
    state.messages.set([newSessionMessage]);

    oldResponse.next({ runId: 'old-run', status: 'running' });
    await oldSend;

    expect(requestCancelled).toHaveBeenCalledOnce();
    expect(state.currentConversationId()).toBe(8);
    expect(state.activeRunId()).toBeNull();
    expect(state.messages()).toEqual([newSessionMessage]);
    expect(sessionStorage.getItem('copilot-active-run')).toBeNull();
  });

  it('recovers an active run from session storage after reload', async () => {
    sessionStorage.setItem('copilot-active-run', JSON.stringify({ runs: { 5: 'run-1' } }));
    const { state, api } = setup();
    await state.initialize();
    expect(api.run).toHaveBeenCalledWith('run-1');
    expect(sessionStorage.getItem('copilot-active-run')).toBeNull();
  });

  it('does not replace proposals after selecting A, then B, then A again', async () => {
    const delayedRun = new Subject<ReturnType<typeof completedRun>>();
    let runCalls = 0;
    const action: CopilotAction = { id: 'new-action', runId: 'run-a', toolName: 'propose_create_record', status: 'proposed', expiresAt: '', preview: {} };
    const { state, api } = setup({
      messages: vi.fn((id: number) => of({ items: [{ id, role: 'user', runId: id === 5 ? 'run-a' : null, text: 'Question', sources: [], createdAt: '' }], nextCursor: null })),
      run: vi.fn(() => ++runCalls === 1 ? delayedRun.asObservable() : of({ ...completedRun('run-a'), actions: [action] })),
    });
    const firstA = state.selectConversation(5);
    await vi.waitFor(() => expect(api.run).toHaveBeenCalledOnce());
    await state.selectConversation(6);
    await state.selectConversation(5);
    delayedRun.next(completedRun('run-a'));
    await firstA;
    expect(state.actions()).toEqual([action]);
  });

  it('does not apply a late message page or older-page append after switching conversations', async () => {
    const messageA = { id: 11, conversationId: 5, role: 'user' as const, text: 'A', sources: [], createdAt: '' };
    const messageB = { id: 22, conversationId: 6, role: 'user' as const, text: 'B', sources: [], createdAt: '' };
    type Page = { items: Array<typeof messageA>; nextCursor: number | null };
    const delayedInitialA = new Subject<Page>();
    const delayedOlderA = new Subject<Page>();
    let initialACalls = 0;
    const api = {
      ...setupApiNoNetwork(),
      messages: vi.fn((id: number, beforeId: number | null) => {
        if (id === 6) return of({ items: [messageB], nextCursor: 200 });
        if (beforeId) return delayedOlderA.asObservable();
        initialACalls += 1;
        return initialACalls === 1
          ? delayedInitialA.asObservable()
          : of({ items: [messageA], nextCursor: 100 });
      }),
    };
    const { state } = setup(api);

    const firstASelection = state.selectConversation(5);
    await vi.waitFor(() => expect(api.messages).toHaveBeenCalledOnce());
    await state.selectConversation(6);
    delayedInitialA.next({ items: [{ ...messageA, id: 10 }], nextCursor: 90 });
    await firstASelection;

    await state.selectConversation(5);
    const olderARequest = state.loadOlderMessages();
    await vi.waitFor(() => expect(api.messages).toHaveBeenCalledTimes(4));
    await state.selectConversation(6);
    delayedOlderA.next({ items: [{ ...messageA, id: 9 }], nextCursor: 80 });
    await olderARequest;

    expect(state.currentConversationId()).toBe(6);
    expect(state.messages()).toEqual([messageB]);
    expect(state.messageCursor()).toBe(200);
    expect(state.hasOlderMessages()).toBe(true);
  });

  it('restores proposals from each run in the loaded conversation page', async () => {
    const action = (id: string): CopilotAction => ({ id, runId: id, toolName: 'propose_create_record', status: 'proposed', expiresAt: '', preview: {} });
    const api = {
      status: vi.fn(() => of({ enabled: true, capabilities: { conversations: true, messaging: true } })),
      conversations: vi.fn(() => of({ items: [{ id: 5, title: 'Chat', createdAt: '', updatedAt: '' }], nextCursor: null })),
      messages: vi.fn(() => of({ items: [
        { id: 1, conversationId: 5, runId: 'run-old', role: 'user', text: 'First', sources: [], createdAt: '' },
        { id: 2, conversationId: 5, runId: 'run-new', role: 'user', text: 'Second', sources: [], createdAt: '' },
      ], nextCursor: null })),
      run: vi.fn((id: string) => of({ ...completedRun(id), actions: [action(`action-${id}`)] })),
      ...setupApiNoNetwork(),
    };
    const { state } = setup(api);

    await state.initialize();

    expect(api.run).toHaveBeenCalledWith('run-old');
    expect(api.run).toHaveBeenCalledWith('run-new');
    expect(state.actions().map((item) => item.id)).toEqual(['action-run-old', 'action-run-new']);
  });

  it('cancels the active conversation run', async () => {
    const run = vi.fn(() => of({ ...completedRun(), status: 'running' as const }));
    const cancelRun = vi.fn(() => of({ runId: 'run-1', status: 'cancelled' as const }));
    const { state } = setup({ run, cancelRun, sendMessage: vi.fn(() => of({ runId: 'run-1', status: 'running' as const })) });
    state.status.set({ enabled: true, capabilities: { conversations: true, messaging: true } });
    state.currentConversationId.set(5);
    await state.send('A question');
    await state.stop();
    expect(cancelRun).toHaveBeenCalledWith('run-1');
    expect(state.activeRunId()).toBeNull();
  });

  it('confirms and rejects proposals through their endpoints', async () => {
    const { state, api } = setup();
    const proposed = (id: string): CopilotAction => ({ id, runId: 'run-1', toolName: 'propose_create_record', status: 'proposed', expiresAt: '', preview: {} });
    state.actions.set([proposed('action-1'), proposed('action-2')]);
    await state.confirm(proposed('action-1'));
    await state.reject(proposed('action-2'));
    expect(api.confirmAction).toHaveBeenCalledWith('action-1');
    expect(api.rejectAction).toHaveBeenCalledWith('action-2');
    expect(state.actions().map((item) => item.status)).toEqual(['executed', 'rejected']);
  });

  it('keeps the sent record context on its run and reports the confirmed mutation', async () => {
    const { state } = setup({
      confirmAction: vi.fn(() => of({
        id: 'action-1',
        status: 'executed' as const,
        result: { operation: 'updated', kind: 'lead', recordId: 43, recordLabel: 'Northwind' },
      })),
    });
    state.status.set({ enabled: true, capabilities: { conversations: true, messaging: true } });
    state.currentConversationId.set(5);

    await state.send('Summarize this lead', { kind: 'lead', id: 43 });
    await state.confirm({ id: 'action-1', runId: 'run-1', toolName: 'propose_update_record', status: 'proposed', expiresAt: '', preview: {} });

    expect(state.runContexts()['run-1']).toEqual({ kind: 'lead', id: 43 });
    expect(state.confirmedMutation()).toMatchObject({ kind: 'lead', recordId: 43, operation: 'updated' });
  });

  it('keeps an active run and its captured context when the panel closes or a new card is selected', async () => {
    const { state } = setup({
      sendMessage: vi.fn(() => of({ runId: 'run-1', status: 'running' as const })),
      run: vi.fn(() => of({ ...completedRun(), status: 'running' as const, context: { kind: 'lead' as const, id: 43 } })),
    });
    state.status.set({ enabled: true, capabilities: { conversations: true, messaging: true } });
    state.currentConversationId.set(5);
    state.openPanel({ context: { kind: 'lead', id: 43 }, label: 'Old card' });

    await state.send('Keep this run', { kind: 'lead', id: 43 });
    state.closePanel();
    state.openPanel({ context: { kind: 'company', id: 12 }, label: 'New card' });

    expect(state.activeRunId()).toBe('run-1');
    expect(state.runContexts()['run-1']).toEqual({ kind: 'lead', id: 43 });
    expect(state.panelContext()?.context).toEqual({ kind: 'company', id: 12 });
    state.clear();
  });

  it('renders persisted final deltas, then reconciles the canonical run', async () => {
    const message = { id: 14, runId: 'run-1', conversationId: 5, role: 'assistant' as const, text: 'Saved answer', sources: [], createdAt: '' };
    const api = {
      ...setupApiNoNetwork(),
      sendMessage: vi.fn(() => of({ runId: 'run-1', status: 'running' as const })),
      messages: vi.fn(() => of({ items: [message], nextCursor: null })),
      openRunEvents: vi.fn(async () => ({ status: 200, ok: true, body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode([
            'event: status\ndata: {"runId":"run-1","status":"running"}\n\n',
            'event: text_delta\ndata: {"runId":"run-1","messageId":14,"sequence":0,"delta":"Saved answer"}\n\n',
            'event: completed\ndata: {"runId":"run-1"}\n\n',
          ].join('')));
          controller.close();
        },
      }) } as Response)),
      run: vi.fn(() => of({ ...completedRun(), context: { kind: 'lead' as const, id: 43 }, messages: [message] })),
    };
    const { state } = setup(api);
    state.status.set({ enabled: true, capabilities: { conversations: true, messaging: true } });
    state.currentConversationId.set(5);

    await state.send('Question', { kind: 'lead', id: 43 });
    await vi.waitFor(() => expect(state.activeRunId()).toBeNull());

    expect(api.openRunEvents).toHaveBeenCalledWith('run-1', expect.any(AbortSignal));
    expect(state.messages()).toContainEqual(message);
    expect(state.runContexts()['run-1']).toEqual({ kind: 'lead', id: 43 });
    expect(state.streamedAnswer()).toBe('');
  });

  it('reconnects after a closed stream, checks the saved run and never resends the turn', async () => {
    const message = { id: 18, runId: 'run-1', conversationId: 5, role: 'assistant' as const, text: 'Recovered', sources: [], createdAt: '' };
    let streamCount = 0;
    let runCount = 0;
    const api = {
      ...setupApiNoNetwork(),
      sendMessage: vi.fn(() => of({ runId: 'run-1', status: 'running' as const })),
      messages: vi.fn(() => of({ items: [message], nextCursor: null })),
      openRunEvents: vi.fn(async () => {
        streamCount += 1;
        return streamCount === 1
          ? eventStream('event: status\ndata: {"runId":"run-1","status":"running"}\n\n')
          : eventStream(
              'event: text_delta\ndata: {"runId":"run-1","messageId":18,"sequence":0,"delta":"Recovered"}\n\n',
              'event: completed\ndata: {"runId":"run-1"}\n\n',
            );
      }),
      run: vi.fn(() => {
        runCount += 1;
        return of(runCount === 1
          ? { ...completedRun(), status: 'running' as const, messages: [] }
          : { ...completedRun(), messages: [message] });
      }),
    };
    const { state } = setup(api);
    state.status.set({ enabled: true, capabilities: { conversations: true, messaging: true } });
    state.currentConversationId.set(5);

    await state.send('Recover this answer');
    await vi.waitFor(() => expect(state.activeRunId()).toBeNull());

    expect(api.openRunEvents).toHaveBeenCalledTimes(2);
    expect(api.run).toHaveBeenCalledTimes(2);
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    expect(state.messages()).toContainEqual(message);
  });

  it('falls back to status polling after event stream reconnects fail', async () => {
    const message = { id: 19, runId: 'run-1', conversationId: 5, role: 'assistant' as const, text: 'Polled answer', sources: [], createdAt: '' };
    let runCount = 0;
    const api = {
      ...setupApiNoNetwork(),
      sendMessage: vi.fn(() => of({ runId: 'run-1', status: 'running' as const })),
      openRunEvents: vi.fn(async () => { throw new Error('stream disconnected'); }),
      messages: vi.fn(() => of({ items: [message], nextCursor: null })),
      run: vi.fn(() => {
        runCount += 1;
        return of(runCount < 4
          ? { ...completedRun(), status: 'running' as const }
          : { ...completedRun(), messages: [message] });
      }),
    };
    const { state } = setup(api);
    state.status.set({ enabled: true, capabilities: { conversations: true, messaging: true } });
    state.currentConversationId.set(5);

    await state.send('Keep recovering');
    await vi.waitFor(() => expect(state.activeRunId()).toBeNull(), { timeout: 5000 });

    expect(api.openRunEvents).toHaveBeenCalledTimes(3);
    expect(api.run).toHaveBeenCalledTimes(4);
    expect(api.sendMessage).toHaveBeenCalledOnce();
    expect(state.messages()).toContainEqual(message);
  });

  it('deduplicates final deltas by persisted sequence and aborts the stream on Stop', async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const api = {
      ...setupApiNoNetwork(),
      sendMessage: vi.fn(() => of({ runId: 'run-1', status: 'running' as const })),
      openRunEvents: vi.fn(async () => ({
        status: 200,
        ok: true,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            streamController = controller;
            controller.enqueue(new TextEncoder().encode([
              'event: status\ndata: {"runId":"run-1","status":"running"}\n\n',
              'event: text_delta\ndata: {"runId":"run-1","messageId":14,"sequence":0,"delta":"Saved"}\n\n',
              'event: text_delta\ndata: {"runId":"run-1","messageId":14,"sequence":0,"delta":"Saved"}\n\n',
            ].join('')));
          },
        }),
      } as Response)),
      cancelRun: vi.fn(() => of({ runId: 'run-1', status: 'cancelled' as const })),
    };
    const { state } = setup(api);
    state.status.set({ enabled: true, capabilities: { conversations: true, messaging: true } });
    state.currentConversationId.set(5);

    await state.send('Question');
    await vi.waitFor(() => expect(state.streamedAnswer()).toBe('Saved'));
    await state.stop();
    streamController?.close();

    expect(api.sendMessage).toHaveBeenCalledOnce();
    expect(state.activeRunId()).toBeNull();
  });

  it('logs out through AuthApi when the event stream returns 401', async () => {
    const { state, authenticated } = setup({
      sendMessage: vi.fn(() => of({ runId: 'run-1', status: 'running' as const })),
      openRunEvents: vi.fn(async () => ({ status: 401, ok: false, body: null } as Response)),
    });
    state.status.set({ enabled: true, capabilities: { conversations: true, messaging: true } });
    state.currentConversationId.set(5);

    await state.send('Question');
    await vi.waitFor(() => expect(authenticated()).toBe(false));

    expect(state.messages()).toEqual([]);
  });

  it('clears selected panel context without removing the run history context', () => {
    const { state } = setup();
    const context = { context: { kind: 'company' as const, id: 12 }, label: 'Northwind' };
    state.openPanel(context);
    state.runContexts.set({ 'run-1': context.context });

    state.clearPanelContext();

    expect(state.panelContext()).toBeNull();
    expect(state.runContexts()['run-1']).toEqual(context.context);
  });

  it('clears local Copilot state and recovery data on logout', () => {
    const { state, authenticated } = setup();
    state.status.set({ enabled: true, capabilities: { conversations: true, messaging: true } });
    state.currentConversationId.set(5);
    state.messages.set([{ id: 1, role: 'user', text: 'private', sources: [], createdAt: '' }]);
    sessionStorage.setItem('copilot-active-run', JSON.stringify({ runs: { 5: 'run-1' } }));

    authenticated.set(false);
    TestBed.tick();

    expect(state.messages()).toEqual([]);
    expect(state.currentConversationId()).toBeNull();
    expect(sessionStorage.getItem('copilot-active-run')).toBeNull();
  });

  it('only creates links for supported record and report routes', () => {
    expect(sourceRoute({ sourceId: '1', kind: 'lead', id: 8, label: 'Lead' })).toEqual(['/leads', '8']);
    expect(sourceRoute({ sourceId: '2', kind: 'task', id: 8, label: 'Task' })).toEqual(['/tasks']);
    expect(sourceRoute({ sourceId: '3', kind: 'analytics_pipeline', id: 'pipeline:summary', label: 'Pipeline' })).toEqual(['/analytics', 'pipeline']);
    expect(sourceRoute({ sourceId: '4', kind: 'user', id: 8, label: 'Employee' })).toBeNull();
    expect(sourceRoute({ sourceId: '5', kind: 'task', id: 'javascript:alert(1)', label: 'Bad' })).toEqual(['/tasks']);
    expect(sourceRoute({ sourceId: '6', kind: 'analytics_unknown', id: 'summary', label: 'Bad' })).toBeNull();
  });
});

function setupApiNoNetwork() {
  return {
    createConversation: vi.fn(() => of({ id: 5, title: 'Chat', createdAt: '', updatedAt: '' })),
    renameConversation: vi.fn(() => of({ id: 5, title: 'Renamed', createdAt: '', updatedAt: '' })),
    deleteConversation: vi.fn(() => of({ deleted: true as const })),
    sendMessage: vi.fn(() => of({ runId: 'unexpected', status: 'completed' as const })),
    cancelRun: vi.fn(() => of({ runId: 'run-1', status: 'cancelled' as const })),
    confirmAction: vi.fn(() => of({ id: 'action-1', status: 'executed' as const, result: { recordId: 9 } })),
    rejectAction: vi.fn(() => of({ id: 'action-2', status: 'rejected' as const })),
  };
}
