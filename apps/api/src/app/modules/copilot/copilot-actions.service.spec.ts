import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { copilotActions, copilotRuns } from './copilot.entity';
import { users } from '../users/user.entity';
import { permissions } from '../access-control/access-control.entity';
import { statuses } from '../pipelines/pipeline.entity';
import { CopilotActionsService } from './copilot-actions.service';
import { copilotProposalToolDefinitions, parseCopilotProposalArgs } from './copilot-proposals';

const allPermissions = [
  'leads:read', 'leads:write', 'companies:read', 'companies:write',
  'contacts:read', 'contacts:write', 'tasks:read', 'tasks:write',
  'pipelines:read', 'users:read', 'custom-fields:read',
];

function createDb(options: { runStatus?: string; existingActions?: Array<Record<string, unknown>>; returnExistingOnActionLookup?: boolean; permissions?: string[] } = {}) {
  const actions = new Map<string, Record<string, unknown>>();
  for (const action of options.existingActions ?? []) actions.set(String(action.callId), action);
  const run = { id: 'run-1', status: options.runStatus ?? 'running', userId: 7, conversationId: 3 };
  let transactionQueue = Promise.resolve();
  const tx = {
    select: vi.fn(() => makeQuery(undefined, true)),
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => ({
        returning: vi.fn(async () => {
          const created = { status: 'proposed', ...values };
          actions.set(String(created.callId), created);
          return [created];
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(() => {
            const action = [...actions.values()][0];
            if (action) Object.assign(action, values);
            const result = action ? [{ id: action.id, status: action.status }] : [];
            return {
              returning: vi.fn(async () => result),
              then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(result).then(resolve),
            };
        }),
      })),
    })),
  };

  const makeQuery = (table?: unknown, tx = false) => {
    const query: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};
    query.from = vi.fn((source: unknown) => { table = source; return query; });
    query.where = vi.fn(() => query);
    query.for = vi.fn(() => query);
    query.orderBy = vi.fn(() => query);
    query.innerJoin = vi.fn((source: unknown) => { table = source; return query; });
    query.limit = vi.fn(async () => {
      if (table === copilotRuns) return [run];
      if (table === users) return [{ isActive: true }];
      if (table === statuses) return [{ pipelineId: 2, pipelineName: 'Sales', statusId: 4, statusName: 'New' }];
      if (table === copilotActions) return tx && run.status === 'running' && !options.returnExistingOnActionLookup ? [] : [...actions.values()];
      return [];
    });
    query.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve(
      table === permissions ? (options.permissions ?? allPermissions).map((key) => ({ key })) : table === copilotActions ? [...actions.values()] : [],
    ).then(resolve);
    if (tx) {
      query.insert = vi.fn(() => ({
        values: vi.fn((values: Record<string, unknown>) => ({
          returning: vi.fn(async () => {
            const created = { status: 'proposed', ...values };
            actions.set(String(created.callId), created);
            return [created];
          }),
        })),
      }));
    }
    return query;
  };
  const db = {
    transaction: vi.fn(async (callback: (executor: typeof tx) => unknown) => {
      const prior = transactionQueue;
      let release!: () => void;
      transactionQueue = new Promise<void>((resolve) => { release = resolve; });
      await prior;
      const snapshot = new Map([...actions].map(([key, action]) => [key, structuredClone(action)]));
      try {
        return await callback(tx);
      } catch (error) {
        actions.clear();
        for (const [key, action] of snapshot) actions.set(key, action);
        throw error;
      } finally {
        release();
      }
    }),
    select: vi.fn(() => makeQuery()),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            const action = [...actions.values()][0];
            if (!action) return [];
            Object.assign(action, values);
            return [{ status: action.status }];
          }),
        })),
      })),
    })),
  };
  return { db, tx, actions, run };
}

