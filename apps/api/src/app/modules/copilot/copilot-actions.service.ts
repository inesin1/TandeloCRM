import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { and, eq, lt } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { PermissionsService } from '../access-control/permissions.service';
import { DATABASE_CONNECTION, Database, DatabaseExecutor, DatabaseTransaction } from '../database/database.module';
import { permissions, rolePermissions, userRoles } from '../access-control/access-control.entity';
import { LeadsService } from '../leads/leads.service';
import { CreateLeadDto } from '../leads/dto/create-lead.dto';
import { UpdateLeadDto } from '../leads/dto/update-lead.dto';
import { CreateLeadNoteDto } from '../leads/dto/create-lead-note.dto';
import { CompaniesService } from '../companies/companies.service';
import { CreateCompanyDto } from '../companies/dto/create-company.dto';
import { UpdateCompanyDto } from '../companies/dto/update-company.dto';
import { ContactsService } from '../contacts/contacts.service';
import { CreateContactDto } from '../contacts/dto/create-contact.dto';
import { UpdateContactDto } from '../contacts/dto/update-contact.dto';
import { TasksService } from '../tasks/tasks.service';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
import { UpdateTaskDto } from '../tasks/dto/update-task.dto';
import { PipelinesService } from '../pipelines/pipelines.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { UsersService } from '../users/users.service';
import { users } from '../users/user.entity';
import { CreateRecordNoteDto } from '../record-notes/dto/create-record-note.dto';
import { copilotActions, copilotRuns } from './copilot.entity';
import {
  copilotProposalToolDefinitions,
  CopilotProposalToolName,
  isCopilotProposalToolName,
  parseCopilotProposalArgs,
} from './copilot-proposals';

const ACTION_TTL_MS = 15 * 60 * 1000;
const INVALID = { output: { error: 'invalid_proposal' }, requiredPermissions: [] as string[] };

type ProposalPlan = {
  payload: Record<string, unknown>;
  beforeSnapshot: Record<string, unknown> | null;
  preview: Record<string, unknown>;
  requiredPermissions: string[];
};

export type CopilotActionResponse = {
  id: string;
  runId: string;
  toolName: string;
  status: 'proposed' | 'rejected' | 'expired' | 'conflict' | 'executed';
  expiresAt: Date;
  preview: Record<string, unknown>;
  result?: Record<string, unknown>;
};

