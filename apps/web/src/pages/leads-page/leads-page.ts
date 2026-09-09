import { Component, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { Plus } from '@primeicons/angular/plus';
import { ArrowUpRight } from '@primeicons/angular/arrow-up-right';
import { SelectButtonModule } from 'primeng/selectbutton';
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
    ArrowUpRight,
    SelectButtonModule,
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
        { id: 1, name: 'New', sort: 10 },
        { id: 2, name: 'Qualification', sort: 20 },
        { id: 3, name: 'Proposal', sort: 30 },
        { id: 4, name: 'Negotiation', sort: 40 },
      ],
    },
    {
      id: 2,
      name: 'Pipeline 2',
      statuses: [
        { id: 5, name: 'Incoming', sort: 10 },
        { id: 6, name: 'In progress', sort: 20 },
        { id: 7, name: 'Done', sort: 30 },
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

  protected readonly selectedPipeline = signal(this.pipelines[0]);
  protected readonly leadsCount = this.leads.length;

  protected readonly leadsPrice = this.leads.reduce(
    (acc, lead) => acc + lead.price,
    0,
  );

  protected readonly totalPriceLabel = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(this.leadsPrice);

  protected readonly conversionLabel = new Intl.NumberFormat('en-US', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(0.186);

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

  protected readonly columns = computed(() => {
    const pipeline = this.selectedPipeline();

    return pipeline.statuses
      .toSorted((a, b) => a.sort - b.sort)
      .map((status) => {
        const leads = this.leads.filter(
          (lead) =>
            lead.pipelineId === pipeline.id && lead.statusId === status.id,
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
              priceLabel: this.priceFormat.format(lead.price),
              clientName: company?.name ?? contact?.name ?? 'No client',
              clientIcon: company ? 'building' : 'user',
              responsibleName: this.users.find(
                (user) => user.id === lead.responsibleUserId,
              )?.name,
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

    const isOverdue = task.dueAt.getTime() < Date.now();
    const isToday = task.dueAt.toDateString() === new Date().toDateString();

    const severity: 'overdue' | 'today' | 'later' = isOverdue
      ? 'overdue'
      : isToday
        ? 'today'
        : 'later';

    const chipClass = isOverdue
      ? 'bg-red-50 text-red-700'
      : isToday
        ? 'bg-emerald-50 text-emerald-700'
        : 'bg-surface-100 text-surface-600';

    return {
      ...task,
      icon: this.taskIcons[task.type],
      severity,
      chipClass,
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
