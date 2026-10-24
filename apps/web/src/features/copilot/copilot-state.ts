import { HttpErrorResponse } from '@angular/common/http';
import { computed, effect, inject, Service, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, Observable, Subject, takeUntil } from 'rxjs';
import { AuthApi } from '../auth/auth-api';
import { CopilotApi } from './copilot-api';
import { readCopilotSseStream } from './copilot-sse';
import { CopilotAction, CopilotContext, CopilotConversation, CopilotMessage, CopilotPanelContext, CopilotPendingRequest, CopilotRun, CopilotSource, CopilotStatus, SendMessageRequest } from './copilot-types';

const ACTIVE_RUN_KEY = 'copilot-active-run';

/** Builds local navigation links only for routes implemented by the application. */
export function sourceRoute(source: CopilotSource): string[] | null {
  if (source.kind === 'task') return ['/tasks'];
  const report = source.kind.startsWith('analytics_') ? source.kind.slice('analytics_'.length) : '';
  if (['pipeline', 'team', 'tasks'].includes(report)) return ['/analytics', report];
  const id = String(source.id);
  if (!/^\d+$/.test(id)) return null;
  if (source.kind === 'lead') return ['/leads', id];
  if (source.kind === 'company') return ['/companies', id];
  if (source.kind === 'contact') return ['/contacts', id];
  return null;
}

@Service()
export class CopilotState {
  private readonly api = inject(CopilotApi);
  private readonly auth = inject(AuthApi);
  private readonly router = inject(Router);
  private initialized = false;
  private initializeTask: Promise<void> | null = null;
  private sessionGeneration = 0;
  private conversationSelection = 0;
  private readonly sessionCleared = new Subject<void>();
  private readonly pollTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly streamControllers = new Map<string, AbortController>();
  private readonly activeRunsByConversation = signal<Record<number, { runId: string; status: CopilotRun['status'] }>>({});
  private confirmationSequence = 0;

  readonly panelOpen = signal(false);
  readonly panelContext = signal<CopilotPanelContext | null>(null);
  readonly runContexts = signal<Record<string, CopilotContext | null>>({});
  readonly confirmedMutation = signal<{
    sequence: number;
    operation?: string;
    kind: 'lead' | 'company' | 'contact' | 'task';
    recordId: number;
    recordLabel?: string;
  } | null>(null);
  readonly status = signal<CopilotStatus | null>(null);
  readonly conversations = signal<CopilotConversation[]>([]);
  readonly currentConversationId = signal<number | null>(null);
  readonly messages = signal<CopilotMessage[]>([]);
  readonly actions = signal<CopilotAction[]>([]);
  readonly conversationCursor = signal<string | null>(null);
  readonly messageCursor = signal<number | null>(null);
  readonly hasMoreConversations = signal(false);
  readonly hasOlderMessages = signal(false);
  readonly activeRunConversationId = computed(() => {
    const id = this.currentConversationId();
    return id !== null && this.activeRunsByConversation()[id] ? id : null;
  });
  readonly activeRunId = computed(() => {
    const id = this.activeRunConversationId();
    return id === null ? null : this.activeRunsByConversation()[id]?.runId ?? null;
  });
  readonly activeRunStatus = computed(() => {
    const id = this.activeRunConversationId();
    return id === null ? null : this.activeRunsByConversation()[id]?.status ?? null;
  });
  private readonly streamedMessages = signal<Record<string, Record<number, string>>>({});
  readonly streamedAnswer = computed(() => {
    const chunks = this.streamedMessages()[this.activeRunId() ?? ''];
    return chunks ? Object.entries(chunks).sort(([a], [b]) => Number(a) - Number(b)).map(([, value]) => value).join('') : '';
  });
  readonly pendingRequest = signal<CopilotPendingRequest | null>(null);
  private panelReturnFocus: HTMLElement | null = null;
  readonly progressTool = signal('');
  readonly busy = signal(false);
  readonly loadingMessages = signal(false);
  readonly error = signal('');
  readonly enabled = computed(() => this.status()?.enabled === true);
  readonly canSend = computed(() => this.enabled() && !!this.currentConversationId() && !this.busy() && !this.pendingRequest() && this.activeRunStatus() !== 'running');

