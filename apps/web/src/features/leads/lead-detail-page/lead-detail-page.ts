import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { MessageModule } from 'primeng/message';
import { LeadsApi } from '../leads-api';
import {
  Lead,
  LeadActivity,
  LeadCustomField,
  LeadDraft,
  LeadInput,
} from '../lead-types';
import { PipelinesApi, Status } from '../pipelines-api';
import { ContactsApi } from '../../contacts/contacts-api';
import { CompaniesApi } from '../../companies/companies-api';
import { UsersApi } from '../../settings/tabs/users-tab/users-api';
import { Task, TaskInput, TaskType, TasksApi } from '../../tasks/tasks-api';

function toDraft(lead: Lead): LeadDraft {
  return {
    name: lead.name,
    pipelineId: lead.pipelineId,
    statusId: lead.statusId,
    price: lead.price,
    companyId: lead.company?.id ?? null,
    ownerId: lead.ownerId,
    contactIds: lead.contacts.map((contact) => contact.id),
    customFields: { ...lead.customFields },
  };
}

@Component({
  templateUrl: './lead-detail-page.html',
  styleUrls: ['../../records/detail-page.css', './lead-detail-page.css'],
  host: { class: 'block h-full' },
  imports: [
    FormsModule,
    DatePipe,
    RouterLink,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    MessageModule,
  ],
})
export class LeadDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly leadsApi = inject(LeadsApi);
  private readonly tasksApi = inject(TasksApi);
  private readonly titleInput =
    viewChild<ElementRef<HTMLInputElement>>('titleInput');
  private readonly routeParams = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  protected readonly isNew = computed(
    () => this.routeParams().get('id') === 'new',
  );
  protected readonly id = computed(() => {
    const id = Number(this.routeParams().get('id'));
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  });
  protected readonly invalidId = computed(
    () => !this.isNew() && this.id() === null,
  );
  protected readonly lead = httpResource<Lead>(() => {
    const id = this.id();
    return id === null ? undefined : `/api/leads/${id}`;
  });
  protected readonly pipelines = inject(PipelinesApi).pipelines;
  protected readonly contacts = inject(ContactsApi).contacts;
  protected readonly companies = inject(CompaniesApi).companies;
  protected readonly users = inject(UsersApi).users;
  protected readonly booleanOptions = [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ];
  protected readonly selectedCompany = computed(() =>
    this.companies.hasValue()
      ? this.companies
          .value()
          .find((company) => company.id === this.draft().companyId)
      : undefined,
  );
  protected readonly selectedContacts = computed(() =>
    this.contacts.hasValue()
      ? this.contacts
          .value()
          .filter((contact) => this.draft().contactIds.includes(contact.id))
      : [],
  );
  protected readonly availableContacts = computed(() =>
    this.contacts.hasValue()
      ? this.contacts
          .value()
          .filter((contact) => !this.draft().contactIds.includes(contact.id))
      : [],
  );
  protected readonly customFields = httpResource<LeadCustomField[]>(
    () => '/api/custom-fields?entityType=lead',
    { defaultValue: [] },
  );
  protected readonly isSaving = signal(false);
  protected readonly saveError = signal('');
  protected readonly saved = signal(false);
  protected readonly isDirty = signal(false);
  protected readonly isEditingName = signal(false);

  protected readonly draft = linkedSignal<LeadDraft>(() => {
    const id = this.id();
    const lead = this.lead.hasValue() ? this.lead.value() : undefined;
    if (lead && lead.id === id) return toDraft(lead);
    return {
      name: `New lead · ${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date())}`,
      pipelineId: null,
      statusId: null,
      price: null,
      companyId: null,
      ownerId: null,
      contactIds: [],
      customFields: {},
    };
  });

  private readonly pipelineId = computed(() => this.draft().pipelineId);
  protected readonly statuses = httpResource<Status[]>(
    () => {
      const pipelineId = this.pipelineId();
      return pipelineId === null
        ? undefined
        : `/api/pipelines/${pipelineId}/statuses`;
    },
    { defaultValue: [] },
  );
  protected readonly selectedPipeline = computed(() =>
    this.pipelines.hasValue()
      ? this.pipelines.value().find((item) => item.id === this.pipelineId())
      : undefined,
  );
  protected readonly selectedStatus = computed(() =>
    this.statuses.hasValue()
      ? this.statuses.value().find((item) => item.id === this.draft().statusId)
      : undefined,
  );
  protected readonly statusProgress = computed(() => {
    if (!this.statuses.hasValue()) return 0;
    const options = this.statuses.value();
    const index = options.findIndex(
      (item) => item.id === this.draft().statusId,
    );
    return index < 0 ? 0 : ((index + 1) / options.length) * 100;
  });
  protected readonly activity = httpResource<LeadActivity[]>(
    () => {
      const id = this.id();
      return id === null ? undefined : `/api/leads/${id}/activity`;
    },
    { defaultValue: [] },
  );
  protected readonly tasks = httpResource<Task[]>(
    () => {
      const id = this.id();
      return id === null ? undefined : `/api/tasks?leadId=${id}`;
    },
    { defaultValue: [] },
  );
  protected readonly activityItems = computed(() => {
    if (
      !this.lead.hasValue() ||
      this.lead.value().id !== this.id() ||
      !this.activity.hasValue()
    )
      return [];
    const entries = this.activity.value();
    return (
      entries.some((item) => item.kind === 'created')
        ? entries
        : [
            {
              id: 0,
              kind: 'created' as const,
              body: 'Lead created',
              createdAt: this.lead.value().createdAt,
              author: null,
            },
            ...entries,
          ]
    ).toSorted((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
  });
  protected readonly loadError = computed(
    () =>
      this.lead.error() ??
      this.pipelines.error() ??
      this.contacts.error() ??
      this.companies.error() ??
      this.users.error() ??
      this.customFields.error(),
  );
  protected readonly isLoading = computed(
    () =>
      (!this.isNew() && this.lead.isLoading()) ||
      this.pipelines.isLoading() ||
      this.contacts.isLoading() ||
      this.companies.isLoading() ||
      this.users.isLoading() ||
      this.customFields.isLoading(),
  );
  protected readonly canSave = computed(() => {
    const draft = this.draft();
    return (
      !this.invalidId() &&
      !this.loadError() &&
      !this.isLoading() &&
      !this.isSaving() &&
      (this.isNew() || this.lead.hasValue()) &&
      !!draft.name.trim() &&
      !this.statuses.isLoading() &&
      !this.statuses.error() &&
      this.statuses
        .value()
        .some(
          (item) =>
            item.id === draft.statusId && item.pipelineId === draft.pipelineId,
        ) &&
      (draft.price === null ||
        (Number.isSafeInteger(draft.price) && draft.price >= 0)) &&
      this.customFields
        .value()
        .every(
          (field) =>
            !field.isRequired ||
            (Object.hasOwn(draft.customFields, field.key) &&
              draft.customFields[field.key] !== null &&
              draft.customFields[field.key] !== undefined &&
              String(draft.customFields[field.key]).trim() !== ''),
        )
    );
  });
  protected readonly hasChanges = computed(() => {
    if (this.isNew() || !this.lead.hasValue()) return false;
    const saved = toDraft(this.lead.value());
    const draft = this.draft();
    return (
      draft.name !== saved.name ||
      draft.pipelineId !== saved.pipelineId ||
      draft.statusId !== saved.statusId ||
      draft.price !== saved.price ||
      draft.companyId !== saved.companyId ||
      draft.ownerId !== saved.ownerId ||
      [...draft.contactIds].sort((a, b) => a - b).join(',') !==
        [...saved.contactIds].sort((a, b) => a - b).join(',') ||
      JSON.stringify(draft.customFields) !== JSON.stringify(saved.customFields)
    );
  });
  protected readonly showActions = computed(
    () => this.isNew() || this.hasChanges(),
  );

  protected readonly noteText = signal('');
  protected readonly noteError = signal('');
  protected readonly isPostingNote = signal(false);
  protected readonly showTaskForm = signal(false);
  protected readonly taskError = signal('');
  protected readonly isSavingTask = signal(false);
  protected readonly busyTaskId = signal<number | null>(null);
  protected readonly taskTypes: { label: string; value: TaskType }[] = [
    { label: 'Call', value: 'call' },
    { label: 'Email', value: 'email' },
    { label: 'Meeting', value: 'meeting' },
    { label: 'Document', value: 'document' },
  ];
  protected readonly taskDraft = signal({
    text: '',
    type: 'call' as TaskType,
    dueAt: '',
    assigneeId: null as number | null,
  });

  constructor() {
    effect(() => {
      if (!this.isNew() || this.pipelines.error() || !this.pipelines.hasValue())
        return;
      if (this.draft().pipelineId !== null) return;
      const requested = Number(
        this.route.snapshot.queryParamMap.get('pipelineId'),
      );
      const pipeline =
        this.pipelines.value().find((item) => item.id === requested) ??
        this.pipelines.value()[0];
      if (pipeline)
        this.draft.update((value) => ({ ...value, pipelineId: pipeline.id }));
    });
    effect(() => {
      const draft = this.draft();
      if (
        draft.statusId !== null ||
        this.statuses.isLoading() ||
        this.statuses.error()
      )
        return;
      const options = this.statuses
        .value()
        .filter((item) => item.pipelineId === draft.pipelineId);
      const requested = Number(
        this.route.snapshot.queryParamMap.get('statusId'),
      );
      const status =
        options.find((item) => this.isNew() && item.id === requested) ??
        options[0];
      if (status)
        this.draft.update((value) => ({ ...value, statusId: status.id }));
    });
  }

  canLeave() {
    return (
      (!this.hasChanges() &&
        !(this.isNew() && this.isDirty()) &&
        !this.noteText().trim() &&
        !this.taskDraft().text.trim() &&
        !this.taskDraft().dueAt) ||
      window.confirm('Discard unsaved changes to this lead?')
    );
  }

  protected editName() {
    this.isEditingName.set(true);
    setTimeout(() => this.titleInput()?.nativeElement.focus());
  }

  protected updateField<K extends keyof LeadDraft>(
    field: K,
    value: LeadDraft[K],
  ) {
    this.draft.update((draft) => ({ ...draft, [field]: value }));
    this.isDirty.set(true);
    this.saved.set(false);
    this.saveError.set('');
  }

  protected onPipelineChange(pipelineId: number) {
    this.draft.update((draft) => ({ ...draft, pipelineId, statusId: null }));
    this.isDirty.set(true);
    this.saved.set(false);
    this.saveError.set('');
  }

  protected updateContacts(contactIds: number[] | null) {
    this.updateField('contactIds', contactIds ?? []);
  }

  protected addContact(event: Event) {
    const select = event.target as HTMLSelectElement;
    const contactId = Number(select.value);
    select.value = '';
    if (contactId > 0 && !this.draft().contactIds.includes(contactId)) {
      this.updateContacts([...this.draft().contactIds, contactId]);
    }
  }

  protected changeCompany(event: Event) {
    const select = event.target as HTMLSelectElement;
    const companyId = Number(select.value);
    select.value = '';
    if (companyId > 0) this.updateField('companyId', companyId);
  }

  protected removeContact(contactId: number) {
    this.updateContacts(
      this.draft().contactIds.filter((id) => id !== contactId),
    );
  }

  protected initials(name: string) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
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

  protected retry() {
    this.lead.reload();
    this.pipelines.reload();
    this.contacts.reload();
    this.companies.reload();
    this.users.reload();
    this.customFields.reload();
  }

  protected async cancel() {
    if (this.isNew()) {
      this.isDirty.set(false);
      await this.router.navigate(['/leads']);
      return;
    }
    if (!this.lead.hasValue()) return;
    this.draft.set(toDraft(this.lead.value()));
    this.isDirty.set(false);
    this.isEditingName.set(false);
    this.saved.set(false);
    this.saveError.set('');
  }

  protected async save() {
    if (!this.canSave()) return;
    const draft = this.draft();
    if (draft.pipelineId === null || draft.statusId === null) return;
    const payload: LeadInput = {
      name: draft.name.trim(),
      pipelineId: draft.pipelineId,
      statusId: draft.statusId,
      price: draft.price ?? 0,
      companyId: draft.companyId,
      ownerId: draft.ownerId,
      contactIds: [...draft.contactIds],
      customFields: { ...draft.customFields },
    };
    const id = this.id();
    this.isSaving.set(true);
    this.saveError.set('');
    this.saved.set(false);
    try {
      const lead = await firstValueFrom(
        id === null
          ? this.leadsApi.create(payload)
          : this.leadsApi.update(id, payload),
      );
      this.leadsApi.leads.reload();
      if (this.destroyRef.destroyed || this.id() !== id) return;
      this.isDirty.set(false);
      if (id === null) {
        await this.router.navigate(['/leads', lead.id], { replaceUrl: true });
      } else {
        this.lead.set(lead);
        this.activity.reload();
        this.saved.set(true);
      }
    } catch {
      if (!this.destroyRef.destroyed)
        this.saveError.set('Could not save this lead. Please try again.');
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
      await firstValueFrom(this.leadsApi.addNote(id, body));
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

  protected updateTaskDraft<K extends keyof ReturnType<typeof this.taskDraft>>(
    field: K,
    value: ReturnType<typeof this.taskDraft>[K],
  ) {
    this.taskDraft.update((draft) => ({ ...draft, [field]: value }));
  }

  protected async addTask() {
    const id = this.id();
    const draft = this.taskDraft();
    if (
      id === null ||
      !draft.text.trim() ||
      !draft.dueAt ||
      this.isSavingTask()
    )
      return;
    const dueAt = new Date(draft.dueAt);
    if (Number.isNaN(dueAt.getTime())) {
      this.taskError.set('Choose a valid due date.');
      return;
    }
    const payload: TaskInput = {
      leadId: id,
      type: draft.type,
      text: draft.text.trim(),
      dueAt: dueAt.toISOString(),
      assigneeId: draft.assigneeId,
    };
    this.isSavingTask.set(true);
    this.taskError.set('');
    try {
      const created = await firstValueFrom(this.tasksApi.create(payload));
      if (this.destroyRef.destroyed || this.id() !== id) return;
      const withCreated = (items: Task[]) =>
        [...items, created].sort(
          (a, b) => a.dueAt.localeCompare(b.dueAt) || a.id - b.id,
        );
      this.tasks.update(withCreated);
      if (this.tasksApi.tasks.hasValue())
        this.tasksApi.tasks.update(withCreated);
      this.taskDraft.set({
        text: '',
        type: 'call',
        dueAt: '',
        assigneeId: null,
      });
      this.showTaskForm.set(false);
    } catch {
      if (!this.destroyRef.destroyed)
        this.taskError.set('Could not add the task. Please try again.');
    } finally {
      if (!this.destroyRef.destroyed) this.isSavingTask.set(false);
    }
  }

  protected async toggleTask(task: Task) {
    if (this.busyTaskId() !== null) return;
    const id = this.id();
    this.busyTaskId.set(task.id);
    this.taskError.set('');
    this.tasks.update((items) =>
      items.map((item) =>
        item.id === task.id
          ? { ...item, isCompleted: !task.isCompleted }
          : item,
      ),
    );
    try {
      const updated = await firstValueFrom(
        this.tasksApi.setCompleted(task.id, !task.isCompleted),
      );
      if (this.destroyRef.destroyed || this.id() !== id) return;
      const withUpdated = (items: Task[]) =>
        items.map((item) => (item.id === task.id ? updated : item));
      this.tasks.update(withUpdated);
      if (this.tasksApi.tasks.hasValue())
        this.tasksApi.tasks.update(withUpdated);
    } catch {
      if (!this.destroyRef.destroyed && this.id() === id) {
        this.tasks.update((items) =>
          items.map((item) => (item.id === task.id ? task : item)),
        );
        this.taskError.set('Could not update the task. Please try again.');
      }
    } finally {
      if (!this.destroyRef.destroyed) this.busyTaskId.set(null);
    }
  }
}