function createService(options: { permissions?: string[]; runStatus?: string; existingActions?: Array<Record<string, unknown>>; returnExistingOnActionLookup?: boolean } = {}) {
  const state = createDb(options);
  const permissions = { getEffectivePermissions: vi.fn().mockResolvedValue(options.permissions ?? allPermissions) };
  const leads = {
    findCopilotRecord: vi.fn().mockResolvedValue([{ id: 9, name: 'Lead', pipelineId: 2, statusId: 4, companyId: null, ownerId: null, customFields: {} }]),
    findCopilotMutationRecord: vi.fn().mockResolvedValue({ id: 9, name: 'Lead', pipelineId: 2, statusId: 4, companyId: null, ownerId: null, customFields: {}, contactIds: [] }),
    findCopilotLinkedRecord: vi.fn().mockResolvedValue([{ id: 9, name: 'Lead', pipelineId: 2, statusId: 4 }]),
    create: vi.fn(), update: vi.fn(), remove: vi.fn(), addNote: vi.fn(),
  };
  const companies = {
    findCopilotRecord: vi.fn().mockResolvedValue([{ id: 10, name: 'Company', industry: null, address: null, email: null, phone: null, ownerId: null, customFields: {} }]),
    findCopilotMutationRecord: vi.fn().mockResolvedValue([{ id: 10, name: 'Company', industry: null, address: null, email: null, phone: null, ownerId: null, customFields: {} }]),
    findCopilotLink: vi.fn().mockResolvedValue([{ id: 10, name: 'Company' }]),
    create: vi.fn(), update: vi.fn(), remove: vi.fn(), addNote: vi.fn(),
  };
  const contacts = {
    findCopilotRecord: vi.fn().mockResolvedValue([{ id: 11, name: 'Contact', position: null, companyId: null, email: null, phone: null, ownerId: null, customFields: {} }]),
    findCopilotMutationRecord: vi.fn().mockResolvedValue([{ id: 11, name: 'Contact', position: null, companyId: null, email: null, phone: null, ownerId: null, customFields: {} }]),
    findCopilotLink: vi.fn().mockResolvedValue([{ id: 11, name: 'Contact' }]),
    create: vi.fn(), update: vi.fn(), remove: vi.fn(), addNote: vi.fn(),
  };
  const tasks = {
    findCopilotRecord: vi.fn().mockResolvedValue([{ id: 12, leadId: 9, type: 'call', text: 'Call', dueAt: new Date('2026-10-30T12:00:00.000Z'), isCompleted: false, assigneeId: null }]),
    create: vi.fn(), update: vi.fn(), remove: vi.fn(),
  };
  const pipelines = { findCopilotStatus: vi.fn().mockResolvedValue([{ pipelineId: 2, pipelineName: 'Sales', statusId: 4, statusName: 'New' }]) };
  const customFields = { validate: vi.fn().mockResolvedValue(undefined) };
  const users = { findCopilotLink: vi.fn().mockResolvedValue([{ id: 14, name: 'Alex', isActive: true }]) };
  const service = new CopilotActionsService(
    state.db as never,
    permissions as never,
    leads as never,
    companies as never,
    contacts as never,
    tasks as never,
    pipelines as never,
    customFields as never,
    users as never,
  );
  return { service, state, permissions, leads, companies, contacts, tasks, pipelines, customFields, users };
}

function createRecordArgs(kind: 'lead' | 'company' | 'contact') {
  return JSON.stringify({
    kind, name: `${kind} proposal`, price: null, source: null, pipelineId: kind === 'lead' ? 2 : null,
    statusId: kind === 'lead' ? 4 : null, companyId: null, ownerId: null, contactIds: null,
    industry: null, address: null, email: null, phone: null, position: null, customFields: null,
  });
}

function emptyRecordPatch(overrides: Record<string, unknown> = {}) {
  const patch = Object.fromEntries([
    'name', 'price', 'source', 'pipelineId', 'statusId', 'companyId', 'ownerId', 'contactIds',
    'industry', 'address', 'email', 'phone', 'position', 'customFields',
  ].map((key) => [key, { set: false, value: null }]));
  return JSON.stringify({ kind: 'lead', id: 9, patch: { ...patch, name: { set: true, value: 'Renamed' }, ...overrides } });
}

function actionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'action-1', runId: 'run-1', userId: 7, toolName: 'propose_create_record', callId: 'call-1',
    status: 'proposed', expiresAt: new Date(Date.now() + 60_000), requiredPermissions: ['companies:read', 'companies:write'],
    result: { preview: { operation: 'create', kind: 'company', recordLabel: 'Draft Co' } },
    validatedPayload: { kind: 'company', data: { name: 'Draft Co' } }, beforeSnapshot: null,
    ...overrides,
  };
}

