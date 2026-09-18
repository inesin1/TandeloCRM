import { Component, signal, computed, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { Plus } from '@primeicons/angular/plus';
import { SelectButtonModule } from 'primeng/selectbutton';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { MessageModule } from 'primeng/message';
import { ProgressBar } from 'primeng/progressbar';
import { PIcon } from '@primeicons/angular/p-icon';
import { Lead, LeadsApi } from '../leads-api';
import { PipelinesApi } from '../pipelines-api';
import { UsersApi } from '../../settings/tabs/users-tab/users-api';
import { TasksApi } from '../../tasks/tasks-api';
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
    MessageModule,
    ProgressBar,
    PIcon,
    BoardColumn,
    LeadsTable,
    PageHeader,
  ],
})
export class LeadsPage {
  private readonly leadsApi = inject(LeadsApi);
  private readonly pipelinesApi = inject(PipelinesApi);

  protected readonly leads = this.leadsApi.leads;
  protected readonly pipelines = this.pipelinesApi.pipelines;
  protected readonly selectedPipeline = this.pipelinesApi.selectedPipeline;
  protected readonly statuses = this.pipelinesApi.statuses;
  protected readonly users = inject(UsersApi).users;
  protected readonly tasks = inject(TasksApi).tasks;
  protected readonly currentUserId = 1;

  // value() throws while a resource is in error state, so the template must not read it then.
  protected readonly loadError = computed(
    () =>
      this.leads.error() ??
      this.pipelines.error() ??
      this.statuses.error() ??
      this.tasks.error() ??
      this.users.error(),
  );

  protected readonly isLoading = computed(
    () =>
      this.leads.isLoading() ||
      this.pipelines.isLoading() ||
      this.statuses.isLoading() ||
      this.tasks.isLoading(),
  );

  protected readonly activeTab = signal('all');
  protected readonly search = signal('');
  protected readonly ownerFilter = signal<number | null>(null);
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
    this.leads
      .value()
      .filter((lead) => lead.pipelineId === this.selectedPipeline()?.id),
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
          (lead) => lead.ownerId === this.currentUserId,
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
    const owner = this.ownerFilter();
    const status = this.statusFilter();

    return this.pipelineLeads().filter((lead) => {
      if (owner && lead.ownerId !== owner) {
        return false;
      }

      if (status && lead.statusId !== status) {
        return false;
      }

      if (search && !lead.name.toLowerCase().includes(search)) {
        return false;
      }

      if (tab === 'mine') {
        return lead.ownerId === this.currentUserId;
      }

      if (tab === 'attention') {
        const task = this.nextTask(lead.id);
        return !task || task.isOverdue;
      }

      return true;
    });
  });

  protected readonly columns = computed(() =>
    this.statuses.value().map((status) => {
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
    }),
  );

  protected readonly rows = computed(() =>
    this.filteredLeads().map((lead) => this.toRow(lead)),
  );

  private toRow(lead: Lead): LeadRow {
    return {
      ...lead,
      code: `DL-${String(lead.id).padStart(4, '0')}`,
      priceLabel: this.priceFormat.format(lead.price),
      clientName:
        lead.company?.name ?? lead.contacts.at(0)?.name ?? 'No client',
      ownerName: lead.owner?.name ?? 'Unassigned',
      task: this.nextTask(lead.id),
    };
  }

  private nextTask(leadId: number): NextTask | null {
    const task = this.tasks
      .value()
      .filter((item) => item.leadId === leadId && !item.isCompleted)
      .toSorted((a, b) => a.dueAt.localeCompare(b.dueAt))
      .at(0);

    if (!task) {
      return null;
    }

    const overdueMs = Date.now() - new Date(task.dueAt).getTime();
    const overdueDays = Math.floor(overdueMs / 86_400_000);

    return {
      ...task,
      icon: this.taskIcons[task.type],
      isOverdue: overdueMs > 0,
      overdueLabel: overdueDays
        ? `Overdue by ${overdueDays} ${overdueDays === 1 ? 'day' : 'days'}`
        : 'Overdue today',
      assigneeName: task.assignee?.name ?? 'Unassigned',
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