  constructor() {
    effect(() => {
      if (!this.auth.isAuthenticated()) this.clear();
    });
  }

  openPanel(context: CopilotPanelContext | null = null, returnFocus?: HTMLElement | null) {
    this.panelContext.set(context);
    this.panelReturnFocus = returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    this.panelOpen.set(true);
  }

  closePanel() {
    this.panelOpen.set(false);
    this.panelContext.set(null);
  }

  clearPanelContext() {
    this.panelContext.set(null);
  }

  takePanelReturnFocus() {
    const element = this.panelReturnFocus;
    this.panelReturnFocus = null;
    return element;
  }

  initialize(): Promise<void> {
    if (this.initializeTask) return this.initializeTask;
    if (this.initialized) return Promise.resolve();
    const generation = this.sessionGeneration;
    this.initializeTask = this.loadInitialData(generation).finally(() => {
      if (this.isCurrent(generation)) {
        this.initialized = true;
        this.initializeTask = null;
      }
    });
    return this.initializeTask;
  }

  async loadInitialData(generation = this.sessionGeneration) {
    this.error.set('');
    try {
      const status = await this.request(this.api.status(), generation);
      if (!this.isCurrent(generation)) return;
      this.status.set(status);
      await this.loadConversations(false, generation);
      if (!this.isCurrent(generation)) return;
      const restored = this.readStoredState();
      for (const [conversationId, runId] of Object.entries(restored?.runs ?? {})) {
        this.setActiveRun(Number(conversationId), runId, 'running');
      }
      if (restored?.runs && Object.keys(restored.runs).length) {
        const [conversationId] = Object.entries(restored.runs)[0];
        const selection = ++this.conversationSelection;
        this.currentConversationId.set(Number(conversationId));
        if (!this.conversations().some((item) => item.id === Number(conversationId))) {
          this.conversations.set([{ id: Number(conversationId), title: 'Conversation', createdAt: '', updatedAt: '' }, ...this.conversations()]);
        }
        await this.loadMessages(Number(conversationId), false, generation, selection);
        if (!this.isCurrent(generation) || this.currentConversationId() !== Number(conversationId) || this.conversationSelection !== selection) return;
        await this.loadConversationRuns(Number(conversationId), generation);
        if (!this.isCurrent(generation) || this.currentConversationId() !== Number(conversationId) || this.conversationSelection !== selection) return;
        const loadedRunIds = new Set(this.messages().map((message) => message.runId));
        for (const [id, activeRunId] of Object.entries(restored.runs)) {
          if (!loadedRunIds.has(activeRunId)) void this.followRun(activeRunId, Number(id), generation);
        }
      }
      if (restored?.pending) {
        await this.restorePending(restored.pending, generation);
      } else if (!(restored?.runs && Object.keys(restored.runs).length) && this.conversations().length) {
        await this.selectConversation(this.conversations()[0].id, generation);
      }
    } catch (error) {
      if (this.isCurrent(generation)) this.error.set(this.errorMessage(error));
    }
  }

  private async restorePending(pending: CopilotPendingRequest, generation: number) {
    if (!this.isCurrent(generation)) return;
    const selection = ++this.conversationSelection;
    this.currentConversationId.set(pending.conversationId);
    if (!this.conversations().some((item) => item.id === pending.conversationId)) {
      this.conversations.set([{ id: pending.conversationId, title: 'Conversation', createdAt: '', updatedAt: '' }, ...this.conversations()]);
    }
    await this.loadMessages(pending.conversationId, false, generation, selection);
    if (!this.isCurrent(generation) || this.currentConversationId() !== pending.conversationId || this.conversationSelection !== selection) return;
    const accepted = this.messages().find((message) => message.role === 'user' && message.clientRequestId === pending.clientRequestId && message.runId);
    if (accepted?.runId) {
      this.setActiveRun(pending.conversationId, accepted.runId, 'running');
      this.setRunContext(accepted.runId, pending.context ?? null);
      this.writeStoredRun(accepted.runId, pending.conversationId);
      void this.followRun(accepted.runId, pending.conversationId, generation);
    } else {
      this.pendingRequest.set(pending);
    }
  }

