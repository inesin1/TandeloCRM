import { Component, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { Plus } from '@primeicons/angular/plus';
import { SelectButtonModule } from 'primeng/selectbutton';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { PIcon } from '@primeicons/angular/p-icon';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';

interface Task {
  id: number;
  leadId: number;
  type: 'call' | 'email' | 'meeting' | 'document';
  text: string;
  dueAt: Date;
  isCompleted: boolean;
  responsibleUserId: number;
}

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
    RouterLink,
    DatePipe,
  ],
})
export class LeadsPage {
  protected readonly pipelines = [
    {
      id: 1,
      name: 'Pipeline 1',
      statuses: [
        { id: 1, name: 'New', sort: 10, color: '#3b82f6' },
        { id: 2, name: 'Qualification', sort: 20, color: '#6366f1' },
        { id: 3, name: 'Proposal', sort: 30, color: '#f59e0b' },
        { id: 4, name: 'Negotiation', sort: 40, color: '#10b981' },
      ],
    },
    {
      id: 2,
      name: 'Pipeline 2',
      statuses: [
        { id: 5, name: 'Incoming', sort: 10, color: '#0ea5e9' },
        { id: 6, name: 'In progress', sort: 20, color: '#8b5cf6' },
        { id: 7, name: 'Done', sort: 30, color: '#10b981' },
      ],
    },
  ];

  protected readonly leads = [
    {
      id: 1,
      name: 'CRM for sales team',
      price: 480_000,
      responsibleUserId: 1,
      statusId: 1,
      pipelineId: 1,
      createdBy: 1,
      createdAt: new Date('2026-08-28T09:12'),
      updatedBy: 1,
      updatedAt: new Date('2026-09-07T18:40'),
      contacts: [{ id: 11, name: 'Igor Smirnov' }],
      companies: [{ id: 101, name: 'Forma' }],
    },
    {
      id: 2,
      name: 'Request automation',
      price: 240_000,
      responsibleUserId: 2,
      statusId: 1,
      pipelineId: 1,
      createdBy: 2,
      createdAt: new Date('2026-08-30T11:05'),
      updatedBy: 2,
      updatedAt: new Date('2026-09-06T10:15'),
      contacts: [{ id: 12, name: 'Maria Kovaleva' }],
      companies: [{ id: 102, name: 'Forest & House' }],
    },
    {
      id: 3,
      name: 'Unified customer base',
      price: 650_000,
      responsibleUserId: 3,
      statusId: 2,
      pipelineId: 1,
      createdBy: 1,
      createdAt: new Date('2026-08-21T14:30'),
      updatedBy: 3,
      updatedAt: new Date('2026-09-08T09:00'),
      contacts: [
        { id: 13, name: 'Pavel Orlov' },
        { id: 14, name: 'Anna Letova' },
      ],
      companies: [{ id: 103, name: 'Orbit' }],
    },
    {
      id: 4,
      name: 'Telephony integration',
      price: 180_000,
      responsibleUserId: 1,
      statusId: 2,
      pipelineId: 1,
      createdBy: 3,
      createdAt: new Date('2026-08-25T16:45'),
      updatedBy: 1,
      updatedAt: new Date('2026-09-05T12:20'),
      contacts: [{ id: 15, name: 'Denis Volkov' }],
      companies: [{ id: 104, name: 'Growth Point' }],
    },
    {
      id: 5,
      name: 'Rollout for 3 teams',
      price: 960_000,
      responsibleUserId: 2,
      statusId: 3,
      pipelineId: 1,
      createdBy: 2,
      createdAt: new Date('2026-08-12T10:00'),
      updatedBy: 2,
      updatedAt: new Date('2026-09-04T17:05'),
      contacts: [{ id: 16, name: 'Olga Titova' }],
      companies: [{ id: 105, name: 'Nord Studio' }],
    },
    {
      id: 6,
      name: 'Customer portal',
      price: 420_000,
      responsibleUserId: 3,
      statusId: 3,
      pipelineId: 1,
      createdBy: 1,
      createdAt: new Date('2026-08-18T13:25'),
      updatedBy: 3,
      updatedAt: new Date('2026-09-08T11:40'),
      contacts: [{ id: 17, name: 'Sergey Gavrilov' }],
      companies: [{ id: 106, name: 'Layer' }],
    },
    {
      id: 7,
      name: 'Annual support',
      price: 720_000,
      responsibleUserId: 1,
      statusId: 4,
      pipelineId: 1,
      createdBy: 1,
      createdAt: new Date('2026-07-30T08:50'),
      updatedBy: 1,
      updatedAt: new Date('2026-09-07T15:10'),
      contacts: [{ id: 18, name: 'Ekaterina Rybina' }],
      companies: [{ id: 107, name: 'Atlas' }],
    },
    {
      id: 8,
      name: 'Team expansion',
      price: 190_000,
      responsibleUserId: 2,
      statusId: 5,
      pipelineId: 2,
      createdBy: 3,
      createdAt: new Date('2026-08-05T12:15'),
      updatedBy: 2,
      updatedAt: new Date('2026-09-03T19:30'),
      contacts: [
        { id: 19, name: 'Artem Nosov' },
        { id: 20, name: 'Lidia Kraynova' },
      ],
      companies: [{ id: 108, name: 'Bureau' }],
    },
  ];

