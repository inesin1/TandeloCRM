import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { CompanyInput, CompaniesApi } from '../companies/companies-api';
import { ContactInput, ContactsApi } from '../contacts/contacts-api';
import { LeadInput } from '../leads/lead-types';
import { LeadsApi } from '../leads/leads-api';
import { parseCsv } from './csv-parser';

export type ImportEntity = 'lead' | 'contact' | 'company';
export interface ImportStage {
  id: number;
  name: string;
}

interface ImportRow {
  line: number;
  values: Record<string, string>;
  error: string;
  imported: boolean;
  retryable: boolean;
}

const columnLabels: Record<ImportEntity, Record<string, string>> = {
  lead: {
    name: 'Name',
    price: 'Amount',
    source: 'Source',
    companyId: 'Company ID',
    ownerId: 'Owner ID',
  },
  contact: {
    name: 'Name',
    position: 'Position',
    companyId: 'Company ID',
    email: 'Email',
    phone: 'Phone',
    ownerId: 'Owner ID',
  },
  company: {
    name: 'Name',
    industry: 'Industry',
    address: 'Address',
    email: 'Email',
    phone: 'Phone',
    ownerId: 'Owner ID',
  },
};

const aliases: Record<string, string> = {
  name: 'name',
  title: 'name',
  amount: 'price',
  price: 'price',
  source: 'source',
  companyid: 'companyId',
  ownerid: 'ownerId',
  position: 'position',
  role: 'position',
  email: 'email',
  phone: 'phone',
  industry: 'industry',
  address: 'address',
};

const maxFileBytes = 5 * 1024 * 1024;
const maxRows = 500;
const maxPostgresInteger = 2_147_483_647;

@Component({
  selector: 'app-csv-import',
  templateUrl: './csv-import.html',
  imports: [ButtonModule, DialogModule, MessageModule],
})
export class CsvImport {
  readonly entity = input.required<ImportEntity>();
  readonly pipelineId = input<number | null | undefined>(null);
  readonly statusId = input<number | null | undefined>(null);
  readonly stages = input<readonly ImportStage[]>([]);
  readonly imported = output<void>();

  private readonly leadsApi = inject(LeadsApi);
  private readonly contactsApi = inject(ContactsApi);
  private readonly companiesApi = inject(CompaniesApi);

  protected readonly visible = signal(false);
  protected readonly rows = signal<ImportRow[]>([]);
  protected readonly fileName = signal('');
  protected readonly error = signal('');
  protected readonly running = signal(false);
  protected readonly reading = signal(false);
  protected readonly done = signal(false);
  protected readonly selectedStatusId = signal<number | null>(null);
  protected readonly importedCount = computed(
    () => this.rows().filter((row) => row.imported).length,
  );
  protected readonly failedCount = computed(
    () => this.rows().filter((row) => !row.imported && row.error).length,
  );
  protected readonly pendingRows = computed(() =>
    this.rows().filter((row) => !row.imported && !row.error),
  );
  protected readonly displayedRows = computed(() =>
    this.done() ? this.rows().filter((row) => row.error) : this.rows(),
  );
  protected readonly hasRetryableRows = computed(() =>
    this.rows().some((row) => row.retryable),
  );
  protected readonly columns = computed(() =>
    Object.keys(columnLabels[this.entity()]),
  );
  protected readonly labels = computed(() => columnLabels[this.entity()]);
  protected readonly title = computed(() => `Import ${this.entityLabel()}`);
  protected readonly entityLabel = computed(
    () =>
      ({ lead: 'leads', contact: 'contacts', company: 'companies' })[
        this.entity()
      ],
  );
  protected readonly template = computed(() =>
    Object.keys(columnLabels[this.entity()]).join(','),
  );

  protected open(): void {
    this.selectedStatusId.set(this.statusId() ?? null);
    this.visible.set(true);
  }

  protected close(): void {
    if (this.running()) return;
    this.visible.set(false);
  }