@Injectable()
export class CopilotActionsService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly permissions: PermissionsService,
    private readonly leads: LeadsService,
    private readonly companies: CompaniesService,
    private readonly contacts: ContactsService,
    private readonly tasks: TasksService,
    private readonly pipelines: PipelinesService,
    private readonly customFields: CustomFieldsService,
    private readonly users: UsersService,
  ) {}

  async definitions(actorId: number) {
    return copilotProposalToolDefinitions(
      await this.permissions.getEffectivePermissions(actorId),
    );
  }

  async execute(actorId: number, runId: string, callId: string, name: string, raw: string) {
    if (!isCopilotProposalToolName(name) || !callId || callId.length > 200) return INVALID;
    const args = parseCopilotProposalArgs(name, raw);
    if (!args) return { output: { error: 'invalid_arguments' }, requiredPermissions: [] as string[] };
    try {
      const requiredPermissions = requiredFor(name, args);
      const granted = new Set(await this.permissions.getEffectivePermissions(actorId));
      if (!requiredPermissions.every((key) => granted.has(key))) {
        return { output: { error: 'permission_revoked' }, requiredPermissions: [] as string[] };
      }
      const plan = await this.prepare(name, args, requiredPermissions);
      if (!plan.requiredPermissions.every((key) => granted.has(key))) {
        return { output: { error: 'permission_revoked' }, requiredPermissions: [] as string[] };
      }
      const action = await this.persistProposal(actorId, runId, callId, name, plan);
      return {
        output: {
          proposal: {
            id: action.id,
            status: action.status,
            toolName: action.toolName,
            expiresAt: action.expiresAt,
            preview: plan.preview,
          },
        },
        requiredPermissions: plan.requiredPermissions,
      };
    } catch (error) {
      const code = error instanceof ProposalError ? error.code : 'invalid_proposal';
      return { output: { error: code }, requiredPermissions: [] as string[] };
    }
  }

  async listPublishedForRun(userId: number, runId: string) {
    const [run] = await this.db
      .select({ id: copilotRuns.id, status: copilotRuns.status, userId: copilotRuns.userId })
      .from(copilotRuns)
      .where(and(eq(copilotRuns.id, runId), eq(copilotRuns.userId, userId)))
      .limit(1);
    if (!run || run.status !== 'completed') return [];

    const current = new Set(await this.permissions.getEffectivePermissions(userId));
    const rows = await this.db
      .select()
      .from(copilotActions)
      .where(and(eq(copilotActions.runId, runId), eq(copilotActions.userId, userId)));
    const now = new Date();
    const result: CopilotActionResponse[] = [];
    for (const action of rows) {
      if (!action.requiredPermissions.every((key) => current.has(key))) continue;
      let status = action.status;
      if (status === 'proposed' && action.expiresAt <= now) {
        const [expired] = await this.db
          .update(copilotActions)
          .set({ status: 'expired' })
          .where(and(eq(copilotActions.id, action.id), eq(copilotActions.status, 'proposed'), lt(copilotActions.expiresAt, now)))
          .returning({ status: copilotActions.status });
        status = expired?.status ?? 'expired';
      }
      result.push({
        id: action.id,
        runId: action.runId,
        toolName: action.toolName,
        status,
        expiresAt: action.expiresAt,
        preview: asRecord(action.result?.preview) ?? {},
        ...(status === 'executed' && asRecord(action.result?.result)
          ? { result: asRecord(action.result?.result)! }
          : {}),
      });
    }
    return result;
  }

  async reject(userId: number, actionId: string) {
    return this.db.transaction(async (tx) => {
      const action = await this.lockOwnedAction(tx, userId, actionId);
      await this.assertActiveActor(tx, userId);
      await this.assertCompletedRun(tx, userId, action.runId);
      await this.assertPermissions(tx, userId, action.requiredPermissions);
      if (action.status !== 'proposed') return { id: action.id, status: action.status };
      const status = action.expiresAt <= new Date() ? 'expired' : 'rejected';
      const [updated] = await tx.update(copilotActions)
        .set({ status })
        .where(and(eq(copilotActions.id, action.id), eq(copilotActions.status, 'proposed')))
        .returning({ status: copilotActions.status });
      return { id: action.id, status: updated?.status ?? status };
    });
  }

  async confirm(userId: number, actionId: string) {
    const outcome = await this.db.transaction(async (tx) => {
      const action = await this.lockOwnedAction(tx, userId, actionId);
      await this.assertActiveActor(tx, userId);
      await this.assertCompletedRun(tx, userId, action.runId);
      await this.assertPermissions(tx, userId, action.requiredPermissions);
      if (action.status === 'executed') {
        return { id: action.id, status: 'executed' as const, result: action.result?.result ?? null };
      }
      if (action.status !== 'proposed') return { id: action.id, status: action.status };
      if (action.expiresAt <= new Date()) {
        await tx.update(copilotActions).set({ status: 'expired' })
          .where(and(eq(copilotActions.id, action.id), eq(copilotActions.status, 'proposed')));
        return { id: action.id, status: 'expired' as const };
      }

      const current = await this.lockMutationTarget(action, tx);
      if (action.beforeSnapshot && (!current || !matchesSnapshot(current, action.beforeSnapshot))) {
        const result = { code: current ? 'record_changed' : 'record_missing' };
        await tx.update(copilotActions)
          .set({ status: 'conflict', result: { ...(action.result ?? {}), result } })
          .where(and(eq(copilotActions.id, action.id), eq(copilotActions.status, 'proposed')));
        return { id: action.id, status: 'conflict' as const, result };
      }

      if (!(await this.referencesStillValid(action, current, tx))) {
        const result = { code: 'reference_changed' };
        await tx.update(copilotActions)
          .set({ status: 'conflict', result: { ...(action.result ?? {}), result } })
          .where(and(eq(copilotActions.id, action.id), eq(copilotActions.status, 'proposed')));
        return { id: action.id, status: 'conflict' as const, result };
      }

      const result = await this.applyAction(action, userId, tx);
      const [updated] = await tx.update(copilotActions)
        .set({ status: 'executed', executedAt: new Date(), result: { ...(action.result ?? {}), result } })
        .where(and(eq(copilotActions.id, action.id), eq(copilotActions.status, 'proposed')))
        .returning({ id: copilotActions.id });
      if (!updated) throw new ConflictException('Action is no longer proposed');
      return { id: action.id, status: 'executed' as const, result };
    });
    return outcome;
  }

  private async lockOwnedAction(tx: DatabaseTransaction, userId: number, actionId: string) {
    const [action] = await tx.select().from(copilotActions)
      .where(eq(copilotActions.id, actionId)).for('update').limit(1);
    if (!action || action.userId !== userId) throw new NotFoundException();
    return action;
  }

  private async assertActiveActor(tx: DatabaseTransaction, userId: number) {
    const [actor] = await tx.select({ isActive: users.isActive }).from(users)
      .where(eq(users.id, userId)).limit(1);
    if (!actor?.isActive) throw new ForbiddenException();
  }

  private async assertCompletedRun(tx: DatabaseTransaction, userId: number, runId: string) {
    const [run] = await tx.select({ status: copilotRuns.status }).from(copilotRuns)
      .where(and(eq(copilotRuns.id, runId), eq(copilotRuns.userId, userId))).limit(1);
    if (!run || run.status !== 'completed') throw new NotFoundException();
  }

  private async assertPermissions(tx: DatabaseTransaction, userId: number, required: string[]) {
    const rows = await tx.select({ key: permissions.key })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(userRoles.userId, userId));
    const granted = new Set(rows.map(({ key }) => key));
    if (required.some((key) => !granted.has(key))) throw new ForbiddenException('Permissions changed');
  }

  private async lockMutationTarget(action: typeof copilotActions.$inferSelect, tx: DatabaseTransaction): Promise<Record<string, unknown> | null> {
    const payload = action.validatedPayload;
    if (action.toolName === 'propose_update_task') {
      const [record] = await this.tasks.findCopilotRecord(Number(payload.id), tx, true);
      return record ? record as unknown as Record<string, unknown> : null;
    }
    if (!['propose_update_record', 'propose_add_note'].includes(action.toolName)) return null;
    const kind = payload.kind as 'lead' | 'company' | 'contact';
    const id = Number(payload.id);
    if (kind === 'lead') {
      const row = await this.leads.findCopilotMutationRecord(id, tx, true);
      return row as unknown as Record<string, unknown> | null;
    }
    const rows = kind === 'company'
      ? await this.companies.findCopilotMutationRecord(id, tx, true)
      : await this.contacts.findCopilotMutationRecord(id, tx, true);
    return (rows[0] as unknown as Record<string, unknown> | undefined) ?? null;
  }

  private async referencesStillValid(action: typeof copilotActions.$inferSelect, current: Record<string, unknown> | null, tx: DatabaseTransaction) {
    const payload = action.validatedPayload;
    const toolName = action.toolName;
    if (toolName === 'propose_create_record' || toolName === 'propose_update_record') {
      const kind = payload.kind as 'lead' | 'company' | 'contact';
      const changed = toolName === 'propose_create_record'
        ? new Set(Object.keys(asRecord(payload.data) ?? {}))
        : new Set(Object.keys(asRecord(payload.patch) ?? {}));
      const data = toolName === 'propose_create_record'
        ? asRecord(payload.data) ?? {}
        : { ...(current ?? {}), ...(asRecord(payload.patch) ?? {}) };
      if (kind === 'lead') {
        if ((toolName === 'propose_create_record' || changed.has('pipelineId') || changed.has('statusId')) && !(await this.pipelines.findCopilotStatus(Number(data.pipelineId), Number(data.statusId), tx)).length) return false;
        if ((toolName === 'propose_create_record' || changed.has('companyId')) && data.companyId != null && !(await this.companies.findCopilotLink(Number(data.companyId), tx)).length) return false;
        if ((toolName === 'propose_create_record' || changed.has('ownerId')) && data.ownerId != null && !(await this.users.findCopilotLink(Number(data.ownerId), tx))[0]?.isActive) return false;
        if ((toolName === 'propose_create_record' || changed.has('contactIds')) && Array.isArray(data.contactIds)) {
          for (const id of data.contactIds) if (!(await this.contacts.findCopilotLink(Number(id), tx)).length) return false;
        }
      } else if (kind === 'company') {
        if ((toolName === 'propose_create_record' || changed.has('ownerId')) && data.ownerId != null && !(await this.users.findCopilotLink(Number(data.ownerId), tx))[0]?.isActive) return false;
      } else {
        if ((toolName === 'propose_create_record' || changed.has('companyId')) && data.companyId != null && !(await this.companies.findCopilotLink(Number(data.companyId), tx)).length) return false;
        if ((toolName === 'propose_create_record' || changed.has('ownerId')) && data.ownerId != null && !(await this.users.findCopilotLink(Number(data.ownerId), tx))[0]?.isActive) return false;
      }
      return true;
    }
    if (toolName === 'propose_create_task') {
      if (!(await this.leads.findCopilotLinkedRecord(Number(payload.leadId), tx)).length) return false;
      return payload.assigneeId == null || !!(await this.users.findCopilotLink(Number(payload.assigneeId), tx))[0]?.isActive;
    }
    if (toolName === 'propose_update_task') {
      const patch = asRecord(payload.patch) ?? {};
      if (patch.leadId != null && !(await this.leads.findCopilotLinkedRecord(Number(patch.leadId), tx)).length) return false;
      return patch.assigneeId == null || !!(await this.users.findCopilotLink(Number(patch.assigneeId), tx))[0]?.isActive;
    }
    return !!current;
  }

  private async applyAction(action: typeof copilotActions.$inferSelect, actorId: number, tx: DatabaseTransaction) {
    const payload = action.validatedPayload;
    const preview = asRecord(action.result?.preview) ?? {};
    if (action.toolName === 'propose_create_record') {
      const kind = payload.kind as 'lead' | 'company' | 'contact';
      const data = asRecord(payload.data) ?? {};
      const dto = await validateDto(createDtoFor(kind) as new () => object, data);
      const row = kind === 'lead' ? await this.leads.create(dto as CreateLeadDto, tx)
        : kind === 'company' ? await this.companies.create(dto as CreateCompanyDto, tx)
          : await this.contacts.create(dto as CreateContactDto, tx);
      return safeActionResult('created', kind, row.id, row.name);
    }
    if (action.toolName === 'propose_update_record') {
      const kind = payload.kind as 'lead' | 'company' | 'contact';
      const patch = asRecord(payload.patch) ?? {};
      const dto = await validateDto(updateDtoFor(kind) as new () => object, patch);
      const id = Number(payload.id);
      const row = kind === 'lead' ? await this.leads.update(String(id), dto as UpdateLeadDto, tx)
        : kind === 'company' ? await this.companies.update(String(id), dto as UpdateCompanyDto, tx)
          : await this.contacts.update(String(id), dto as UpdateContactDto, tx);
      return safeActionResult('updated', kind, id, row.name);
    }
    if (action.toolName === 'propose_create_task') {
      const dto = await validateDto(CreateTaskDto, payload);
      const row = await this.tasks.create(dto, tx);
      return safeActionResult('created', 'task', row.id, String(preview.recordLabel ?? `Task ${row.id}`));
    }
    if (action.toolName === 'propose_update_task') {
      const dto = await validateDto(UpdateTaskDto, asRecord(payload.patch) ?? {});
      const id = Number(payload.id);
      const row = await this.tasks.update(String(id), dto, tx);
      return safeActionResult('updated', 'task', id, String(preview.recordLabel ?? `Task ${id}`));
    }
    if (action.toolName === 'propose_add_note') {
      const kind = payload.kind as 'lead' | 'company' | 'contact';
      const id = Number(payload.id);
      const dto = await validateDto(kind === 'lead' ? CreateLeadNoteDto : CreateRecordNoteDto, { body: payload.body });
      const note = kind === 'lead' ? await this.leads.addNote(String(id), String(dto.body), actorId, tx)
        : kind === 'company' ? await this.companies.addNote(String(id), String(dto.body), actorId, tx)
          : await this.contacts.addNote(String(id), String(dto.body), actorId, tx);
      return { ...safeActionResult('note_added', kind, id, String(preview.recordLabel ?? `${kind} ${id}`)), noteId: note.id };
    }
    throw new ProposalError('invalid_proposal');
  }

  private async prepare(name: CopilotProposalToolName, args: Record<string, unknown>, requiredPermissions: string[]): Promise<ProposalPlan> {
    if (name === 'propose_create_record') return this.prepareCreateRecord(args, requiredPermissions);
    if (name === 'propose_update_record') return this.prepareUpdateRecord(args, requiredPermissions);
    if (name === 'propose_create_task') return this.prepareCreateTask(args, requiredPermissions);
    if (name === 'propose_update_task') return this.prepareUpdateTask(args, requiredPermissions);
    return this.prepareAddNote(args, requiredPermissions);
  }

  private async prepareCreateRecord(args: Record<string, unknown>, requiredPermissions: string[]): Promise<ProposalPlan> {
    const kind = args.kind as 'lead' | 'company' | 'contact';
    const allowed = fieldsForRecord(kind);
    if (Object.entries(args).some(([key, value]) => !['kind', 'name'].includes(key) && !allowed.has(key) && value !== null)) throw new ProposalError('invalid_arguments');
    const candidate = omitNulls(pick(args, allowed));
    if ('customFields' in candidate) candidate.customFields = customFieldsMap(candidate.customFields);
    const dtoClass = createDtoFor(kind) as new () => object;
    const dto = await validateDto(dtoClass, candidate) as CreateLeadDto | CreateCompanyDto | CreateContactDto;
    if (!dto.name?.trim()) throw new ProposalError('invalid_input');
    if (kind === 'lead') {
      await this.validateLeadLinks(dto as CreateLeadDto, null);
    } else if (kind === 'company') {
      await this.validateOwner(dto.ownerId);
      await this.validateCustomFields('company', dto.customFields);
    } else {
      await this.validateOwner(dto.ownerId);
      await this.validateCompany((dto as CreateContactDto).companyId);
      await this.validateCustomFields('contact', dto.customFields);
    }
    const canonical = canonicalize(dto) as unknown as Record<string, unknown>;
    const preview = await this.createPreview(kind, canonical);
    return { payload: { kind, data: canonical }, beforeSnapshot: null, preview, requiredPermissions };
  }

  private async prepareUpdateRecord(args: Record<string, unknown>, requiredPermissions: string[]): Promise<ProposalPlan> {
    const kind = args.kind as 'lead' | 'company' | 'contact';
    const id = args.id as number;
    const patch = patchDto(args.patch as Record<string, unknown>);
    const allowed = fieldsForRecord(kind);
    if (Object.keys(patch).some((key) => !allowed.has(key))) throw new ProposalError('invalid_arguments');
    const current = await this.readMutationRecord(kind, id);
    if (!current) throw new ProposalError('invalid_reference');
    const candidate = { ...patch };
    const dto = await validateDto(updateDtoFor(kind), candidate);
    if (!Object.keys(candidate).length) throw new ProposalError('invalid_input');
    if (kind === 'lead') {
      await this.validateLeadLinks(dto as UpdateLeadDto, current);
    } else if (kind === 'company') {
      await this.validateOwner(dto.ownerId);
      if (dto.customFields !== undefined) await this.validateCustomFields('company', dto.customFields);
    } else {
      await this.validateOwner(dto.ownerId);
      await this.validateCompany(dto.companyId);
      if (dto.customFields !== undefined) await this.validateCustomFields('contact', dto.customFields);
    }
    const canonical = canonicalize(dto) as unknown as Record<string, unknown>;
    const beforeSnapshot = snapshotFor(current, Object.keys(canonical));
    const preview = await this.updatePreview(kind, current, canonical);
    return {
      payload: { kind, id, patch: canonical },
      beforeSnapshot,
      preview,
      requiredPermissions,
    };
  }

  private async prepareCreateTask(args: Record<string, unknown>, requiredPermissions: string[]): Promise<ProposalPlan> {
    const candidate: Record<string, unknown> = {
      leadId: args.leadId,
      type: args.type,
      text: args.text,
      dueAt: args.dueAt,
      ...(args.assigneeId === null ? {} : { assigneeId: args.assigneeId }),
    };
    const dto = await validateDto(CreateTaskDto, candidate);
    await this.validateLead(dto.leadId);
    await this.validateOwner(dto.assigneeId);
    const canonical = canonicalize(dto) as unknown as Record<string, unknown>;
    const lead = await this.linkedLead(dto.leadId);
    const assignee = dto.assigneeId ? await this.linkedUser(dto.assigneeId) : null;
    return {
      payload: canonical,
      beforeSnapshot: null,
      preview: {
        operation: 'create',
        kind: 'task',
        recordLabel: lead.name,
        changes: [
          { field: 'lead', label: 'Lead', before: null, after: { id: lead.id, label: lead.name } },
          { field: 'type', label: 'Type', before: null, after: canonical.type },
          { field: 'text', label: 'Text', before: null, after: canonical.text },
          { field: 'dueAt', label: 'Due date', before: null, after: canonical.dueAt },
          ...(dto.assigneeId ? [{ field: 'assignee', label: 'Assignee', before: null, after: { id: assignee!.id, label: assignee!.name } }] : []),
        ],
      },
      requiredPermissions,
    };
  }

  private async prepareUpdateTask(args: Record<string, unknown>, requiredPermissions: string[]): Promise<ProposalPlan> {
    const id = args.id as number;
    const patch = patchDto(args.patch as Record<string, unknown>);
    const allowed = new Set(['leadId', 'type', 'text', 'dueAt', 'isCompleted', 'assigneeId']);
    if (Object.keys(patch).some((key) => !allowed.has(key))) throw new ProposalError('invalid_arguments');
    const [current] = await this.tasks.findCopilotRecord(id);
    if (!current) throw new ProposalError('invalid_reference');
    const dto = await validateDto(UpdateTaskDto, patch);
    if (!Object.keys(patch).length) throw new ProposalError('invalid_input');
    if (dto.leadId !== undefined && dto.leadId !== null) await this.validateLead(dto.leadId);
    await this.validateOwner(dto.assigneeId);
    const canonical = canonicalize(dto) as unknown as Record<string, unknown>;
    const beforeSnapshot = snapshotFor(current, Object.keys(canonical));
    const preview = await this.taskUpdatePreview(current, canonical);
    return { payload: { id, patch: canonical }, beforeSnapshot, preview, requiredPermissions };
  }

  private async prepareAddNote(args: Record<string, unknown>, requiredPermissions: string[]): Promise<ProposalPlan> {
    const kind = args.kind as 'lead' | 'company' | 'contact';
    const dtoClass = kind === 'lead' ? CreateLeadNoteDto : CreateRecordNoteDto;
    const dto = await validateDto(dtoClass, { body: args.body });
    const current = await this.readRecord(kind, args.id as number);
    if (!current) throw new ProposalError('invalid_reference');
    const label = String(current.name ?? `${kind} ${args.id}`);
    const canonical = canonicalize(dto);
    return {
      payload: { kind, id: args.id, ...canonical },
      beforeSnapshot: null,
      preview: { operation: 'add_note', kind, recordId: args.id, recordLabel: label, note: canonical.body },
      requiredPermissions,
    };
  }

  private async readRecord(kind: 'lead' | 'company' | 'contact', id: number): Promise<Record<string, unknown> | null> {
    const rows = kind === 'lead'
      ? await this.leads.findCopilotRecord(id)
      : kind === 'company'
        ? await this.companies.findCopilotRecord(id)
        : await this.contacts.findCopilotRecord(id);
    return (rows[0] as unknown as Record<string, unknown> | undefined) ?? null;
  }

  private async readMutationRecord(kind: 'lead' | 'company' | 'contact', id: number): Promise<Record<string, unknown> | null> {
    if (kind === 'lead') {
      return await this.leads.findCopilotMutationRecord(id) as unknown as Record<string, unknown> | null;
    }
    const rows = kind === 'company'
      ? await this.companies.findCopilotMutationRecord(id)
      : await this.contacts.findCopilotMutationRecord(id);
    return (rows[0] as unknown as Record<string, unknown> | undefined) ?? null;
  }

  private async validateLeadLinks(dto: CreateLeadDto | UpdateLeadDto, current: Record<string, unknown> | null) {
    const pipelineId = dto.pipelineId ?? current?.pipelineId;
    const statusId = dto.statusId ?? current?.statusId;
    if (pipelineId === undefined || statusId === undefined) throw new ProposalError('invalid_status');
    if (!(await this.pipelines.findCopilotStatus(Number(pipelineId), Number(statusId))).length) throw new ProposalError('invalid_status');
    if (dto.companyId !== undefined) await this.validateCompany(dto.companyId);
    await this.validateOwner(dto.ownerId);
    if (dto.contactIds !== undefined) await this.validateContacts(dto.contactIds);
    if (current === null || dto.customFields !== undefined) {
      await this.validateCustomFields('lead', dto.customFields);
    }
  }

  private async validateCompany(id: number | null | undefined) {
    if (id == null) return;
    if (!(await this.companies.findCopilotLink(id)).length) throw new ProposalError('invalid_reference');
  }

  private async validateOwner(id: number | null | undefined) {
    if (id == null) return;
    const [row] = await this.users.findCopilotLink(id);
    if (!row?.isActive) throw new ProposalError('invalid_reference');
  }

  private async validateLead(id: number) {
    if (!(await this.leads.findCopilotLinkedRecord(id)).length) throw new ProposalError('invalid_reference');
  }

  private async validateContacts(ids: number[]) {
    const rows = await Promise.all(ids.map(async (id) => (await this.contacts.findCopilotLink(id))[0]));
    if (rows.some((row) => !row)) throw new ProposalError('invalid_reference');
  }

  private async validateCustomFields(kind: 'lead' | 'company' | 'contact', value: unknown) {
    try {
      await this.customFields.validate(kind, value ?? {});
    } catch {
      throw new ProposalError('invalid_custom_fields');
    }
  }

  private async createPreview(kind: 'lead' | 'company' | 'contact', data: Record<string, unknown>) {
    const fields = Object.keys(data);
    const changes = await Promise.all(fields.map(async (field) => ({
      field,
      label: fieldLabel(field),
      before: null,
      after: await this.previewValue(kind, field, data[field], data, null),
    })));
    return { operation: 'create', kind, recordLabel: String(data.name), changes };
  }

  private async updatePreview(kind: 'lead' | 'company' | 'contact', current: Record<string, unknown>, patch: Record<string, unknown>) {
    const label = String(current.name ?? `${kind} ${current.id}`);
    const changes = await Promise.all(Object.keys(patch).map(async (field) => ({
      field,
      label: fieldLabel(field),
      before: await this.previewValue(kind, field, current[field], current, current),
      after: await this.previewValue(kind, field, patch[field], { ...current, ...patch }, current),
    })));
    return { operation: 'update', kind, recordId: current.id, recordLabel: label, changes };
  }

  private async taskUpdatePreview(current: Record<string, unknown>, patch: Record<string, unknown>) {
    const changes = await Promise.all(Object.keys(patch).map(async (field) => ({
      field,
      label: fieldLabel(field),
      before: await this.taskPreviewValue(field, current[field]),
      after: await this.taskPreviewValue(field, patch[field]),
    })));
    return { operation: 'update', kind: 'task', recordId: current.id, recordLabel: `Task ${current.id}`, changes };
  }

  private async previewValue(kind: 'lead' | 'company' | 'contact', field: string, value: unknown, data: Record<string, unknown>, current: Record<string, unknown> | null): Promise<unknown> {
    if (value == null) return null;
    if (field === 'companyId') {
      const [company] = await this.companies.findCopilotLink(Number(value));
      return company ? { id: company.id, label: company.name } : null;
    }
    if (field === 'ownerId') {
      const [user] = await this.users.findCopilotLink(Number(value));
      return user ? { id: user.id, label: user.name } : null;
    }
    if (field === 'contactIds') {
      const contacts = await Promise.all((value as number[]).map(async (id) => (await this.contacts.findCopilotLink(id))[0]));
      return contacts.map((contact) => ({ id: contact!.id, label: contact!.name }));
    }
    if (field === 'pipelineId' || field === 'statusId') {
      const pipelineId = Number(data.pipelineId ?? current?.pipelineId);
      const statusId = Number(data.statusId ?? current?.statusId);
      const [status] = await this.pipelines.findCopilotStatus(pipelineId, statusId);
      return status ? { pipelineId: status.pipelineId, pipeline: status.pipelineName, statusId: status.statusId, status: status.statusName } : null;
    }
    if (field === 'customFields') return value;
    return value;
  }

  private async taskPreviewValue(field: string, value: unknown): Promise<unknown> {
    if (value == null) return null;
    if (field === 'leadId') {
      const [lead] = await this.leads.findCopilotLinkedRecord(Number(value));
      return lead ? { id: lead.id, label: lead.name } : null;
    }
    if (field === 'assigneeId') {
      const [user] = await this.users.findCopilotLink(Number(value));
      return user ? { id: user.id, label: user.name } : null;
    }
    return value;
  }

  private async linkedLead(id: number) {
    const [lead] = await this.leads.findCopilotLinkedRecord(id);
    if (!lead) throw new ProposalError('invalid_reference');
    return lead;
  }

  private async linkedUser(id: number) {
    const [user] = await this.users.findCopilotLink(id);
    if (!user?.isActive) throw new ProposalError('invalid_reference');
    return user;
  }

  private async persistProposal(userId: number, runId: string, callId: string, toolName: CopilotProposalToolName, plan: ProposalPlan) {
    const canonicalPayload = stableStringify({ toolName, payload: plan.payload });
    try {
      return await this.db.transaction(async (tx) => {
        const [run] = await tx
          .select({ id: copilotRuns.id, status: copilotRuns.status, conversationId: copilotRuns.conversationId })
          .from(copilotRuns)
          .where(and(eq(copilotRuns.id, runId), eq(copilotRuns.userId, userId)))
          .for('update')
          .limit(1);
        if (!run || run.status !== 'running') throw new ProposalError('run_not_active');
        const [existing] = await tx
          .select()
          .from(copilotActions)
          .where(and(eq(copilotActions.runId, runId), eq(copilotActions.callId, callId)))
          .limit(1);
        if (existing) {
          if (stableStringify({ toolName: existing.toolName, payload: existing.validatedPayload }) !== canonicalPayload) {
            throw new ProposalError('idempotency_conflict');
          }
          return existing;
        }
        const now = new Date();
        const [created] = await tx
          .insert(copilotActions)
          .values({
            id: randomUUID(),
            conversationId: run.conversationId,
            runId,
            userId,
            callId,
            toolName,
            validatedPayload: plan.payload,
            beforeSnapshot: plan.beforeSnapshot,
            requiredPermissions: plan.requiredPermissions,
            expiresAt: new Date(now.getTime() + ACTION_TTL_MS),
            result: { preview: plan.preview },
          })
          .returning();
        return created;
      });
    } catch (error) {
      if (error instanceof ProposalError) throw error;
      if (isUniqueViolation(error)) {
        const [existing] = await this.db.select().from(copilotActions)
          .where(and(eq(copilotActions.runId, runId), eq(copilotActions.callId, callId))).limit(1);
        if (existing && stableStringify({ toolName: existing.toolName, payload: existing.validatedPayload }) === canonicalPayload) return existing;
        if (existing) throw new ProposalError('idempotency_conflict');
      }
      throw error;
    }
  }
}

