import { Component, computed, inject, signal } from '@angular/core';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { PIcon } from '@primeicons/angular/p-icon';
import { Plus } from '@primeicons/angular/plus';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { LeadsApi } from '../../../leads/leads-api';

@Component({
  templateUrl: './users-tab.html',
  host: {
    class: 'block',
  },
  imports: [
    IconField,
    InputIcon,
    InputTextModule,
    PIcon,
    Plus,
    FormsModule,
    ButtonModule,
    AvatarModule,
    TableModule,
    TagModule,
  ],
})
export class UsersTab {
  private readonly users = inject(LeadsApi).users;

  protected readonly search = signal('');

  protected readonly rows = computed(() => {
    const search = this.search().trim().toLowerCase();

    return this.users
      .filter(
        (user) =>
          !search ||
          user.name.toLowerCase().includes(search) ||
          user.email.toLowerCase().includes(search),
      )
      .map((user) => ({
        ...user,
        initials: user.name
          .split(' ')
          .map((part) => part[0])
          .join('')
          .toUpperCase(),
      }));
  });
}
