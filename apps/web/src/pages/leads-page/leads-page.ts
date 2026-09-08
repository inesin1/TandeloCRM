import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { Plus } from '@primeicons/angular/plus';
import { ArrowUpRight } from '@primeicons/angular/arrow-up-right';
import { SelectButtonModule } from 'primeng/selectbutton';
import { PIcon } from '@primeicons/angular/p-icon';

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
  ],
})
export class LeadsPage {
  protected readonly pipelines = [
    { id: 1, name: 'Pipeline 1' },
    { id: 2, name: 'Pipeline 2' },
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
      statusId: 4,
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

  protected readonly selectedPipeline = signal(this.pipelines[0].id);
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

  protected readonly viewModes = [
    { label: 'Board', value: 'board', icon: 'columns-2' },
    { label: 'Table', value: 'table', icon: 'table' },
  ];

  protected readonly viewMode = signal(this.viewModes[0].value);
}
