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
import { Company, CompaniesApi } from '../companies-api';
import { LeadsApi } from '../../leads/leads-api';
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
    TableModule,
    Plus,
    PIcon,
    PageHeader,
    UserChip,
  ],
})
export class CompaniesPage {
  private readonly companiesApi = inject(CompaniesApi);

  protected readonly users = inject(LeadsApi).users;

  protected readonly search = signal('');
  protected readonly ownerFilter = signal<number | null>(null);
  protected readonly selectedCompanies = signal<CompanyRow[]>([]);

  protected readonly total = this.companiesApi.companies.length;

  protected readonly rows = computed(() => {
    const search = this.search().toLowerCase();
    const owner = this.ownerFilter();

    return this.companiesApi.companies
      .filter((company) => {
        if (owner && company.ownerId !== owner) {
          return false;
        }

        if (
          search &&
          !company.name.toLowerCase().includes(search) &&
          !company.email.toLowerCase().includes(search) &&
          !company.phone.includes(search)
        ) {
          return false;
        }

        return true;
      })
      .map((company) => ({
        ...company,
        ownerName:
          this.users.find((user) => user.id === company.ownerId)
            ?.name ?? 'Unassigned',
      }));
  });
}
