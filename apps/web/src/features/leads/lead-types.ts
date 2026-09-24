import { Company } from '../companies/companies-api';
import { Contact } from '../contacts/contacts-api';
import { User } from '../settings/tabs/users-tab/users-api';
import { Status } from './pipelines-api';

export interface Lead {
  id: number;
  name: string;
  price: number;
  source: string | null;
  pipelineId: number;
  statusId: number;
  ownerId: number | null;
  createdAt: string;
  updatedAt: string;
  customFields: Record<string, unknown>;
  status: Pick<Status, 'id' | 'name' | 'color'>;
  company: Pick<Company, 'id' | 'name'> | null;
  owner: Pick<User, 'id' | 'name' | 'email'> | null;
  contacts: Contact[];
}

export interface LeadInput {
  name: string;
  pipelineId: number;
  statusId: number;
  price: number;
  companyId: number | null;
  ownerId: number | null;
  contactIds: number[];
  customFields: Record<string, unknown>;
}

export type LeadDraft = Omit<LeadInput, 'price' | 'pipelineId' | 'statusId'> & {
  price: number | null;
  pipelineId: number | null;
  statusId: number | null;
};

export interface LeadCustomField {
  id: number;
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  options: string[] | null;
  isRequired: boolean;
}

export interface LeadActivity {
  id: number;
  kind: 'created' | 'updated' | 'note';
  body: string;
  createdAt: string;
  author: { id: number; name: string } | null;
}
