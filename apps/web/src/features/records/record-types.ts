export type RecordKind = 'contact' | 'company';

export interface RecordDraft {
  name: string;
  position: string | null;
  industry: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  companyId: number | null;
  ownerId: number | null;
  customFields: Record<string, unknown>;
}

export interface LinkedLead {
  id: number;
  name: string;
  price: number;
  status: { id: number; name: string; color: string };
}

export interface RecordActivity {
  id: string;
  kind: 'created' | 'updated' | 'note';
  body: string;
  createdAt: string;
  author: { id: number; name: string } | null;
  lead: { id: number; name: string } | null;
}