class ProposalError extends Error {
  constructor(readonly code: string) { super(code); }
}

function requiredFor(name: CopilotProposalToolName, args: Record<string, unknown>) {
  const result = new Set<string>();
  const add = (resource: string, operation: 'read' | 'write') => result.add(`${resource}:${operation}`);
  if (name === 'propose_create_record' || name === 'propose_update_record') {
    const kind = String(args.kind);
    const resource = resourceForKind(kind);
    add(resource, 'read'); add(resource, 'write');
    if (kind === 'lead' && name === 'propose_create_record') add('pipelines', 'read');
    const fields = name === 'propose_create_record'
      ? Object.fromEntries(Object.entries(args).filter(([, value]) => value !== null))
      : patchDto(args.patch as Record<string, unknown>);
    if (fields.companyId != null || (name === 'propose_update_record' && 'companyId' in fields)) add('companies', 'read');
    if (fields.ownerId != null || (name === 'propose_update_record' && 'ownerId' in fields)) add('users', 'read');
    if (fields.contactIds != null || (name === 'propose_update_record' && 'contactIds' in fields)) add('contacts', 'read');
    if (fields.customFields != null || (name === 'propose_update_record' && 'customFields' in fields)) add('custom-fields', 'read');
    if (kind === 'lead' && (name === 'propose_create_record' || 'pipelineId' in fields || 'statusId' in fields)) add('pipelines', 'read');
  } else if (name === 'propose_create_task') {
    add('tasks', 'read'); add('tasks', 'write'); add('leads', 'read');
    if (args.assigneeId != null) add('users', 'read');
  } else if (name === 'propose_update_task') {
    add('tasks', 'read'); add('tasks', 'write');
    const patch = patchDto(args.patch as Record<string, unknown>);
    if ('leadId' in patch) add('leads', 'read');
    if ('assigneeId' in patch) add('users', 'read');
  } else {
    const resource = resourceForKind(String(args.kind));
    add(resource, 'read'); add(resource, 'write');
  }
  return [...result];
}

