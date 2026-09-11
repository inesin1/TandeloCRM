import { Component, effect, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PIcon } from '@primeicons/angular/p-icon';
import { SelectButton } from 'primeng/selectbutton';
import { DatePickerModule } from 'primeng/datepicker';
import { PageHeader } from '../../../shared/page-header';

@Component({
  templateUrl: './desktop-page.html',
  imports: [
    SelectButton,
    PIcon,
    DatePipe,
    FormsModule,
    DatePickerModule,
    PageHeader,
  ],
})
export class DesktopPage {
  protected readonly today = new Date();

  protected readonly stats = [
    { label: 'Revenue', value: '$1.44M', delta: '18.6%' },
    { label: 'In progress', value: '$3.84M', delta: '' },
    { label: 'Conversion', value: '28.4%', delta: '' },
    { label: 'New contacts', value: '36', delta: '4.2%' },
  ];

  protected readonly cards = [
    { title: 'Sales this month', action: '' },
    { title: 'My day', action: '3 tasks' },
    { title: 'Needs attention', action: 'All leads' },
    { title: 'Recent activity', action: 'All events' },
  ];

  protected readonly rangeModes = [
    { label: 'Today', value: 'today' },
    { label: 'Yesterday', value: 'yesterday' },
    { label: 'Week', value: 'week' },
    { label: 'Month', value: 'month' },
    { label: 'Range', value: 'range', icon: 'calendar' },
  ];
  protected readonly rangeMode = signal(
    localStorage.getItem('desktop:rangeMode') ?? this.rangeModes[0].value,
  );
  protected readonly rangeDates = signal<Date[] | null>(null);

  constructor() {
    effect(() => localStorage.setItem('desktop:rangeMode', this.rangeMode()));
  }
}
