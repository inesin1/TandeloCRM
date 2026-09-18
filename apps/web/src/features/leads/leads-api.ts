import { inject, Service } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { AuthApi } from '../auth/auth-api';
import { Company } from '../companies/companies-api';
import { Contact } from '../contacts/contacts-api';
import { User } from '../settings/tabs/users-tab/users-api';
import { Status } from './pipelines-api';

export interface Lead {
  id: number;
  name: string;
  price: number;
  pipelineId: number;
  statusId: number;
  ownerId: number | null;
  updatedAt: string;
  status: Pick<Status, 'id' | 'name' | 'color'>;
  company: Pick<Company, 'id' | 'name'> | null;
  owner: Pick<User, 'id' | 'name' | 'email'> | null;
  contacts: Contact[];
}

@Service()
export class LeadsApi {
  private readonly authApi = inject(AuthApi);

  readonly leads = httpResource<Lead[]>(
    () => (this.authApi.isAuthenticated() ? '/api/leads' : undefined),
    { defaultValue: [] },
  );
}