  protected async selectFile(event: Event): Promise<void> {
    const inputElement = event.target as HTMLInputElement;
    const file = inputElement.files?.[0];
    inputElement.value = '';
    if (!file || this.reading() || this.running()) return;
    this.reset();
    this.fileName.set(file.name);
    if (file.size > maxFileBytes) {
      this.error.set('CSV files must be 5 MB or smaller.');
      return;
    }

    this.reading.set(true);
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.length < 2)
        throw new Error('Add a header row and at least one data row.');
      if (parsed.length - 1 > maxRows)
        throw new Error(`Import up to ${maxRows} rows at a time.`);
      this.rows.set(this.mapRows(parsed));
    } catch (cause) {
      this.error.set(
        cause instanceof Error
          ? cause.message
          : 'Could not read this CSV file.',
      );
    } finally {
      this.reading.set(false);
    }
  }

  protected async runImport(): Promise<void> {
    if (this.running() || !this.rows().length || !this.canImport()) return;
    const validRows = this.rows().filter((row) => !row.imported && !row.error);
    if (!validRows.length) return;

    this.running.set(true);
    this.done.set(false);
    let imported = 0;
    for (const current of validRows) {
      try {
        await this.createRecord(current.values);
        imported++;
        this.rows.update((rows) =>
          rows.map((row) =>
            row === current ? { ...row, imported: true } : row,
          ),
        );
      } catch (cause) {
        const retryable =
          cause instanceof HttpErrorResponse &&
          cause.status >= 400 &&
          cause.status < 500 &&
          cause.status !== 408;
        const message = retryable
          ? this.errorMessage(cause)
          : 'Could not confirm import. Check the CRM before importing this record again.';
        this.rows.update((rows) =>
          rows.map((row) =>
            row === current ? { ...row, error: message, retryable } : row,
          ),
        );
      }
    }
    this.running.set(false);
    this.done.set(true);
    if (imported) this.imported.emit();
  }

  protected async retryFailed(): Promise<void> {
    if (this.running() || !this.canImport()) return;
    this.rows.update((items) =>
      items.map((row) =>
        row.retryable ? { ...row, error: '', retryable: false } : row,
      ),
    );
    await this.runImport();
  }

  protected canImport(): boolean {
    return (
      this.entity() !== 'lead' ||
      (this.pipelineId() != null &&
        this.stages().length > 0 &&
        this.selectedStatusId() !== null &&
        this.stages().some((stage) => stage.id === this.selectedStatusId()))
    );
  }

  protected selectStage(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedStatusId.set(value ? Number(value) : null);
  }

  protected reset(): void {
    this.rows.set([]);
    this.fileName.set('');
    this.error.set('');
    this.done.set(false);
  }

  private mapRows(parsed: string[][]): ImportRow[] {
    const headers = parsed[0].map(
      (header) => aliases[this.normalize(header)] ?? '',
    );
    const supported = new Set(Object.keys(columnLabels[this.entity()]));
    const nameIndex = headers.indexOf('name');
    if (nameIndex < 0) throw new Error('Add a "name" column.');
    const unsupported = parsed[0].filter(
      (_, index) => !supported.has(headers[index]),
    );
    if (unsupported.length)
      throw new Error(`Unsupported columns: ${unsupported.join(', ')}.`);

    if (new Set(headers).size !== headers.length)
      throw new Error('Use each column only once.');

    return parsed.slice(1).map((values, index) => {
      const mapped = Object.fromEntries(
        headers.flatMap((header, column) =>
          header && supported.has(header)
            ? [[header, values[column] ?? '']]
            : [],
        ),
      );
      const row: ImportRow = {
        line: index + 2,
        values: mapped,
        error: '',
        imported: false,
        retryable: false,
      };
      row.error =
        values.length > headers.length
          ? 'This row has more values than the header.'
          : this.validateRow(row.values);
      return row;
    });
  }

  private validateRow(values: Record<string, string>): string {
    if (!values['name']?.trim()) return 'Name is required.';
    for (const field of ['companyId', 'ownerId']) {
      if (
        values[field] &&
        (!/^\d+$/.test(values[field]) ||
          Number(values[field]) < 1 ||
          Number(values[field]) > maxPostgresInteger)
      )
        return `${field === 'companyId' ? 'Company ID' : 'Owner ID'} must be a positive integer.`;
    }
    if (values['email'] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values['email']))
      return 'Email address is invalid.';
    if (
      this.entity() === 'lead' &&
      values['price'] &&
      (!/^\d+$/.test(values['price']) ||
        Number(values['price']) > maxPostgresInteger)
    )
      return 'Amount must be a non-negative whole number.';
    return '';
  }

  private async createRecord(values: Record<string, string>): Promise<void> {
    const ownerId = values['ownerId'] ? Number(values['ownerId']) : null;
    const companyId = values['companyId'] ? Number(values['companyId']) : null;
    if (this.entity() === 'lead') {
      const pipelineId = this.pipelineId();
      const statusId = this.selectedStatusId();
      if (pipelineId == null || statusId == null)
        throw new Error('Choose a pipeline and stage before importing deals.');
      const payload: LeadInput = {
        name: values['name'].trim(),
        pipelineId,
        statusId,
        price: Number(values['price'] || 0),
        source: values['source'] || null,
        companyId,
        ownerId,
        contactIds: [],
        customFields: {},
      };
      await firstValueFrom(this.leadsApi.create(payload));
    } else if (this.entity() === 'contact') {
      const payload: ContactInput = {
        name: values['name'].trim(),
        position: values['position'] || null,
        companyId,
        email: values['email'] || null,
        phone: values['phone'] || null,
        ownerId,
        customFields: {},
      };
      await firstValueFrom(this.contactsApi.create(payload));
    } else {
      const payload: CompanyInput = {
        name: values['name'].trim(),
        industry: values['industry'] || null,
        address: values['address'] || null,
        email: values['email'] || null,
        phone: values['phone'] || null,
        ownerId,
        customFields: {},
      };
      await firstValueFrom(this.companiesApi.create(payload));
    }
  }

  private normalize(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private errorMessage(cause: unknown): string {
    if (cause instanceof HttpErrorResponse) {
      const detail = cause.error?.message;
      return Array.isArray(detail)
        ? detail.join(' ')
        : typeof detail === 'string'
          ? detail
          : `Import failed with status ${cause.status}.`;
    }
    return 'Could not create this record.';
  }
}
