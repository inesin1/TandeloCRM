import { CurrencyPipe, DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import {
  Company,
  CompanyInput,
  CompaniesApi,
} from '../../companies/companies-api';
import {
  Contact,
  ContactInput,
  ContactsApi,
} from '../../contacts/contacts-api';
import { LeadCustomField } from '../../leads/lead-types';
import { LeadsApi } from '../../leads/leads-api';
import { UsersApi } from '../../settings/tabs/users-tab/users-api';
import {
  LinkedLead,
  RecordActivity,
  RecordDraft,
  RECORD_API_RESOURCES,
  RecordKind,
} from '../record-types';

function toDraft(record: Contact | Company): RecordDraft {
  return {
    name: record.name,
    position: 'position' in record ? record.position : null,
    industry: 'industry' in record ? record.industry : null,
    address: 'address' in record ? record.address : null,
    email: record.email,
    phone: record.phone,
    companyId: 'companyId' in record ? record.companyId : null,
    ownerId: record.ownerId,
    customFields: { ...record.customFields },
  };
}

@Component({
  templateUrl: './record-detail-page.html',
  styleUrl: '../detail-page.css',
  host: { class: 'block h-full' },
  imports: [
    DatePipe,
    CurrencyPipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    MessageModule,
    SelectModule,
  ],
})
export class RecordDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly contactsApi = inject(ContactsApi);
  private readonly companiesApi = inject(CompaniesApi);
  private readonly leadsApi = inject(LeadsApi);
  private readonly titleInput =
    viewChild<ElementRef<HTMLInputElement>>('titleInput');
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  protected readonly kind = this.route.snapshot.data[
    'recordKind'
  ] as RecordKind;
  protected readonly apiResource = RECORD_API_RESOURCES[this.kind];
  protected readonly label = this.kind === 'contact' ? 'Contact' : 'Company';
  protected readonly basePath =
    this.kind === 'contact' ? '/contacts' : '/companies';
  protected readonly isNew = computed(() => this.params().get('id') === 'new');
  protected readonly id = computed(() => {
    const id = Number(this.params().get('id'));
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  });
  protected readonly invalidId = computed(
    () => !this.isNew() && this.id() === null,
  );
  protected readonly record = httpResource<Contact | Company>(() => {
    const id = this.id();
    return id === null ? undefined : `/api/${this.apiResource}/${id}`;
  });
  protected readonly links = httpResource<LinkedLead[]>(
    () => {
      const id = this.id();
      return id === null ? undefined : `/api/${this.apiResource}/${id}/leads`;
    },
    { defaultValue: [] },
  );
  protected readonly activity = httpResource<RecordActivity[]>(
    () => {
      const id = this.id();
      return id === null
        ? undefined
        : `/api/${this.apiResource}/${id}/activity`;
    },
    { defaultValue: [] },
  );
  protected readonly customFields = httpResource<LeadCustomField[]>(
    () => `/api/custom-fields?entityType=${this.kind}`,
    { defaultValue: [] },
  );
  protected readonly companies = this.companiesApi.companies;
  protected readonly contacts = this.contactsApi.contacts;
  protected readonly users = inject(UsersApi).users;
  protected readonly leads = this.leadsApi.leads;
  protected readonly booleanOptions = [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ];

  protected readonly draft = linkedSignal<RecordDraft>(() => {
    const record = this.record.hasValue() ? this.record.value() : undefined;
    if (record && record.id === this.id()) return toDraft(record);
    return {
      name: `New ${this.kind} · ${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date())}`,
      position: null,
      industry: null,
      address: null,
      email: null,
      phone: null,
      companyId: null,
      ownerId: null,
      customFields: {},
    };
  });
  protected readonly selectedCompany = computed(() =>
    this.companies.hasValue()
      ? this.companies
          .value()
          .find((company) => company.id === this.draft().companyId)
      : undefined,
  );
  protected readonly companyContacts = computed(() =>
    this.kind === 'company' && this.id() !== null && this.contacts.hasValue()
      ? this.contacts
          .value()
          .filter((contact) => contact.companyId === this.id())
      : [],
  );
  protected readonly availableCompanyContacts = computed(() =>
    this.kind === 'company' && this.id() !== null && this.contacts.hasValue()
      ? this.contacts
          .value()
          .filter((contact) => contact.companyId !== this.id())
      : [],
  );
  protected readonly availableLeads = computed(() => {
    if (!this.leads.hasValue()) return [];
    const linkedIds = new Set(this.links.value().map((lead) => lead.id));
    return this.leads.value().filter((lead) => !linkedIds.has(lead.id));
  });
  protected readonly loadError = computed(
    () =>
      this.record.error() ??
      this.customFields.error() ??
      this.companies.error() ??
      this.contacts.error() ??
      this.users.error(),
  );
  protected readonly isLoading = computed(
    () =>
      (!this.isNew() && this.record.isLoading()) ||
      this.customFields.isLoading() ||
      this.companies.isLoading() ||
      this.contacts.isLoading() ||
      this.users.isLoading(),
  );
  protected readonly hasChanges = computed(() => {
    if (this.isNew() || !this.record.hasValue()) return false;
    const saved = toDraft(this.record.value());
    const draft = this.draft();
    return (
      (this.kind === 'contact'
        ? draft.name !== saved.name ||
          draft.position !== saved.position ||
          draft.companyId !== saved.companyId
        : draft.name !== saved.name ||
          draft.industry !== saved.industry ||
          draft.address !== saved.address) ||
      draft.email !== saved.email ||
      draft.phone !== saved.phone ||
      draft.ownerId !== saved.ownerId ||
      JSON.stringify(draft.customFields) !== JSON.stringify(saved.customFields)
    );
  });
  protected readonly showActions = computed(
    () => this.isNew() || this.hasChanges(),
  );
  protected readonly canSave = computed(
    () =>
      !this.invalidId() &&
      !this.loadError() &&
      !this.isLoading() &&
      !this.isSaving() &&
      !!this.draft().name.trim() &&
      this.customFields
        .value()
        .every(
          (field) =>
            !field.isRequired ||
            (Object.hasOwn(this.draft().customFields, field.key) &&
              this.draft().customFields[field.key] !== null &&
              this.draft().customFields[field.key] !== undefined &&
              String(this.draft().customFields[field.key]).trim() !== ''),
        ),
  );
  protected readonly isSaving = signal(false);
  protected readonly isEditingName = signal(false);
  protected readonly isNewDirty = signal(false);
  protected readonly saveError = signal('');
  protected readonly noteText = signal('');
  protected readonly noteError = signal('');
  protected readonly isPostingNote = signal(false);
  protected readonly linkError = signal('');
  protected readonly busyLeadId = signal<number | null>(null);
  protected readonly contactLinkError = signal('');
  protected readonly busyContactId = signal<number | null>(null);

  canLeave() {
    return (
      (!this.hasChanges() &&
        !(this.isNew() && this.isNewDirty()) &&
        !this.noteText().trim()) ||
      window.confirm(`Discard unsaved changes to this ${this.kind}?`)
    );
  }

  protected retry() {
    this.record.reload();
    this.customFields.reload();
    this.companies.reload();
    this.contacts.reload();
    this.users.reload();
  }

  protected editName() {
    this.isEditingName.set(true);
    setTimeout(() => this.titleInput()?.nativeElement.focus());
  }

  protected updateField<K extends keyof RecordDraft>(
    field: K,
    value: RecordDraft[K],
  ) {
    this.draft.update((draft) => ({ ...draft, [field]: value }));
    this.isNewDirty.set(true);
    this.saveError.set('');
  }

  protected updateCompany(event: Event) {
    const select = event.target as HTMLSelectElement;
    const id = Number(select.value);
    select.value = '';
    if (id > 0) this.updateField('companyId', id);
  }

  protected updateCustomField(field: LeadCustomField, value: unknown) {
    const customFields = { ...this.draft().customFields };
    if (value === null || value === undefined || value === '') {
      delete customFields[field.key];
    } else {
      customFields[field.key] =
        field.type === 'date' ? `${value}T00:00:00Z` : value;
    }
    this.updateField('customFields', customFields);
  }

  protected customFieldValue(field: LeadCustomField) {
    const value = this.draft().customFields[field.key];
    return field.type === 'date' && typeof value === 'string'
      ? value.slice(0, 10)
      : (value ?? null);
  }

  protected initials(name: string) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }

  protected async cancel() {
    if (this.isNew()) {
      this.isNewDirty.set(false);
      await this.router.navigate([this.basePath]);
      return;
    }
    if (!this.record.hasValue()) return;
    this.draft.set(toDraft(this.record.value()));
    this.isEditingName.set(false);
    this.saveError.set('');
  }

  protected async save() {
    if (!this.canSave()) return;
    const draft = this.draft();
    const id = this.id();
    this.isSaving.set(true);
    this.saveError.set('');
    try {
      const common = {
        name: draft.name.trim(),
        email: draft.email?.trim() || null,
        phone: draft.phone?.trim() || null,
        ownerId: draft.ownerId,
        customFields: { ...draft.customFields },
      };
      const result =
        this.kind === 'contact'
          ? await firstValueFrom(
              id === null
                ? this.contactsApi.create({
                    ...common,
                    position: draft.position?.trim() || null,
                    companyId: draft.companyId,
                  } satisfies ContactInput)
                : this.contactsApi.update(id, {
                    ...common,
                    position: draft.position?.trim() || null,
                    companyId: draft.companyId,
                  } satisfies ContactInput),
            )
          : await firstValueFrom(
              id === null
                ? this.companiesApi.create({
                    ...common,
                    industry: draft.industry?.trim() || null,
                    address: draft.address?.trim() || null,
                  } satisfies CompanyInput)
                : this.companiesApi.update(id, {
                    ...common,
                    industry: draft.industry?.trim() || null,
                    address: draft.address?.trim() || null,
                  } satisfies CompanyInput),
            );
      if (this.destroyRef.destroyed || this.id() !== id) return;
      if (this.kind === 'contact') {
        const contact = result as Contact;
        this.contacts.update((items) =>
          id === null
            ? [...items, contact]
            : items.map((item) => (item.id === contact.id ? contact : item)),
        );
      } else {
        const company = result as Company;
        this.companies.update((items) =>
          id === null
            ? [...items, company]
            : items.map((item) => (item.id === company.id ? company : item)),
        );
      }
      this.isNewDirty.set(false);
      if (id === null) {
        await this.router.navigate([this.basePath, result.id], {
          replaceUrl: true,
        });
      } else {
        this.record.set(result);
        this.activity.reload();
      }
    } catch {
      if (!this.destroyRef.destroyed)
        this.saveError.set(
          `Could not save this ${this.kind}. Please try again.`,
        );
    } finally {
      if (!this.destroyRef.destroyed) this.isSaving.set(false);
    }
  }

  protected async postNote() {
    const id = this.id();
    const body = this.noteText().trim();
    if (id === null || !body || this.isPostingNote()) return;
    this.isPostingNote.set(true);
    this.noteError.set('');
    try {
      await firstValueFrom(
        this.kind === 'contact'
          ? this.contactsApi.addNote(id, body)
          : this.companiesApi.addNote(id, body),
      );
      if (this.destroyRef.destroyed || this.id() !== id) return;
      this.noteText.set('');
      this.activity.reload();
    } catch {
      if (!this.destroyRef.destroyed)
        this.noteError.set('Could not add the note. Please try again.');
    } finally {
      if (!this.destroyRef.destroyed) this.isPostingNote.set(false);
    }
  }

  protected async addLead(event: Event) {
    const select = event.target as HTMLSelectElement;
    const leadId = Number(select.value);
    select.value = '';
    const lead = this.leads.value().find((item) => item.id === leadId);
    if (!lead || this.id() === null) return;
    await this.changeLeadLink(lead, true);
  }

  protected async removeLead(leadId: number) {
    const lead = this.leads.value().find((item) => item.id === leadId);
    if (lead) await this.changeLeadLink(lead, false);
  }

  protected async addCompanyContact(event: Event) {
    const companyId = this.id();
    if (companyId === null) return;
    const select = event.target as HTMLSelectElement;
    const contactId = Number(select.value);
    select.value = '';
    const contact = this.contacts.value().find((item) => item.id === contactId);
    if (contact) await this.changeContactCompany(contact, companyId);
  }

  protected async removeCompanyContact(contact: Contact) {
    await this.changeContactCompany(contact, null);
  }

  private async changeContactCompany(
    contact: Contact,
    companyId: number | null,
  ) {
    if (this.busyContactId() !== null) return;
    this.busyContactId.set(contact.id);
    this.contactLinkError.set('');
    try {
      const updated = await firstValueFrom(
        this.contactsApi.update(contact.id, {
          name: contact.name,
          position: contact.position,
          companyId,
          email: contact.email,
          phone: contact.phone,
          ownerId: contact.ownerId,
          customFields: contact.customFields,
        }),
      );
      if (this.destroyRef.destroyed) return;
      this.contacts.update((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch {
      if (!this.destroyRef.destroyed)
        this.contactLinkError.set(
          'Could not update the contact link. Please try again.',
        );
    } finally {
      if (!this.destroyRef.destroyed) this.busyContactId.set(null);
    }
  }

  private async changeLeadLink(
    lead: import('../../leads/lead-types').Lead,
    add: boolean,
  ) {
    const recordId = this.id();
    if (recordId === null || this.busyLeadId() !== null) return;
    this.busyLeadId.set(lead.id);
    this.linkError.set('');
    try {
      const links =
        this.kind === 'contact'
          ? {
              contactIds: add
                ? [...lead.contacts.map((contact) => contact.id), recordId]
                : lead.contacts
                    .filter((contact) => contact.id !== recordId)
                    .map((contact) => contact.id),
            }
          : { companyId: add ? recordId : null };
      const updated = await firstValueFrom(
        this.leadsApi.updateLinks(lead.id, links),
      );
      if (this.destroyRef.destroyed || this.id() !== recordId) return;
      this.leads.update((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      this.links.update((items) =>
        add
          ? [
              ...items,
              {
                id: updated.id,
                name: updated.name,
                price: updated.price,
                status: updated.status,
              },
            ]
          : items.filter((item) => item.id !== updated.id),
      );
      this.activity.reload();
    } catch {
      if (!this.destroyRef.destroyed)
        this.linkError.set(
          'Could not update the linked lead. Please try again.',
        );
    } finally {
      if (!this.destroyRef.destroyed) this.busyLeadId.set(null);
    }
  }
}
