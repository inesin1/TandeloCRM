import { inject, Service } from '@angular/core';
import { HttpClient, httpResource } from '@angular/common/http';
import { AuthApi } from '../auth/auth-api';
import { Lead, LeadActivity, LeadInput } from './lead-types';

@Service()
export class LeadsApi {
  private readonly authApi = inject(AuthApi);
  private readonly http = inject(HttpClient);

  readonly leads = httpResource<Lead[]>(
    () => (this.authApi.isAuthenticated() ? '/api/leads' : undefined),
    { defaultValue: [] },
  );

  readonly create = (lead: LeadInput) =>
    this.http.post<Lead>('/api/leads', lead);

  readonly update = (id: number, lead: LeadInput) =>
    this.http.put<Lead>(`/api/leads/${id}`, lead);

  readonly updateLinks = (
    id: number,
    links: { companyId?: number | null; contactIds?: number[] },
  ) => this.http.put<Lead>(`/api/leads/${id}`, links);

  readonly addNote = (id: number, body: string) =>
    this.http.post<LeadActivity>(`/api/leads/${id}/notes`, { body });
}