  async loadConversations(append = true, generation = this.sessionGeneration) {
    const page = await this.request(this.api.conversations(append ? this.conversationCursor() : null), generation);
    if (!this.isCurrent(generation)) return;
    this.conversations.set(append ? [...this.conversations(), ...page.items] : page.items);
    this.conversationCursor.set(typeof page.nextCursor === 'string' ? page.nextCursor : null);
    this.hasMoreConversations.set(!!page.nextCursor);
  }

  async loadMoreConversations() {
    if (!this.hasMoreConversations()) return;
    const generation = this.sessionGeneration;
    try {
      await this.loadConversations(true, generation);
    } catch (error) {
      if (this.isCurrent(generation)) this.error.set(this.errorMessage(error));
    }
  }

  async createConversation() {
    const generation = this.sessionGeneration;
    this.error.set('');
    try {
      const conversation = await this.request(this.api.createConversation(), generation);
      if (!this.isCurrent(generation)) return;
      this.conversations.update((items) => [conversation, ...items]);
      await this.selectConversation(conversation.id, generation);
    } catch (error) {
      if (this.isCurrent(generation)) this.error.set(this.errorMessage(error));
    }
  }

  async renameConversation(id: number, title: string) {
    const generation = this.sessionGeneration;
    this.error.set('');
    try {
      const updated = await this.request(this.api.renameConversation(id, title), generation);
      if (!this.isCurrent(generation)) return;
      this.conversations.update((items) => items.map((item) => item.id === id ? updated : item));
    } catch (error) {
      if (this.isCurrent(generation)) this.error.set(this.errorMessage(error));
    }
  }

  async deleteConversation(id: number) {
    const generation = this.sessionGeneration;
    this.error.set('');
    try {
      await this.request(this.api.deleteConversation(id), generation);
      if (!this.isCurrent(generation)) return;
      this.conversations.update((items) => items.filter((item) => item.id !== id));
      if (this.currentConversationId() === id) {
        this.conversationSelection += 1;
        this.currentConversationId.set(null);
        this.messages.set([]);
        this.actions.set([]);
        this.messageCursor.set(null);
        this.hasOlderMessages.set(false);
      }
    } catch (error) {
      if (this.isCurrent(generation)) this.error.set(error instanceof HttpErrorResponse && error.status === 409
        ? 'This chat has an active run. Stop it before deleting the chat.'
        : this.errorMessage(error));
    }
  }

  async selectConversation(id: number, generation = this.sessionGeneration) {
    if (!this.isCurrent(generation)) return;
    const selection = ++this.conversationSelection;
    this.currentConversationId.set(id);
    this.messages.set([]);
    this.actions.set([]);
    this.messageCursor.set(null);
    this.hasOlderMessages.set(false);
    await this.loadMessages(id, false, generation, selection);
    if (!this.isCurrent(generation) || this.currentConversationId() !== id || this.conversationSelection !== selection) return;
    await this.loadConversationRuns(id, generation);
  }

  private async loadConversationRuns(conversationId: number, generation: number, selection = this.conversationSelection) {
    const runIds = [...new Set(this.messages().map((message) => message.runId).filter((id): id is string => !!id))];
    const allActions = new Map<string, CopilotAction>();
    for (const runId of runIds) {
      if (!this.isCurrent(generation) || this.currentConversationId() !== conversationId || this.conversationSelection !== selection) return;
      try {
        const run = await this.request(this.api.run(runId), generation);
        if (!this.isCurrent(generation) || this.currentConversationId() !== conversationId || this.conversationSelection !== selection) return;
        this.setRunContext(runId, run.context ?? null);
        for (const action of run.actions) allActions.set(action.id, action);
        if (run.status === 'running') {
          this.setActiveRun(conversationId, runId, run.status);
          void this.followRun(runId, conversationId, generation);
        }
      } catch (error) {
        if (this.isCurrent(generation) && this.currentConversationId() === conversationId && this.conversationSelection === selection) this.error.set(this.errorMessage(error));
      }
    }
    if (this.isCurrent(generation) && this.currentConversationId() === conversationId && this.conversationSelection === selection) this.actions.set([...allActions.values()]);
  }