describe('Copilot proposal tools', () => {
  it.each(['lead', 'company', 'contact'] as const)('accepts a custom-field update for a %s without converting it twice', async (kind) => {
    const { service, customFields } = createService();
    const args = JSON.parse(emptyRecordPatch({
      name: { set: false, value: null },
      customFields: { set: true, value: [{ key: 'region', value: 'West' }] },
    }));
    args.kind = kind;
    const result = await service.execute(7, 'run-1', 'custom-update', 'propose_update_record', JSON.stringify(args));
    expect(result.output).toMatchObject({ proposal: { status: 'proposed' } });
    expect(customFields.validate).toHaveBeenCalledWith(kind, { region: 'West' });
  });

  it('strictly parses proposals and normalizes all five tool families into action rows without CRM writes', async () => {
    const { service, state, leads, companies, contacts, tasks } = createService();
    const calls: Array<[string, string]> = [
      ['propose_create_record', createRecordArgs('lead')],
      ['propose_create_record', createRecordArgs('company')],
      ['propose_create_record', createRecordArgs('contact')],
      ['propose_update_record', emptyRecordPatch()],
      ['propose_create_task', JSON.stringify({ leadId: 9, type: 'call', text: 'Call tomorrow', dueAt: '2026-10-30T12:00:00.000Z', assigneeId: null })],
      ['propose_update_task', JSON.stringify({ id: 12, patch: {
        leadId: { set: false, value: null }, type: { set: false, value: null }, text: { set: true, value: 'Call later' },
        dueAt: { set: false, value: null }, isCompleted: { set: false, value: null }, assigneeId: { set: false, value: null },
      } })],
      ['propose_add_note', JSON.stringify({ kind: 'lead', id: 9, body: 'Call after lunch' })],
      ['propose_add_note', JSON.stringify({ kind: 'company', id: 10, body: 'Renewal discussion' })],
      ['propose_add_note', JSON.stringify({ kind: 'contact', id: 11, body: 'Prefers email' })],
    ];
    for (const [index, [name, raw]] of calls.entries()) {
      const result = await service.execute(7, 'run-1', `call-${index}`, name, raw);
      expect(result).toMatchObject({ output: { proposal: { status: 'proposed' } } });
      expect(result.requiredPermissions.length).toBeGreaterThan(0);
    }
    expect(state.actions.size).toBe(calls.length);
    expect(leads.create).not.toHaveBeenCalled();
    expect(leads.update).not.toHaveBeenCalled();
    expect(leads.addNote).not.toHaveBeenCalled();
    expect(companies.create).not.toHaveBeenCalled();
    expect(companies.update).not.toHaveBeenCalled();
    expect(companies.addNote).not.toHaveBeenCalled();
    expect(contacts.create).not.toHaveBeenCalled();
    expect(contacts.update).not.toHaveBeenCalled();
    expect(contacts.addNote).not.toHaveBeenCalled();
    expect(tasks.create).not.toHaveBeenCalled();
    expect(tasks.update).not.toHaveBeenCalled();
  });

  it('validates DTO fields, custom fields, FKs, and status belongs to the selected pipeline', async () => {
    expect(parseCopilotProposalArgs('propose_create_record', createRecordArgs('lead').replace('"pipelineId":2', '"pipelineId":null'))).toBeNull();
    expect(parseCopilotProposalArgs('propose_update_record', emptyRecordPatch({ name: { set: true, value: 'x'.repeat(161) } }))).toBeNull();
    const overlongCustomFieldKey = JSON.parse(createRecordArgs('company')) as Record<string, unknown>;
    overlongCustomFieldKey.customFields = [{ key: 'k'.repeat(101), value: 'x' }];
    expect(parseCopilotProposalArgs('propose_create_record', JSON.stringify(overlongCustomFieldKey))).toBeNull();
    const overlongCustomFieldValue = JSON.parse(createRecordArgs('company')) as Record<string, unknown>;
    overlongCustomFieldValue.customFields = [{ key: 'valid', value: 'x'.repeat(1001) }];
    expect(parseCopilotProposalArgs('propose_create_record', JSON.stringify(overlongCustomFieldValue))).toBeNull();
    const invalidStatus = createService();
    invalidStatus.pipelines.findCopilotStatus.mockResolvedValue([]);
    await expect(invalidStatus.service.execute(7, 'run-1', 'status', 'propose_create_record', createRecordArgs('lead'))).resolves.toMatchObject({ output: { error: 'invalid_status' } });
    const invalidLead = createService();
    invalidLead.leads.findCopilotLinkedRecord.mockResolvedValue([]);
    await expect(invalidLead.service.execute(7, 'run-1', 'fk', 'propose_create_task', JSON.stringify({ leadId: 9, type: 'call', text: 'Call', dueAt: '2026-10-30T12:00:00.000Z', assigneeId: null }))).resolves.toMatchObject({ output: { error: 'invalid_reference' } });
    const invalidCompany = createService();
    invalidCompany.companies.findCopilotLink.mockResolvedValue([]);
    const contactArgs = JSON.parse(createRecordArgs('contact')) as Record<string, unknown>;
    contactArgs.companyId = 10;
    await expect(invalidCompany.service.execute(7, 'run-1', 'fk-company', 'propose_create_record', JSON.stringify(contactArgs))).resolves.toMatchObject({ output: { error: 'invalid_reference' } });
    const invalidCustomFields = createService();
    invalidCustomFields.customFields.validate.mockRejectedValue(new Error('hidden custom field details'));
    const companyArgs = JSON.parse(createRecordArgs('company')) as Record<string, unknown>;
    companyArgs.customFields = [{ key: 'bad', value: 'x' }];
    await expect(invalidCustomFields.service.execute(7, 'run-1', 'custom', 'propose_create_record', JSON.stringify(companyArgs))).resolves.toMatchObject({ output: { error: 'invalid_custom_fields' } });
  });

  it('uses strict, permission-filtered schemas and does not create a proposal when write access is absent', async () => {
    const { service, state } = createService({ permissions: ['leads:read'] });
    expect(await service.definitions(7)).toEqual([]);
    const result = await service.execute(7, 'run-1', 'denied', 'propose_add_note', JSON.stringify({ kind: 'lead', id: 9, body: 'Note' }));
    expect(result.output).toEqual({ error: 'permission_revoked' });
    expect(state.actions.size).toBe(0);
    const definitions = copilotProposalToolDefinitions(allPermissions);
    expect(definitions.every((tool) => tool.strict === true)).toBe(true);
    for (const tool of definitions) {
      const params = tool.parameters as { additionalProperties: boolean; properties: Record<string, unknown>; required: string[] };
      expect(params.additionalProperties).toBe(false);
      expect(params.required).toEqual(Object.keys(params.properties));
    }
  });

  it('makes proposal creation idempotent by run and call id, and rejects payload changes', async () => {
    const { service, state } = createService({ returnExistingOnActionLookup: true });
    const args = createRecordArgs('company');
    const first = await service.execute(7, 'run-1', 'same-call', 'propose_create_record', args);
    const duplicate = await service.execute(7, 'run-1', 'same-call', 'propose_create_record', args);
    expect(duplicate.output).toEqual(first.output);
    expect(state.actions.size).toBe(1);
    const changed = JSON.parse(args) as Record<string, unknown>;
    changed.name = 'Different payload';
    await expect(service.execute(7, 'run-1', 'same-call', 'propose_create_record', JSON.stringify(changed))).resolves.toMatchObject({ output: { error: 'idempotency_conflict' } });
    expect(state.actions.size).toBe(1);
  });

  it('only publishes completed-run proposals and enforces reject, expiry, ownership, and terminal run status', async () => {
    const row = {
      id: 'action-1', runId: 'run-1', userId: 7, toolName: 'propose_add_note', callId: 'call-1',
      status: 'proposed', expiresAt: new Date(Date.now() + 60_000), requiredPermissions: ['leads:read', 'leads:write'],
      result: { preview: { operation: 'add_note' } }, validatedPayload: { kind: 'lead', id: 9, body: 'x' },
    };
    const completed = createService({ runStatus: 'completed', existingActions: [row] });
    await expect(completed.service.listPublishedForRun(7, 'run-1')).resolves.toMatchObject([{ id: 'action-1', status: 'proposed', preview: { operation: 'add_note' } }]);
    await expect(completed.service.reject(7, 'action-1')).resolves.toEqual({ id: 'action-1', status: 'rejected' });

    const expiredRow = { ...row, id: 'action-2', callId: 'call-2', status: 'proposed', expiresAt: new Date(Date.now() - 1) };
    const expired = createService({ runStatus: 'completed', existingActions: [expiredRow] });
    await expect(expired.service.reject(7, 'action-2')).resolves.toEqual({ id: 'action-2', status: 'expired' });

    for (const runStatus of ['running', 'failed', 'cancelled']) {
      const notPublished = createService({ runStatus, existingActions: [row] });
      await expect(notPublished.service.listPublishedForRun(7, 'run-1')).resolves.toEqual([]);
      await expect(notPublished.service.reject(7, 'action-1')).rejects.toBeInstanceOf(NotFoundException);
    }
    const foreign = createService({ runStatus: 'completed', existingActions: [] });
    await expect(foreign.service.reject(999, 'action-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('confirms once under a serialized action lock and returns the persisted result on retry', async () => {
    const { service, state, companies } = createService({ runStatus: 'completed', existingActions: [actionRow()] });
    companies.create.mockResolvedValue({ id: 55, name: 'Draft Co' });

    const [first, concurrentRetry] = await Promise.all([
      service.confirm(7, 'action-1'),
      service.confirm(7, 'action-1'),
    ]);

    expect(first).toEqual({ id: 'action-1', status: 'executed', result: { operation: 'created', kind: 'company', recordId: 55, recordLabel: 'Draft Co' } });
    expect(concurrentRetry).toEqual(first);
    expect(companies.create).toHaveBeenCalledTimes(1);
    expect(companies.create.mock.calls[0][1]).toBe(state.tx);
    expect(state.actions.get('call-1')).toMatchObject({ status: 'executed', result: { result: first.result } });
  });

  it('rolls the action back when the in-transaction CRM writer fails', async () => {
    const { service, state, companies } = createService({ runStatus: 'completed', existingActions: [actionRow()] });
    companies.create.mockRejectedValue(new Error('write failed'));

    await expect(service.confirm(7, 'action-1')).rejects.toThrow('write failed');
    expect(state.actions.get('call-1')).toMatchObject({ status: 'proposed' });
  });

  it('rolls the action status back if persisting executed fails after the CRM writer ran', async () => {
    const { service, state, companies } = createService({ runStatus: 'completed', existingActions: [actionRow()] });
    companies.create.mockResolvedValue({ id: 55, name: 'Draft Co' });
    state.tx.update.mockImplementationOnce(() => { throw new Error('action save failed'); });

    await expect(service.confirm(7, 'action-1')).rejects.toThrow('action save failed');
    expect(companies.create).toHaveBeenCalledTimes(1);
    expect(companies.create.mock.calls[0][1]).toBe(state.tx);
    expect(state.actions.get('call-1')).toMatchObject({ status: 'proposed' });
  });

  it('marks an expired proposal without calling CRM writers', async () => {
    const { service, state, companies } = createService({
      runStatus: 'completed',
      existingActions: [actionRow({ expiresAt: new Date(Date.now() - 1) })],
    });

    await expect(service.confirm(7, 'action-1')).resolves.toMatchObject({ status: 'expired' });
    expect(state.actions.get('call-1')).toMatchObject({ status: 'expired' });
    expect(companies.create).not.toHaveBeenCalled();
  });

  it('persists conflict when a snapshotted linked ID changed and checks permissions inside the transaction', async () => {
    const linkedAction = actionRow({
      toolName: 'propose_update_record',
      requiredPermissions: ['leads:read', 'leads:write', 'contacts:read', 'pipelines:read'],
      validatedPayload: { kind: 'lead', id: 9, patch: { name: 'Updated' } },
      beforeSnapshot: { contactIds: [22] },
    });
    const { service, state, leads } = createService({ runStatus: 'completed', existingActions: [linkedAction] });
    leads.findCopilotMutationRecord.mockResolvedValue([{ id: 9, name: 'Lead', pipelineId: 2, statusId: 4, contactIds: [23] }]);

    await expect(service.confirm(7, 'action-1')).resolves.toEqual({ id: 'action-1', status: 'conflict', result: { code: 'record_changed' } });
    expect(state.actions.get('call-1')).toMatchObject({ status: 'conflict' });
    expect(leads.update).not.toHaveBeenCalled();

    const { service: revoked, leads: revokedLeads } = createService({
      runStatus: 'completed', existingActions: [actionRow()], permissions: ['companies:read'],
    });
    await expect(revoked.confirm(7, 'action-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(revokedLeads.create).not.toHaveBeenCalled();
  });

  it('serializes reject against confirm so only one operation wins', async () => {
    const { service, companies } = createService({ runStatus: 'completed', existingActions: [actionRow()] });
    companies.create.mockResolvedValue({ id: 55, name: 'Draft Co' });
    const [confirmed, rejected] = await Promise.all([
      service.confirm(7, 'action-1'),
      service.reject(7, 'action-1'),
    ]);
    expect(confirmed.status).toBe('executed');
    expect(rejected.status).toBe('executed');
    expect(companies.create).toHaveBeenCalledTimes(1);

    const rejectedFirst = createService({ runStatus: 'completed', existingActions: [actionRow()] });
    await rejectedFirst.service.reject(7, 'action-1');
    await expect(rejectedFirst.service.confirm(7, 'action-1')).resolves.toMatchObject({ status: 'rejected' });
    expect(rejectedFirst.companies.create).not.toHaveBeenCalled();
  });
});
