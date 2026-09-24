import { inject, Service } from '@angular/core';
import { HttpClient, httpResource } from '@angular/common/http';
import { AuthApi } from '../auth/auth-api';

export interface Company {
  id: number;
  name: string;
  industry: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  ownerId: number | null;
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type CompanyInput = Pick<
  Company,
  | 'name'
  | 'industry'
  | 'address'
  | 'email'
  | 'phone'
  | 'ownerId'
  | 'customFields'
>;

@Service()
export class CompaniesApi {
  private readonly authApi = inject(AuthApi);
  private readonly http = inject(HttpClient);

  readonly companies = httpResource<Company[]>(
    () => (this.authApi.isAuthenticated() ? '/api/companies' : undefined),
    { defaultValue: [] },
  );

  create(company: CompanyInput) {
    return this.http.post<Company>('/api/companies', company);
  }

  update(id: number, company: CompanyInput) {
    return this.http.put<Company>(`/api/companies/${id}`, company);
  }

  addNote(id: number, body: string) {
    return this.http.post(`/api/companies/${id}/notes`, { body });
  }
}