  async loadOlderMessages() {
    const id = this.currentConversationId();
    if (!id || !this.hasOlderMessages() || this.loadingMessages()) return;
    await this.loadMessages(id, true, this.sessionGeneration);
  }

  private async loadMessages(id: number, older: boolean, generation = this.sessionGeneration, selection = this.conversationSelection) {
    if (!this.isCurrent(generation) || this.currentConversationId() !== id || this.conversationSelection !== selection) return;
    this.loadingMessages.set(true);
    try {
      const page = await this.request(this.api.messages(id, older ? this.messageCursor() : null), generation);
      if (!this.isCurrent(generation) || this.currentConversationId() !== id || this.conversationSelection !== selection) return;
      this.messages.set(older
        ? [...page.items, ...this.messages()]
        : page.items);
      this.messageCursor.set(typeof page.nextCursor === 'number' ? page.nextCursor : null);
      this.hasOlderMessages.set(!!page.nextCursor);
    } catch (error) {
      if (this.isCurrent(generation) && this.currentConversationId() === id && this.conversationSelection === selection) this.error.set(this.errorMessage(error));
    } finally {
      if (this.isCurrent(generation) && this.currentConversationId() === id && this.conversationSelection === selection) this.loadingMessages.set(false);
    }
  }

  async send(text: string, context?: SendMessageRequest['context']) {
    const conversationId = this.currentConversationId();
    if (!conversationId || !this.canSend() || !text.trim()) return;
    const pending = {
      conversationId,
      clientRequestId: crypto.randomUUID(),
      text: text.trim(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      ...(context ? { context } : {}),
    };
    this.pendingRequest.set(pending);
    this.writeStoredPending(pending);
    await this.submitPending(this.sessionGeneration);
  }

  async retrySend() {
    if (this.pendingRequest()) await this.submitPending(this.sessionGeneration);
  }

  private async submitPending(generation: number) {
    const pending = this.pendingRequest();
    if (!pending || this.busy() || !this.isCurrent(generation)) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const response = await this.request(this.api.sendMessage(pending.conversationId, {
        clientRequestId: pending.clientRequestId,
        text: pending.text,
        timezone: pending.timezone || 'UTC',
        ...(pending.context ? { context: pending.context } : {}),
      }), generation);
      if (!this.isCurrent(generation)) return;
      this.pendingRequest.set(null);
      this.setActiveRun(pending.conversationId, response.runId, response.status);
      this.setRunContext(response.runId, pending.context ?? null);
      this.writeStoredRun(response.runId, pending.conversationId);
      await this.loadMessages(pending.conversationId, false, generation);
      if (!this.isCurrent(generation)) return;
      if (response.status === 'running') void this.followRun(response.runId, pending.conversationId, generation);
      else this.finishRun(pending.conversationId);
    } catch (error) {
      if (this.isCurrent(generation)) this.error.set(this.errorMessage(error));
    } finally {
      if (this.isCurrent(generation)) this.busy.set(false);
    }
  }

  async stop() {
    const generation = this.sessionGeneration;
    const runId = this.activeRunId();
    const conversationId = this.currentConversationId();
    if (!runId || conversationId === null) return;
    try {
      const result = await this.request(this.api.cancelRun(runId), generation);
      if (!this.isCurrent(generation)) return;
      this.setActiveRun(conversationId, runId, result.status);
      if (result.status !== 'running') {
        this.finishRun(conversationId);
        if (result.status === 'cancelled') this.error.set('The response was stopped.');
      }
    } catch (error) {
      if (this.isCurrent(generation)) this.error.set(this.errorMessage(error));
    }
  }

  async confirm(action: CopilotAction) {
    await this.updateAction(action, () => this.api.confirmAction(action.id));
  }

  async reject(action: CopilotAction) {
    await this.updateAction(action, () => this.api.rejectAction(action.id));
  }

  private async updateAction(action: CopilotAction, request: () => Observable<{
    id: string;
    status: CopilotAction['status'];
    result?: Record<string, unknown>;
  }>) {
    const generation = this.sessionGeneration;
    this.error.set('');
    try {
      const result = await this.request(request(), generation);
      if (!this.isCurrent(generation)) return;
      this.actions.update((items) => items.map((item) => item.id === action.id
        ? { ...item, status: result.status, ...(result.result ? { result: result.result } : {}) }
        : item));
      if (result.status === 'executed' && result.result) {
        this.recordConfirmedMutation(result.result);
      }
    } catch (error) {
      if (this.isCurrent(generation)) this.error.set(this.errorMessage(error));
    }
  }

