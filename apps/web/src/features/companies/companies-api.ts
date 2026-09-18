import { inject, Service } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { AuthApi } from '../auth/auth-api';

export interface Company {
  id: number;
  name: string;
  industry: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  ownerId: number | null;
}

@Service()
export class CompaniesApi {
  private readonly authApi = inject(AuthApi);

  readonly companies = httpResource<Company[]>(
    () => (this.authApi.isAuthenticated() ? '/api/companies' : undefined),
    { defaultValue: [] },
  );
}
