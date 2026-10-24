import { DatePipe, JsonPipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CopilotPanelContext, CopilotContext } from '../copilot-types';
import { CopilotState, sourceRoute } from '../copilot-state';

@Component({
  selector: 'app-copilot-chat',
  templateUrl: './copilot-chat.html',
  styleUrl: './copilot-chat.css',
  imports: [DatePipe, FormsModule, JsonPipe, RouterLink],
  host: { class: 'block min-h-0 h-full' },
})
export class CopilotChat implements OnInit {
  readonly context = input<CopilotPanelContext | null>(null);
  readonly contextChange = output<CopilotPanelContext | null>();
  protected readonly state = inject(CopilotState);
  protected readonly draft = signal('');
  protected readonly composing = signal(false);
  protected readonly copiedId = signal<number | null>(null);
  protected readonly busyActionId = signal<string | null>(null);
  protected readonly suggestions = ['Find open leads', 'Which tasks are overdue?', 'Summarize the pipeline'];
  protected readonly composerContext = computed(() => {
    const pending = this.state.pendingRequest();
    if (!pending?.context) return this.context();
    const current = this.context();
    if (current?.context.kind === pending.context.kind && current.context.id === pending.context.id) return current;
    return { context: pending.context, label: this.contextLabel(pending.context) };
  });

  protected sourceLink = sourceRoute;

  ngOnInit() {
    void this.state.initialize();
    const pending = this.state.pendingRequest();
    if (pending?.conversationId === this.state.currentConversationId()) this.draft.set(pending.text);
  }

  protected async submit() {
    const text = this.draft();
    if (!text.trim() || this.composing() || !this.state.canSend()) return;
    await this.state.send(text, this.context()?.context);
    if (!this.state.pendingRequest()) this.draft.set('');
  }

  protected async retry() {
    await this.state.retrySend();
    if (!this.state.pendingRequest()) this.draft.set('');
  }

  protected onComposerKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing || this.composing()) return;
    event.preventDefault();
    void this.submit();
  }

  protected async copy(messageId: number, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.copiedId.set(messageId);
      setTimeout(() => this.copiedId.set(null), 1500);
    } catch {
      this.state.error.set('Clipboard access is unavailable in this browser.');
    }
  }

  protected async confirm(actionId: string) {
    const action = this.state.actions().find((item) => item.id === actionId);
    if (!action || this.busyActionId()) return;
    this.busyActionId.set(actionId);
    await this.state.confirm(action);
    this.busyActionId.set(null);
    this.focusProposal(actionId);
  }

  protected async reject(actionId: string) {
    const action = this.state.actions().find((item) => item.id === actionId);
    if (!action || this.busyActionId()) return;
    this.busyActionId.set(actionId);
    await this.state.reject(action);
    this.busyActionId.set(null);
    this.focusProposal(actionId);
  }

  private focusProposal(actionId: string) {
    requestAnimationFrame(() => document.getElementById(`proposal-${actionId}`)?.focus());
  }

  protected previewLabel(value: unknown) {
    return typeof value === 'string' ? value : JSON.stringify(value ?? '');
  }

  protected messageContextLabel(runId: string | null | undefined) {
    const context = runId ? this.state.runContexts()[runId] : null;
    return context ? this.contextLabel(context) : '';
  }

  protected progressLabel() {
    const tool = this.state.progressTool().replaceAll('_', ' ');
    return tool ? `Copilot is using ${tool}…` : 'Copilot is working…';
  }

  protected removeContext() {
    this.contextChange.emit(null);
  }

  private contextLabel(context: CopilotContext) {
    const kind = context.kind[0].toUpperCase() + context.kind.slice(1);
    return `${kind} #${context.id}`;
  }

  protected async askSuggestion(value: string) {
    this.draft.set(value);
    await this.submit();
  }
}
