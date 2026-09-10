import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { TableModule } from 'primeng/table';
import { Plus } from '@primeicons/angular/plus';
import { PIcon } from '@primeicons/angular/p-icon';
import { Contact, ContactsApi } from '../contacts-api';
import { LeadsApi } from '../../leads/leads-api';

export interface ContactRow extends Contact {
  responsibleName: string;
}

@Component({
  templateUrl: './contacts-page.html',
  imports: [
    ButtonModule,
    SelectModule,
    FormsModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    TableModule,
    Plus,
    PIcon,
  ],
})
export class ContactsPage {
  private readonly contactsApi = inject(ContactsApi);

  protected readonly users = inject(LeadsApi).users;

  protected readonly search = signal('');
  protected readonly responsibleFilter = signal<number | null>(null);
  protected readonly selectedContacts = signal<ContactRow[]>([]);

  protected readonly total = this.contactsApi.contacts.length;

  protected readonly rows = computed(() => {
    const search = this.search().toLowerCase();
    const responsible = this.responsibleFilter();

    return this.contactsApi.contacts
      .filter((contact) => {
        if (responsible && contact.responsibleUserId !== responsible) {
          return false;
        }

        if (
          search &&
          !contact.name.toLowerCase().includes(search) &&
          !contact.email.toLowerCase().includes(search) &&
          !contact.phone.includes(search)
        ) {
          return false;
        }

        return true;
      })
      .map((contact) => ({
        ...contact,
        responsibleName:
          this.users.find((user) => user.id === contact.responsibleUserId)
            ?.name ?? 'Unassigned',
      }));
  });
}
