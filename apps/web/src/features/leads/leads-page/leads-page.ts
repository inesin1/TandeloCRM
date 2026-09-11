import { Component, signal, computed, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { Plus } from '@primeicons/angular/plus';
import { SelectButtonModule } from 'primeng/selectbutton';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { PIcon } from '@primeicons/angular/p-icon';
import { Lead, LeadsApi } from '../leads-api';
import { BoardColumn } from '../board-column/board-column';
import { LeadRow, LeadsTable, NextTask } from '../leads-table/leads-table';
import { PageHeader } from '../../../shared/page-header';

@Component({
  templateUrl: './leads-page.html',
  styleUrl: './leads-page.css',
  imports: [
    ButtonModule,
    SelectModule,
    FormsModule,
    Plus,
    SelectButtonModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    PIcon,
    BoardColumn,
    LeadsTable,
    PageHeader,
  ],
})
export class LeadsPage {
  private readonly leadsApi = inject(LeadsApi);

  protected readonly pipelines = this.leadsApi.pipelines;
  protected readonly users = this.leadsApi.users;
  protected readonly currentUserId = 1;

  protected readonly selectedPipeline = signal(this.pipelines[0]);
  protected readonly activeTab = signal('all');
  protected readonly search = signal('');
  protected readonly responsibleFilter = signal<number | null>(null);
  protected readonly statusFilter = signal<number | null>(null);

  private readonly taskIcons = {
    call: 'phone',
    email: 'envelope',
    meeting: 'calendar',
    document: 'file',
  };

  private readonly priceFormat = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

  protected readonly pipelineLeads = computed(() =>
    this.leadsApi.leads.filter(
      (lead) => lead.pipelineId === this.selectedPipeline().id,
    ),
  );

  protected readonly stats = computed(() => {
    const leads = this.pipelineLeads();
    const tasks = leads.map((lead) => this.nextTask(lead.id));

    return {
      open: leads.length,
      inWorkLabel: this.priceFormat.format(
        leads.reduce((acc, lead) => acc + lead.price, 0),
      ),
      noTask: tasks.filter((task) => !task).length,
      overdue: tasks.filter((task) => task?.isOverdue).length,
    };
  });

  protected readonly tabs = computed(() => {
    const leads = this.pipelineLeads();

    return [
      { value: 'all', label: 'All leads', count: leads.length },
      {
        value: 'mine',
        label: 'Mine',
        count: leads.filter(
          (lead) => lead.responsibleUserId === this.currentUserId,
        ).length,
      },
      {
        value: 'attention',
        label: 'Needs attention',
        count: this.stats().noTask + this.stats().overdue,
      },
    ];
  });

  protected readonly filteredLeads = computed(() => {
    const tab = this.activeTab();
    const search = this.search().toLowerCase();
    const responsible = this.responsibleFilter();
    const status = this.statusFilter();

    return this.pipelineLeads().filter((lead) => {
      if (responsible && lead.responsibleUserId !== responsible) {
        return false;
      }

      if (status && lead.statusId !== status) {
        return false;
      }

      if (search && !lead.name.toLowerCase().includes(search)) {
        return false;
      }

      if (tab === 'mine') {
        return lead.responsibleUserId === this.currentUserId;
      }

      if (tab === 'attention') {
        const task = this.nextTask(lead.id);
        return !task || task.isOverdue;
      }

      return true;
    });
  });

  protected readonly columns = computed(() => {
    const pipeline = this.selectedPipeline();

    return pipeline.statuses
      .toSorted((a, b) => a.sort - b.sort)
      .map((status) => {
        const leads = this.filteredLeads().filter(
          (lead) => lead.statusId === status.id,
        );

        return {
          ...status,
          totalLabel: this.priceFormat.format(
            leads.reduce((acc, lead) => acc + lead.price, 0),
          ),
          leads: leads.map((lead) => this.toRow(lead)),
        };
      });
  });

  protected readonly rows = computed(() =>
    this.filteredLeads().map((lead) => this.toRow(lead)),
  );

  private toRow(lead: Lead): LeadRow {
    const company = lead.companies.at(0);
    const contact = lead.contacts.at(0);

    return {
      ...lead,
      code: `DL-${String(lead.id).padStart(4, '0')}`,
      priceLabel: this.priceFormat.format(lead.price),
      clientName: company?.name ?? contact?.name ?? 'No client',
      responsibleName:
        this.users.find((user) => user.id === lead.responsibleUserId)?.name ??
        'Unassigned',
      status: this.selectedPipeline().statuses.find(
        (status) => status.id === lead.statusId,
      ),
      task: this.nextTask(lead.id),
    };
  }

  private nextTask(leadId: number): NextTask | null {
    const task = this.leadsApi.tasks
      .filter((item) => item.leadId === leadId && !item.isCompleted)
      .toSorted((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
      .at(0);

    if (!task) {
      return null;
    }

    const overdueMs = Date.now() - task.dueAt.getTime();
    const overdueDays = Math.floor(overdueMs / 86_400_000);

    return {
      ...task,
      icon: this.taskIcons[task.type],
      isOverdue: overdueMs > 0,
      overdueLabel: overdueDays
        ? `Overdue by ${overdueDays} ${overdueDays === 1 ? 'day' : 'days'}`
        : 'Overdue today',
      responsibleName:
        this.users.find((user) => user.id === task.responsibleUserId)?.name ??
        'Unassigned',
    };
  }

  protected readonly viewModes = [
    { label: 'Board', value: 'board', icon: 'columns-2' },
    { label: 'List', value: 'list', icon: 'list' },
  ];

  protected readonly viewMode = signal(
    localStorage.getItem('leads:viewMode') ?? this.viewModes[0].value,
  );

  constructor() {
    effect(() => localStorage.setItem('leads:viewMode', this.viewMode()));
  }
}
