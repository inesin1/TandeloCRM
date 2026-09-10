import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SidebarModule } from 'primeng/sidebar';
import { Sparkles } from '@primeicons/angular/sparkles';
import { Times } from '@primeicons/angular/times';
import { Send } from '@primeicons/angular/send';
import { ChevronRight } from '@primeicons/angular/chevron-right';
import { ChevronLeft } from '@primeicons/angular/chevron-left';

interface CopilotMessage {
  role: 'user' | 'assistant';
  text: string;
}

@Component({
  selector: 'app-copilot-panel',
  templateUrl: './copilot-panel.html',
  styleUrl: './copilot-panel.css',
  host: { class: 'contents' },
  imports: [
    FormsModule,
    ButtonModule,
    SidebarModule,
    Sparkles,
    Times,
    Send,
    ChevronRight,
    ChevronLeft,
  ],
})
export class CopilotPanel {
  readonly isOpen = signal(false);
  readonly draft = signal('');
  readonly messages = signal<CopilotMessage[]>([]);

  send() {
    const text = this.draft().trim();
    if (!text) return;

    this.messages.update((messages) => [
      ...messages,
      { role: 'user', text },
      { role: 'assistant', text: 'Coming soon.' },
    ]);
    this.draft.set('');
  }
}
