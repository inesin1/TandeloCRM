import { inject, Service } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { AuthApi } from '../auth/auth-api';

export interface Contact {
  id: number;
  name: string;
  position: string | null;
  companyId: number | null;
  email: string | null;
  phone: string | null;
  ownerId: number | null;
}

@Service()
export class ContactsApi {
  private readonly authApi = inject(AuthApi);

  readonly contacts = httpResource<Contact[]>(
    () => (this.authApi.isAuthenticated() ? '/api/contacts' : undefined),
    { defaultValue: [] },
  );
}
