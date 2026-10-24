import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CopilotChat } from '../copilot-chat/copilot-chat';
import { CopilotState } from '../copilot-state';

@Component({
  templateUrl: './copilot-page.html',
  styleUrl: './copilot-page.css',
  imports: [CopilotChat, FormsModule],
  host: { class: 'block h-full min-h-[calc(100dvh-1rem)]' },
})
export class CopilotPage implements OnInit {
  protected readonly state = inject(CopilotState);
  protected readonly editingId = signal<number | null>(null);
  protected readonly titleDraft = signal('');
  protected readonly currentConversation = computed(() =>
    this.state.conversations().find((item) => item.id === this.state.currentConversationId()) ?? null,
  );

  ngOnInit() {
    void this.state.initialize();
  }

  protected startRename(id: number, title: string) {
    this.editingId.set(id);
    this.titleDraft.set(title);
  }

  protected async saveRename(id: number) {
    if (this.editingId() !== id) return;
    this.editingId.set(null);
    const title = this.titleDraft().trim();
    if (title) await this.state.renameConversation(id, title);
  }

  protected async deleteConversation(id: number, title: string) {
    if (confirm(`Delete “${title}”? Messages will be deleted, but confirmed CRM changes will remain.`)) {
      await this.state.deleteConversation(id);
    }
  }
}
