import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContactsApi } from '../../contacts/contacts-api';
import { Lead } from '../../leads/lead-types';
import { LeadsApi } from '../../leads/leads-api';
import { TasksApi } from '../../tasks/tasks-api';
import { PageHeader } from '../../../shared/page-header';

@Component({
  templateUrl: './desktop-page.html',
  imports: [DatePipe, RouterLink, PageHeader],
})
export class DesktopPage {
  protected readonly today = new Date();
  protected readonly leads = inject(LeadsApi).leads;
  protected readonly tasks = inject(TasksApi).tasks;
  protected readonly contacts = inject(ContactsApi).contacts;

  protected readonly loadError = computed(
    () => this.leads.error() ?? this.tasks.error() ?? this.contacts.error(),
  );

  protected readonly isLoading = computed(
    () =>
      this.leads.isLoading() ||
      this.tasks.isLoading() ||
      this.contacts.isLoading(),
  );

  protected readonly summary = computed(() => {
    const leads = this.leads.value();
    const tasks = this.tasks.value();

    return {
      leadCount: leads.length,
      leadValue: leads.reduce((total, lead) => total + lead.price, 0),
      contactCount: this.contacts.value().length,
      openTaskCount: tasks.filter((task) => !task.isCompleted).length,
    };
  });

  protected readonly stages = computed(() => {
    const grouped = new Map<
      number,
      {
        id: number;
        name: string;
        color: string;
        leadCount: number;
        value: number;
      }
    >();

    for (const lead of this.leads.value()) {
      const stage = grouped.get(lead.status.id) ?? {
        id: lead.status.id,
        name: lead.status.name,
        color: lead.status.color,
        leadCount: 0,
        value: 0,
      };
      stage.leadCount += 1;
      stage.value += lead.price;
      grouped.set(stage.id, stage);
    }

    return [...grouped.values()].toSorted(
      (a, b) => b.leadCount - a.leadCount || a.name.localeCompare(b.name),
    );
  });

  protected readonly tasksToAddress = computed(() => {
    const now = Date.now();
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);

    return this.tasks
      .value()
      .filter((task) => {
        const dueAt = new Date(task.dueAt).getTime();
        return !task.isCompleted && dueAt < tomorrow.getTime();
      })
      .toSorted((a, b) => a.dueAt.localeCompare(b.dueAt))
      .slice(0, 6)
      .map((task) => ({
        ...task,
        isOverdue: new Date(task.dueAt).getTime() < now,
        leadName: this.leads.value().find((lead) => lead.id === task.leadId)
          ?.name,
      }));
  });

  protected readonly recentLeads = computed(() =>
    this.leads
      .value()
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5)
      .map((lead) => ({
        ...lead,
        clientName: this.clientName(lead),
      })),
  );

  private readonly priceFormat = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

  protected formatPrice(value: number) {
    return this.priceFormat.format(value);
  }

  protected retry() {
    this.leads.reload();
    this.tasks.reload();
    this.contacts.reload();
  }

  private clientName(lead: Lead) {
    return lead.company?.name ?? lead.contacts.at(0)?.name ?? 'No client';
  }
}
