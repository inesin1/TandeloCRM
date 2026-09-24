import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
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
import { Company, CompaniesApi } from '../companies-api';
import { UsersApi } from '../../settings/tabs/users-tab/users-api';
import { PageHeader } from '../../../shared/page-header';
import { UserChip } from '../../../shared/user-chip';

export interface CompanyRow extends Company {
  ownerName: string;
}

@Component({
  templateUrl: './companies-page.html',
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
    UserChip,
    RouterLink,
  ],
})
export class CompaniesPage {
  protected readonly companies = inject(CompaniesApi).companies;
  protected readonly users = inject(UsersApi).users;

  protected readonly search = signal('');
  protected readonly ownerFilter = signal<number | null>(null);
  protected readonly selectedCompanies = signal<CompanyRow[]>([]);

  protected readonly loadError = computed(
    () => this.companies.error() ?? this.users.error(),
  );

  protected readonly rows = computed(() => {
    const search = this.search().toLowerCase();
    const owner = this.ownerFilter();

    return this.companies
      .value()
      .filter((company) => {
        if (owner && company.ownerId !== owner) {
          return false;
        }

        if (
          search &&
          !company.name.toLowerCase().includes(search) &&
          !company.email?.toLowerCase().includes(search) &&
          !company.phone?.includes(search)
        ) {
          return false;
        }

        return true;
      })
      .map((company) => ({
        ...company,
        ownerName:
          this.users.value().find((user) => user.id === company.ownerId)
            ?.name ?? 'Unassigned',
      }));
  });
}