function fieldsForRecord(kind: 'lead' | 'company' | 'contact') {
  const common = new Set(['name', 'ownerId', 'customFields']);
  if (kind === 'lead') return new Set([...common, 'price', 'source', 'pipelineId', 'statusId', 'companyId', 'contactIds']);
  if (kind === 'company') return new Set([...common, 'industry', 'address', 'email', 'phone']);
  return new Set([...common, 'position', 'companyId', 'email', 'phone']);
}

function resourceForKind(kind: string) {
  return kind === 'lead' ? 'leads' : kind === 'company' ? 'companies' : kind === 'contact' ? 'contacts' : 'tasks';
}

function createDtoFor(kind: 'lead' | 'company' | 'contact') {
  return kind === 'lead' ? CreateLeadDto : kind === 'company' ? CreateCompanyDto : CreateContactDto;
}
function updateDtoFor(kind: 'lead' | 'company' | 'contact') {
  return kind === 'lead' ? UpdateLeadDto : kind === 'company' ? UpdateCompanyDto : UpdateContactDto;
}
function pick(source: Record<string, unknown>, keys: Set<string>) {
  return Object.fromEntries(Object.entries(source).filter(([key]) => keys.has(key)));
}
function omitNulls(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null));
}
function customFieldsMap(value: unknown) {
  if (value === null || value === undefined) return value;
  if (!Array.isArray(value)) throw new ProposalError('invalid_custom_fields');
  return Object.fromEntries(value.map((entry: { key: string; value: unknown }) => [entry.key, entry.value]));
}
function patchDto(patch: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(patch)) {
    const field = raw as { set: boolean; value: unknown };
    if (!field.set) continue;
    result[key] = key === 'customFields' ? customFieldsMap(field.value) : field.value;
  }
  return result;
}
async function validateDto<T extends object>(dtoClass: new () => T, value: Record<string, unknown>): Promise<T> {
  const instance = plainToInstance(dtoClass, value);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  });
  if (errors.length) throw new ProposalError('invalid_input');
  return instance;
}
function canonicalize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function stableStringify(value: unknown): string {
  return JSON.stringify(sortObject(value));
}
function sortObject(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, sortObject(child)]));
}
function snapshotFor(current: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, canonicalize(current[key] ?? null)]));
}
function matchesSnapshot(current: Record<string, unknown>, snapshot: Record<string, unknown>) {
  return Object.entries(snapshot).every(([key, value]) => stableStringify(current[key] ?? null) === stableStringify(value));
}
function safeActionResult(operation: string, kind: string, id: number | string, label: unknown) {
  return { operation, kind, recordId: id, recordLabel: String(label ?? `${kind} ${id}`) };
}
function fieldLabel(field: string) {
  const labels: Record<string, string> = {
    name: 'Name', price: 'Price', source: 'Source', pipelineId: 'Pipeline and status', statusId: 'Pipeline and status',
    companyId: 'Company', ownerId: 'Responsible', contactIds: 'Contacts', industry: 'Industry', address: 'Address',
    email: 'Email', phone: 'Phone', position: 'Position', customFields: 'Custom fields', leadId: 'Lead', type: 'Type',
    text: 'Text', dueAt: 'Due date', isCompleted: 'Completed', assigneeId: 'Assignee',
  };
  return labels[field] ?? field;
}
function isUniqueViolation(error: unknown) {
  return !!error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505';
}
