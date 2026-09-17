import { Component, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { PIcon } from '@primeicons/angular/p-icon';
import { Lead, Status, Task } from '../leads-api';
import { UserChip } from '../../../shared/user-chip';

export interface NextTask extends Task {
  icon: string;
  isOverdue: boolean;
  overdueLabel: string;
  assigneeName: string;
}

export interface LeadRow extends Lead {
  code: string;
  priceLabel: string;
  clientName: string;
  ownerName: string;
  status: Status | undefined;
  task: NextTask | null;
}

@Component({
  selector: 'app-leads-table',
  templateUrl: './leads-table.html',
  host: {
    class: 'flex min-h-0 flex-1 flex-col',
  },
  imports: [TableModule, ButtonModule, PIcon, RouterLink, DatePipe, UserChip],
})
export class LeadsTable {
  readonly rows = input.required<LeadRow[]>();

  protected readonly selectedLeads = signal<LeadRow[]>([]);
}
