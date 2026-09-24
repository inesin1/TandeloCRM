import { inject, Service } from '@angular/core';
import { HttpClient, httpResource } from '@angular/common/http';
import { AuthApi } from '../auth/auth-api';

export interface Contact {
  id: number;
  name: string;
  position: string | null;
  companyId: number | null;
  email: string | null;
  phone: string | null;
  ownerId: number | null;
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type ContactInput = Pick<
  Contact,
  | 'name'
  | 'position'
  | 'companyId'
  | 'email'
  | 'phone'
  | 'ownerId'
  | 'customFields'
>;

@Service()
export class ContactsApi {
  private readonly authApi = inject(AuthApi);
  private readonly http = inject(HttpClient);

  readonly contacts = httpResource<Contact[]>(
    () => (this.authApi.isAuthenticated() ? '/api/contacts' : undefined),
    { defaultValue: [] },
  );

  create(contact: ContactInput) {
    return this.http.post<Contact>('/api/contacts', contact);
  }

  update(id: number, contact: ContactInput) {
    return this.http.put<Contact>(`/api/contacts/${id}`, contact);
  }

  addNote(id: number, body: string) {
    return this.http.post(`/api/contacts/${id}/notes`, { body });
  }
}
