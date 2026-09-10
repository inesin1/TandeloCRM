import { Component, input } from '@angular/core';
import { PIcon } from '@primeicons/angular/p-icon';
import { LeadCard, LeadCardVm } from '../lead-card/lead-card';
import { ButtonModule } from 'primeng/button';

export interface BoardColumnVm {
  name: string;
  color: string;
  totalLabel: string;
  leads: LeadCardVm[];
}

@Component({
  selector: 'app-board-column',
  templateUrl: './board-column.html',
  host: {
    class:
      'flex h-full flex-col shrink-0 w-80 rounded-xl border border-surface-200 bg-surface-50 p-2',
  },
  imports: [PIcon, LeadCard, ButtonModule],
})
export class BoardColumn {
  readonly column = input.required<BoardColumnVm>();
}