  private async pollRun(runId: string, conversationId: number, generation: number) {
    if (!this.isCurrent(generation)) return;
    if (this.activeRunsByConversation()[conversationId]?.runId !== runId) return;
    const timer = this.pollTimers.get(conversationId);
    if (timer) clearTimeout(timer);
    try {
      const run = await this.request(this.api.run(runId), generation);
      if (!this.isCurrent(generation)) return;
      if (this.activeRunsByConversation()[conversationId]?.runId !== runId) return;
      this.mergeRun(run, conversationId);
      if (run.status === 'running') {
        this.pollTimers.set(conversationId, setTimeout(() => void this.pollRun(runId, conversationId, generation), 1200));
      } else {
        if (run.status === 'failed') this.error.set(this.runErrorMessage(run.errorCode));
        this.finishRun(conversationId);
        await this.loadMessages(conversationId, false, generation);
      }
    } catch (error) {
      if (!this.isCurrent(generation) || this.activeRunsByConversation()[conversationId]?.runId !== runId) return;
      this.error.set(this.errorMessage(error));
      this.pollTimers.set(conversationId, setTimeout(() => void this.pollRun(runId, conversationId, generation), 3000));
    }
  }

  private async followRun(runId: string, conversationId: number, generation: number) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (!this.isCurrent(generation) || this.activeRunsByConversation()[conversationId]?.runId !== runId) return;
      const controller = new AbortController();
      this.streamControllers.set(runId, controller);
      try {
        const response = await this.api.openRunEvents(runId, controller.signal);
        if (!this.isCurrent(generation)) return;
        if (response.status === 401) {
          this.auth.logout();
          void this.router.navigateByUrl('/login').catch(() => undefined);
          return;
        }
        if (!response.ok || !response.body) throw new Error('Copilot event stream unavailable');
        await readCopilotSseStream(response.body, async (event) => {
          await this.handleRunEvent(runId, conversationId, event.type, event.data, generation);
        });
      } catch {
        if (controller.signal.aborted || !this.isCurrent(generation) || this.activeRunsByConversation()[conversationId]?.runId !== runId) return;
      } finally {
        if (this.streamControllers.get(runId) === controller) this.streamControllers.delete(runId);
      }
      if (!this.isCurrent(generation) || this.activeRunsByConversation()[conversationId]?.runId !== runId) return;
      if (await this.refreshRun(runId, conversationId, generation)) return;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
    if (this.isCurrent(generation) && this.activeRunsByConversation()[conversationId]?.runId === runId) {
      this.error.set('Live updates are unavailable. Continuing with status checks.');
      await this.pollRun(runId, conversationId, generation);
    }
  }

  private async handleRunEvent(runId: string, conversationId: number, type: string, rawData: string, generation: number) {
    let data: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(rawData);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      data = parsed as Record<string, unknown>;
    } catch {
      return;
    }
    if (!this.isCurrent(generation) || data['runId'] !== runId || this.activeRunsByConversation()[conversationId]?.runId !== runId) return;
    if (type === 'tool_started') {
      this.progressTool.set(typeof data['tool'] === 'string' ? data['tool'] : '');
    } else if (type === 'tool_finished') {
      this.progressTool.set('');
    } else if (type === 'text_delta') {
      const messageId = Number(data['messageId']);
      const sequence = Number(data['sequence']);
      const delta = data['delta'];
      if (!Number.isSafeInteger(messageId) || messageId < 1 || !Number.isSafeInteger(sequence) || sequence < 0 || typeof delta !== 'string' || delta.length > 200) return;
      this.streamedMessages.update((all) => ({
        ...all,
        [runId]: { ...(all[runId] ?? {}), [sequence]: delta },
      }));
    } else if (type === 'completed' || type === 'failed' || type === 'cancelled') {
      await this.refreshRun(runId, conversationId, generation);
    } else if (type === 'status' && data['status'] !== 'running') {
      await this.refreshRun(runId, conversationId, generation);
    }
  }

  private async refreshRun(runId: string, conversationId: number, generation: number) {
    if (!this.isCurrent(generation)) return true;
    if (this.activeRunsByConversation()[conversationId]?.runId !== runId) return true;
    try {
      const run = await this.request(this.api.run(runId), generation);
      if (!this.isCurrent(generation)) return true;
      if (this.activeRunsByConversation()[conversationId]?.runId !== runId) return true;
      this.mergeRun(run, conversationId);
      if (run.status === 'running') return false;
      if (run.status === 'failed') this.error.set(this.runErrorMessage(run.errorCode));
      if (run.status === 'cancelled') this.error.set('The response was stopped.');
      this.finishRun(conversationId, false);
      await this.loadMessages(conversationId, false, generation);
      return true;
    } catch (error) {
      if (this.isCurrent(generation)) this.error.set(this.errorMessage(error));
      return false;
    }
  }

  private mergeRun(run: CopilotRun, conversationId: number) {
    this.setRunContext(run.runId, run.context ?? this.runContexts()[run.runId] ?? null);
    this.setActiveRun(conversationId, run.runId, run.status);
    if (this.currentConversationId() !== conversationId) return;
    const actions = new Map(this.actions().map((action) => [action.id, action]));
    for (const action of run.actions) actions.set(action.id, action);
    this.actions.set([...actions.values()]);
    const byId = new Map(this.messages().map((message) => [message.id, message]));
    for (const message of run.messages) byId.set(message.id, { ...message, conversationId, runId: run.runId });
    this.messages.set([...byId.values()].sort((a, b) => a.id - b.id));
  }

  private clearStreamedMessage(runId: string) {
    this.streamedMessages.update((messages) => {
      const next = { ...messages };
      delete next[runId];
      return next;
    });
  }

  private setActiveRun(conversationId: number, runId: string, status: CopilotRun['status']) {
    this.activeRunsByConversation.update((runs) => ({ ...runs, [conversationId]: { runId, status } }));
  }

  private setRunContext(runId: string, context: CopilotContext | null) {
    this.runContexts.update((contexts) => ({ ...contexts, [runId]: context }));
  }

  private recordConfirmedMutation(value: Record<string, unknown>) {
    const recordId = Number(value['recordId']);
    if (!['lead', 'company', 'contact', 'task'].includes(String(value['kind'])) || !Number.isSafeInteger(recordId) || recordId < 1) return;
    this.confirmationSequence += 1;
    this.confirmedMutation.set({
      sequence: this.confirmationSequence,
      ...(typeof value['operation'] === 'string' ? { operation: value['operation'] } : {}),
      kind: value['kind'] as 'lead' | 'company' | 'contact' | 'task',
      recordId,
      ...(typeof value['recordLabel'] === 'string' ? { recordLabel: value['recordLabel'] } : {}),
    });
  }

  private finishRun(conversationId: number, abortStream = true) {
    const runId = this.activeRunsByConversation()[conversationId]?.runId;
    if (runId) {
      if (abortStream) this.streamControllers.get(runId)?.abort();
      this.streamControllers.delete(runId);
      this.clearStreamedMessage(runId);
    }
    this.progressTool.set('');
    this.activeRunsByConversation.update((runs) => {
      const next = { ...runs };
      delete next[conversationId];
      return next;
    });
    const timer = this.pollTimers.get(conversationId);
    if (timer) clearTimeout(timer);
    this.pollTimers.delete(conversationId);
    const stored = this.readStoredState();
    if (stored) {
      const runs = { ...stored.runs };
      delete runs[conversationId];
      if (Object.keys(runs).length || stored.pending) {
        sessionStorage.setItem(ACTIVE_RUN_KEY, JSON.stringify({ runs, ...(stored.pending ? { pending: stored.pending } : {}) }));
      } else {
        sessionStorage.removeItem(ACTIVE_RUN_KEY);
      }
    }
  }

  private readStoredState(): { runs: Record<number, string>; pending?: CopilotPendingRequest } | null {
    try {
      const value = JSON.parse(sessionStorage.getItem(ACTIVE_RUN_KEY) ?? 'null') as {
        runId?: unknown;
        conversationId?: unknown;
        runs?: Record<string, unknown>;
        pending?: CopilotPendingRequest;
      } | null;
      if (!value) return null;
      if (value.runs && typeof value.runs === 'object') {
        const runs = Object.fromEntries(Object.entries(value.runs).filter(([id, runId]) => /^\d+$/.test(id) && typeof runId === 'string')) as Record<number, string>;
        return { runs, ...(value.pending ? { pending: value.pending } : {}) };
      }
      if (typeof value.runId === 'string' && Number.isInteger(value.conversationId)) {
        return { runs: { [Number(value.conversationId)]: value.runId } };
      }
      if (value.pending && typeof value.pending.clientRequestId === 'string' && typeof value.pending.text === 'string') {
        return { runs: {}, pending: value.pending };
      }
      return null;
    } catch {
      sessionStorage.removeItem(ACTIVE_RUN_KEY);
      return null;
    }
  }

  private writeStoredRun(runId: string, conversationId: number) {
    const state = this.readStoredState() ?? { runs: {} };
    const runs = { ...state.runs, [conversationId]: runId };
    sessionStorage.setItem(ACTIVE_RUN_KEY, JSON.stringify({ runs }));
  }

  private writeStoredPending(pending: CopilotPendingRequest) {
    const state = this.readStoredState() ?? { runs: {} };
    sessionStorage.setItem(ACTIVE_RUN_KEY, JSON.stringify({ runs: state.runs, pending }));
  }

  clear() {
    this.sessionGeneration += 1;
    this.conversationSelection += 1;
    this.sessionCleared.next();
    this.initializeTask = null;
    for (const controller of this.streamControllers.values()) controller.abort();
    this.streamControllers.clear();
    for (const timer of this.pollTimers.values()) clearTimeout(timer);
    this.pollTimers.clear();
    sessionStorage.removeItem(ACTIVE_RUN_KEY);
    this.initialized = false;
    this.status.set(null);
    this.conversations.set([]);
    this.currentConversationId.set(null);
    this.messages.set([]);
    this.actions.set([]);
    this.conversationCursor.set(null);
    this.messageCursor.set(null);
    this.hasMoreConversations.set(false);
    this.hasOlderMessages.set(false);
    this.activeRunsByConversation.set({});
    this.runContexts.set({});
    this.confirmedMutation.set(null);
    this.panelOpen.set(false);
    this.panelContext.set(null);
    this.panelReturnFocus = null;
    this.progressTool.set('');
    this.streamedMessages.set({});
    this.pendingRequest.set(null);
    this.busy.set(false);
    this.loadingMessages.set(false);
    this.error.set('');
  }

  private isCurrent(generation: number) {
    return generation === this.sessionGeneration;
  }

  private request<T>(request: Observable<T>, generation: number): Promise<T> {
    if (!this.isCurrent(generation)) return Promise.reject(new Error('Copilot session ended'));
    return firstValueFrom(request.pipe(takeUntil(this.sessionCleared))).then((value) => {
      if (!this.isCurrent(generation)) throw new Error('Copilot session ended');
      return value;
    });
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) return 'Your session expired. Sign in again.';
      if (error.status === 403) return 'Your access changed. Refresh the page or contact an administrator.';
      if (error.status === 409) return 'This request conflicts with a newer change. Refresh the chat and try again.';
      if (error.status === 429) return 'Too many requests. Wait a moment and retry.';
      if (error.status === 503) return 'Copilot is disabled. An administrator can enable it in the server configuration.';
      return error.status === 0 ? 'Network error. Check your connection and retry.' : 'Copilot request failed. Retry or start a new chat.';
    }
    return 'Copilot request failed. Retry or start a new chat.';
  }

  private runErrorMessage(code?: string) {
    if (code === 'permissions_changed') return 'Your access changed while Copilot was working. Refresh the chat before continuing.';
    if (code === 'provider_rate_limited') return 'Copilot is busy. Wait a moment and try again.';
    if (code === 'provider_timeout' || code === 'deadline_exceeded') return 'Copilot took too long to respond. You can send another message.';
    if (code === 'cancelled') return 'The response was stopped.';
    return 'Copilot could not complete this response. You can try again.';
  }
}
