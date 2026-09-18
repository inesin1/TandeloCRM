import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { Plus } from '@primeicons/angular/plus';
import { PIcon } from '@primeicons/angular/p-icon';
import { Contact, ContactsApi } from '../contacts-api';
import { CompaniesApi } from '../../companies/companies-api';
import { UsersApi } from '../../settings/tabs/users-tab/users-api';
import { PageHeader } from '../../../shared/page-header';

export interface ContactRow extends Contact {
  companyName: string | undefined;
  ownerName: string;
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
    MessageModule,
    TableModule,
    Plus,
    PIcon,
    PageHeader,
  ],
})
export class ContactsPage {
  protected readonly contacts = inject(ContactsApi).contacts;
  private readonly companies = inject(CompaniesApi).companies;
  protected readonly users = inject(UsersApi).users;

  protected readonly search = signal('');
  protected readonly ownerFilter = signal<number | null>(null);
  protected readonly selectedContacts = signal<ContactRow[]>([]);

  protected readonly loadError = computed(
    () =>
      this.contacts.error() ?? this.companies.error() ?? this.users.error(),
  );

  protected readonly rows = computed(() => {
    const search = this.search().toLowerCase();
    const owner = this.ownerFilter();

    return this.contacts
      .value()
      .filter((contact) => {
        if (owner && contact.ownerId !== owner) {
          return false;
        }

        if (
          search &&
          !contact.name.toLowerCase().includes(search) &&
          !contact.email?.toLowerCase().includes(search) &&
          !contact.phone?.includes(search)
        ) {
          return false;
        }

        return true;
      })
      .map((contact) => ({
        ...contact,
        companyName: this.companies
          .value()
          .find((company) => company.id === contact.companyId)?.name,
        ownerName:
          this.users.value().find((user) => user.id === contact.ownerId)
            ?.name ?? 'Unassigned',
      }));
  });
}
