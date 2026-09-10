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

export interface CompanyRow extends Company {
  responsibleName: string;
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
  ],
})
export class CompaniesPage {
  private readonly companiesApi = inject(CompaniesApi);

  protected readonly users = inject(LeadsApi).users;

  protected readonly search = signal('');
  protected readonly responsibleFilter = signal<number | null>(null);
  protected readonly selectedCompanies = signal<CompanyRow[]>([]);

  protected readonly total = this.companiesApi.companies.length;

  protected readonly rows = computed(() => {
    const search = this.search().toLowerCase();
    const responsible = this.responsibleFilter();

    return this.companiesApi.companies
      .filter((company) => {
        if (responsible && company.responsibleUserId !== responsible) {
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
        responsibleName:
          this.users.find((user) => user.id === company.responsibleUserId)
            ?.name ?? 'Unassigned',
      }));
  });
}
