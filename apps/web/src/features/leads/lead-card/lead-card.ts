import { Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { PIcon } from '@primeicons/angular/p-icon';
import { UserChip } from '../../../shared/user-chip';

export interface LeadCardVm {
  id: number;
  code: string;
  name: string;
  clientName: string;
  priceLabel: string;
  ownerName: string;
  updatedAt: string;
  task: {
    icon: string;
    text: string;
    dueAt: string;
    isOverdue: boolean;
    overdueLabel: string;
  } | null;
}

@Component({
  selector: 'app-lead-card',
  templateUrl: './lead-card.html',
  host: {
    class:
      'group relative block shrink-0 rounded-lg border border-surface-200 bg-white p-3 shadow-sm transition-[border-color,box-shadow] hover:border-surface-300 hover:shadow-md',
  },
  imports: [ButtonModule, PIcon, RouterLink, DatePipe, UserChip],
})
export class LeadCard {
  readonly lead = input.required<LeadCardVm>();
}