  protected readonly currentUserId = 1;

  protected readonly selectedPipeline = signal(this.pipelines[0]);
  protected readonly activeTab = signal('all');
  protected readonly search = signal('');
  protected readonly responsibleFilter = signal<number | null>(null);
  protected readonly statusFilter = signal<number | null>(null);

  protected readonly users = [
    { id: 1, name: 'Andrey N.' },
    { id: 2, name: 'Elena K.' },
    { id: 3, name: 'Mikhail S.' },
  ];

  protected readonly tasks: Task[] = [
    {
      id: 1,
      leadId: 1,
      type: 'call',
      text: 'First call',
      dueAt: new Date('2026-09-09T14:00'),
      isCompleted: false,
      responsibleUserId: 1,
    },
    {
      id: 2,
      leadId: 1,
      type: 'email',
      text: 'Send follow-up',
      dueAt: new Date('2026-09-01T10:00'),
      isCompleted: true,
      responsibleUserId: 1,
    },
    {
      id: 3,
      leadId: 2,
      type: 'document',
      text: 'Send proposal',
      dueAt: new Date('2026-09-12T11:00'),
      isCompleted: false,
      responsibleUserId: 2,
    },
    {
      id: 4,
      leadId: 3,
      type: 'document',
      text: 'Send proposal',
      dueAt: new Date('2026-09-09T17:30'),
      isCompleted: false,
      responsibleUserId: 3,
    },
    {
      id: 5,
      leadId: 4,
      type: 'call',
      text: 'First call',
      dueAt: new Date('2026-09-15T09:30'),
      isCompleted: false,
      responsibleUserId: 1,
    },
    {
      id: 6,
      leadId: 5,
      type: 'meeting',
      text: 'Demo for the team',
      dueAt: new Date('2026-09-05T12:00'),
      isCompleted: false,
      responsibleUserId: 2,
    },
    {
      id: 7,
      leadId: 6,
      type: 'document',
      text: 'Discuss contract',
      dueAt: new Date('2026-09-10T12:00'),
      isCompleted: false,
      responsibleUserId: 3,
    },
    {
      id: 8,
      leadId: 7,
      type: 'meeting',
      text: 'Discuss contract',
      dueAt: new Date('2026-09-09T10:00'),
      isCompleted: false,
      responsibleUserId: 1,
    },
  ];

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
    this.leads.filter(
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
          leads: leads.map((lead) => {
            const company = lead.companies.at(0);
            const contact = lead.contacts.at(0);

            return {
              ...lead,
              code: `DL-${String(lead.id).padStart(4, '0')}`,
              priceLabel: this.priceFormat.format(lead.price),
              clientName: company?.name ?? contact?.name ?? 'No client',
              responsibleName:
                this.users.find((user) => user.id === lead.responsibleUserId)
                  ?.name ?? 'Unassigned',
              task: this.nextTask(lead.id),
            };
          }),
        };
      });
  });

  private nextTask(leadId: number) {
    const task = this.tasks
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

  protected readonly viewMode = signal(this.viewModes[0].value);
}
