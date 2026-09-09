import { Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { PIcon } from '@primeicons/angular/p-icon';

export interface LeadCardVm {
  id: number;
  code: string;
  name: string;
  clientName: string;
  priceLabel: string;
  responsibleName: string;
  updatedAt: Date;
  task: {
    icon: string;
    text: string;
    dueAt: Date;
    isOverdue: boolean;
    overdueLabel: string;
  } | null;
}

@Component({
  selector: 'app-lead-card',
  templateUrl: './lead-card.html',
  host: {
    class:
      'group relative block shrink-0 rounded-lg border border-surface-200 bg-[var(--p-content-background)] p-3 transition-colors hover:border-surface-300',
  },
  imports: [ButtonModule, PIcon, RouterLink, DatePipe],
})
export class LeadCard {
  readonly lead = input.required<LeadCardVm>();
}
