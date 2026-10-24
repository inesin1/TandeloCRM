import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PermissionsService } from '../access-control/permissions.service';
import { LeadsService } from '../leads/leads.service';
import { CompaniesService } from '../companies/companies.service';
import { ContactsService } from '../contacts/contacts.service';
import { TasksService } from '../tasks/tasks.service';
import { PipelinesService } from '../pipelines/pipelines.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { UsersService } from '../users/users.service';
import {
  CopilotReadToolName,
  CopilotToolCallResult,
  CopilotToolSource,
  CopilotToolState,
  copilotToolDefinitions,
  parseCopilotToolArgs,
} from './copilot-tools';
import { AnalyticsService } from '../analytics/analytics.service';

const MAX_PAGES_PER_SELECTION = 3;
const safeError = (code: string): CopilotToolCallResult => ({
  output: { error: code },
  requiredPermissions: [],
});

@Injectable()
export class CopilotToolsService {
  constructor(
    private readonly permissionsService: PermissionsService,
    private readonly analytics: AnalyticsService,
    private readonly leads: LeadsService,
    private readonly companies: CompaniesService,
    private readonly contacts: ContactsService,
    private readonly tasks: TasksService,
    private readonly pipelines: PipelinesService,
    private readonly customFields: CustomFieldsService,
    private readonly users: UsersService,
  ) {}

  async definitions(actorId: number) {
    return copilotToolDefinitions(
      await this.permissionsService.getEffectivePermissions(actorId),
    );
  }

  async execute(
    actorId: number,
    runId: string,
    state: CopilotToolState,
    name: string,
    rawArguments: string,
    now: Date,
  ): Promise<CopilotToolCallResult> {
    const args = parseCopilotToolArgs(name, rawArguments);
    if (!args) return safeError(name in TOOL_REQUIREMENTS ? 'invalid_arguments' : 'unsupported_tool');

    const required = TOOL_REQUIREMENTS[name as CopilotReadToolName](args);
    const granted = new Set(
      await this.permissionsService.getEffectivePermissions(actorId),
    );
    if (!required.every((permission) => granted.has(permission))) {
      return safeError('permission_revoked');
    }

    const paging = this.beginPage(name, args, state);
    if (paging.error) return safeError(paging.error);

    try {
      const output = await this.runTool(
        actorId,
        runId,
        state,
        name as CopilotReadToolName,
        args,
        paging,
        now,
        granted,
      );
      const used = this.permissionsUsedFor(name as CopilotReadToolName, args, granted);
      for (const key of used) state.requiredPermissions.add(key);
      return { output, requiredPermissions: used };
    } catch {
      return safeError('read_failed');
    }
  }

  selectedSources(state: CopilotToolState, sourceIds: unknown): CopilotToolSource[] | null {
    if (
      !Array.isArray(sourceIds) ||
      sourceIds.length > state.sources.size ||
      sourceIds.some((id) => typeof id !== 'string') ||
      new Set(sourceIds).size !== sourceIds.length
    ) return null;
    const selected: CopilotToolSource[] = [];
    for (const id of sourceIds as string[]) {
      const source = state.sources.get(id);
      if (!source) return null;
      selected.push(source);
    }
    return selected;
  }

  async permissionsStillGranted(actorId: number, required: string[]) {
    const granted = new Set(await this.permissionsService.getEffectivePermissions(actorId));
    return required.every((key) => granted.has(key));
  }

  private async runTool(
    actorId: number,
    runId: string,
    state: CopilotToolState,
    name: CopilotReadToolName,
    args: Record<string, unknown>,
    paging: { limit: number; cursor: string | null; offset: number },
    now: Date,
    granted: Set<string>,
  ): Promise<Record<string, unknown>> {
    switch (name) {
      case 'search_records':
        return this.searchRecords(state, args, paging, granted);
      case 'get_record':
        return this.getRecord(state, args, granted);
      case 'get_record_activity':
        return this.getActivity(state, args, paging, granted);
      case 'list_tasks':
        return this.listTasks(actorId, state, args, paging, granted, now);
      case 'get_analytics':
        return this.getAnalytics(state, args, paging, granted, now);
      case 'get_reference_data':
        return this.getReferenceData(state, args, paging, granted);
    }
  }

  private async searchRecords(
    state: CopilotToolState,
    args: Record<string, unknown>,
    page: { limit: number; cursor: string | null },
    granted: Set<string>,
  ) {
    const kind = args.kind as 'lead' | 'company' | 'contact';
    const search = escapeLike(String(args.search).trim());
    const cursorId = decodeIdCursor(page.cursor);
    let rows: Array<{ id: number; name: string; details?: Record<string, unknown>; pipelineId?: number; statusId?: number; industry?: string | null; position?: string | null; companyId?: number | null }>;
    if (kind === 'lead') {
      rows = await this.leads.findCopilotPage(search, args.ownerId as number | null, cursorId, page.limit + 1);
      rows = rows.map((row) => ({ ...row, details: { pipelineId: granted.has('pipelines:read') ? row.pipelineId : undefined, statusId: granted.has('pipelines:read') ? row.statusId : undefined } }));
    } else if (kind === 'company') {
      rows = await this.companies.findCopilotPage(search, args.ownerId as number | null, cursorId, page.limit + 1);
      rows = rows.map(({ id, name, industry }) => ({ id, name, details: { industry } }));
    } else {
      rows = await this.contacts.findCopilotPage(search, args.ownerId as number | null, cursorId, page.limit + 1);
      rows = rows.map(({ id, name, position, companyId }) => ({ id, name, details: { position, companyId: granted.has('companies:read') ? companyId : undefined } }));
    }
    const truncated = rows.length > page.limit;
    const records = rows.slice(0, page.limit).map((row) => ({
      ...this.withSource(state, kind, row.id, row.name),
      ...row.details,
    }));
    return {
      records,
      truncated,
      nextCursor: truncated ? encodeIdCursor(records[records.length - 1].id as number) : null,
    };
  }

  private async getRecord(
    state: CopilotToolState,
    args: Record<string, unknown>,
    granted: Set<string>,
  ): Promise<Record<string, unknown>> {
    const { kind, id } = args as { kind: string; id: number };
    if (kind === 'lead') {
      const [row] = await this.leads.findCopilotRecord(id);
      if (!row) return { record: null };
      const record: Record<string, unknown> = { id: row.id, name: row.name, price: row.price, source: row.source, createdAt: row.createdAt, updatedAt: row.updatedAt };
      if (granted.has('custom-fields:read')) record.customFields = row.customFields;
      if (granted.has('pipelines:read')) record.pipeline = await this.pipelines.findCopilotStatus(row.pipelineId, row.statusId).then((rows) => rows[0] ?? null);
      if (granted.has('companies:read') && row.companyId) record.company = await this.getLinkedCompany(row.companyId, state);
      if (granted.has('users:read') && row.ownerId) record.owner = await this.getUser(row.ownerId, state);
      if (granted.has('contacts:read')) {
        const contacts = await this.leads.findCopilotContacts(id, 21);
        record.contacts = contacts.slice(0, 20).map((contact) => ({
          ...this.withSource(state, 'contact', contact.id, contact.name),
          position: contact.position, email: contact.email, phone: contact.phone,
        }));
        record.contactsTruncated = contacts.length > 20;
      }
      return { record: { ...this.withSource(state, 'lead', row.id, row.name), ...record } };
    }
    if (kind === 'company') {
      const [row] = await this.companies.findCopilotRecord(id);
      if (!row) return { record: null };
      const record: Record<string, unknown> = { id: row.id, name: row.name, industry: row.industry, address: row.address, email: row.email, phone: row.phone, createdAt: row.createdAt, updatedAt: row.updatedAt };
      if (granted.has('custom-fields:read')) record.customFields = row.customFields;
      if (granted.has('users:read') && row.ownerId) record.owner = await this.getUser(row.ownerId, state);
      return { record: { ...this.withSource(state, 'company', row.id, row.name), ...record } };
    }
    if (kind === 'contact') {
      const [row] = await this.contacts.findCopilotRecord(id);
      if (!row) return { record: null };
      const record: Record<string, unknown> = { id: row.id, name: row.name, position: row.position, email: row.email, phone: row.phone, createdAt: row.createdAt, updatedAt: row.updatedAt };
      if (granted.has('custom-fields:read')) record.customFields = row.customFields;
      if (granted.has('companies:read') && row.companyId) record.company = await this.getLinkedCompany(row.companyId, state);
      if (granted.has('users:read') && row.ownerId) record.owner = await this.getUser(row.ownerId, state);
      return { record: { ...this.withSource(state, 'contact', row.id, row.name), ...record } };
    }
    const [row] = await this.tasks.findCopilotRecord(id);
    if (!row) return { record: null };
    const record: Record<string, unknown> = { id: row.id, type: row.type, text: row.text, dueAt: row.dueAt, isCompleted: row.isCompleted };
    if (granted.has('leads:read')) record.lead = await this.getLead(row.leadId, state, granted);
    if (granted.has('users:read') && row.assigneeId) record.assignee = await this.getUser(row.assigneeId, state);
    return { record: { ...this.withSource(state, 'task', row.id, `Task ${row.id}`), ...record } };
  }

  private async getActivity(state: CopilotToolState, args: Record<string, unknown>, page: { limit: number; cursor: string | null }, granted: Set<string>) {
    const { kind, id } = args as { kind: 'lead' | 'company' | 'contact'; id: number };
    const cursor = decodeIdCursor(page.cursor);
    let rows: Array<{ id: number; kind: string; body: string; createdAt: Date; authorId: number | null }>;
    if (kind === 'lead') {
      rows = await this.leads.findCopilotActivity(id, cursor, page.limit + 1);
    } else {
      const noteRows = kind === 'company'
        ? await this.companies.findCopilotActivity(id, cursor, page.limit + 1)
        : await this.contacts.findCopilotActivity(id, cursor, page.limit + 1);
      rows = noteRows.map((row) => ({ ...row, kind: 'note' }));
    }
    const truncated = rows.length > page.limit;
    const records = await Promise.all(rows.slice(0, page.limit).map(async (row) => ({
      ...this.withSource(state, `${kind}_activity`, row.id, `${kind} activity ${row.id}`),
      activityType: row.kind,
      body: row.body,
      createdAt: row.createdAt,
      ...(row.authorId && granted.has('users:read') ? { author: await this.getUser(row.authorId, state) } : {}),
    })));
    return { records, truncated, nextCursor: truncated ? encodeIdCursor(records[records.length - 1].id as number) : null };
  }

  private async listTasks(actorId: number, state: CopilotToolState, args: Record<string, unknown>, page: { limit: number; cursor: string | null }, granted: Set<string>, now: Date) {
    const cursor = decodeIdCursor(page.cursor);
    const assigneeId = args.assigneeId === null ? actorId : args.assigneeId as number;
    const completion = args.completion as string | null;
    const rows = await this.tasks.findCopilotPage({
      leadId: args.leadId as number | null,
      assigneeId,
      completion,
      dueStatus: args.dueStatus as string | null,
      dueFrom: args.dueFrom === null ? null : new Date(args.dueFrom as string),
      dueTo: args.dueTo === null ? null : new Date(args.dueTo as string),
    }, cursor, page.limit + 1, now);
    const truncated = rows.length > page.limit;
    const records = await Promise.all(rows.slice(0, page.limit).map(async (row) => {
      const task: Record<string, unknown> = {
        ...this.withSource(state, 'task', row.id, `Task ${row.id}`),
        type: row.type,
        text: row.text,
        dueAt: row.dueAt,
        isCompleted: row.isCompleted,
        dueState: row.isCompleted ? 'completed' : row.dueAt < now ? 'overdue' : 'upcoming',
      };
      if (granted.has('leads:read')) task.lead = await this.getLead(row.leadId, state, granted);
      if (granted.has('users:read') && row.assigneeId) task.assignee = await this.getUser(row.assigneeId, state);
      return task;
    }));
    return { records, truncated, nextCursor: truncated ? encodeIdCursor(records[records.length - 1].id as number) : null };
  }

  private async getAnalytics(state: CopilotToolState, args: Record<string, unknown>, page: { limit: number; offset: number }, granted: Set<string>, now: Date) {
    const report = args.report as 'pipeline' | 'team' | 'tasks';
    const days = args.days === null ? undefined : args.days as number;
    const result = await this.analytics.getCopilotReport(report, days, now, page.offset, page.limit, granted.has('users:read'));
    const rows = (result.records as Array<Record<string, unknown>>).slice(0, page.limit);
    const truncated = result.hasMore;
    const records = rows.map((row, index) => ({
      ...this.withSource(state, `analytics_${report}`, String(row.id ?? `${report}:${page.offset + index}`), String(row.label ?? `${report} report`)),
      ...row,
    }));
    const summary = 'summary' in result && result.summary
      ? {
          ...this.withSource(state, `analytics_${report}`, `${report}:summary`, `${report} summary`),
          ...result.summary,
        }
      : undefined;
    return { report, ...(summary ? { summary } : {}), records, truncated, nextCursor: truncated ? encodeOffsetCursor(page.offset + page.limit) : null };
  }

  private async getReferenceData(state: CopilotToolState, args: Record<string, unknown>, page: { limit: number; cursor: string | null }, granted: Set<string>) {
    const kind = args.kind as string;
    const cursor = decodeIdCursor(page.cursor);
    let rows: Array<Record<string, unknown>>;
    if (kind === 'pipelines') {
      rows = await this.pipelines.findCopilotReferencePage(cursor, page.limit + 1);
    } else if (kind === 'users') {
      rows = await this.users.findCopilotReferencePage(cursor, page.limit + 1);
    } else {
      rows = await this.customFields.findCopilotReferencePage(args.entityType as 'lead' | 'company' | 'contact' | null, cursor, page.limit + 1);
    }
    const truncated = rows.length > page.limit;
    const records = rows.slice(0, page.limit).map((row) => {
      const source = this.withSource(state, kind, row.id as number, String(row.name ?? row.label ?? row.key ?? `Reference ${row.id}`));
      return kind === 'users'
        ? { ...source, name: row.name }
        : { ...source, ...row };
    });
    return { records, truncated, nextCursor: truncated ? encodeIdCursor(records[records.length - 1].id as number) : null };
  }

  private async getLinkedCompany(id: number, state: CopilotToolState) {
    const [row] = await this.companies.findCopilotLinkedRecord(id);
    return row ? this.withSource(state, 'company', row.id, row.name) : null;
  }

  private async getUser(id: number, state: CopilotToolState) {
    const [row] = await this.users.findCopilotRecord(id);
    return row ? this.withSource(state, 'user', row.id, row.name) : null;
  }

  private async getLead(id: number, state: CopilotToolState, granted: Set<string>) {
    const [row] = await this.leads.findCopilotLinkedRecord(id);
    return row ? { ...this.withSource(state, 'lead', row.id, row.name), ...(granted.has('pipelines:read') ? { pipeline: await this.pipelines.findCopilotStatus(row.pipelineId, row.statusId).then((rows) => rows[0] ?? null) } : {}) } : null;
  }

  private withSource(state: CopilotToolState, kind: string, id: string | number, label: string) {
    const sourceId = randomUUID();
    const source = { sourceId, kind, id, label };
    state.sources.set(sourceId, source);
    return { sourceId, id, kind, label };
  }

  private beginPage(name: string, args: Record<string, unknown>, state: CopilotToolState) {
    const cursorValue = args.cursor;
    const cursor = typeof cursorValue === 'string' ? cursorValue : null;
    const keyArgs = { ...args };
    delete keyArgs.cursor;
    delete keyArgs.limit;
    const key = `${name}:${JSON.stringify(Object.fromEntries(Object.entries(keyArgs).sort(([a], [b]) => a.localeCompare(b))))}`;
    const pageState = state.pages.get(key) ?? { cursors: new Set<string>(), count: 0 };
    const cursorKey = cursor ?? '<first>';
    if (pageState.cursors.has(cursorKey) || pageState.count >= MAX_PAGES_PER_SELECTION) {
      return { error: 'page_limit' } as const;
    }
    pageState.cursors.add(cursorKey);
    pageState.count += 1;
    state.pages.set(key, pageState);
    const isAnalytics = name === 'get_analytics';
    const limit = typeof args.limit === 'number' ? args.limit : 10;
    const offset = isAnalytics && cursor ? decodeOffsetCursor(cursor) : 0;
    if (isAnalytics && cursor && offset < 0) return { error: 'invalid_cursor' } as const;
    if (cursor && !isAnalytics && decodeIdCursor(cursor) === null) return { error: 'invalid_cursor' } as const;
    return { limit, cursor, offset };
  }

  private permissionsUsedFor(name: CopilotReadToolName, args: Record<string, unknown>, granted: Set<string>) {
    const required = TOOL_REQUIREMENTS[name](args);
    let optional: string[] = [];
    if (name === 'get_record') {
      const byKind: Record<string, string[]> = {
        lead: ['custom-fields:read', 'pipelines:read', 'companies:read', 'contacts:read', 'users:read'],
        company: ['custom-fields:read', 'users:read'],
        contact: ['custom-fields:read', 'companies:read', 'users:read'],
        task: ['leads:read', 'users:read', 'pipelines:read'],
      };
      optional = byKind[String(args.kind)];
    } else if (name === 'search_records') {
      optional = args.kind === 'lead' ? ['pipelines:read'] : args.kind === 'contact' ? ['companies:read'] : [];
    } else if (name === 'list_tasks') {
      optional = ['leads:read', 'users:read', 'pipelines:read'];
    } else if (name === 'get_record_activity') {
      optional = ['users:read'];
    } else if (name === 'get_analytics' && args.report === 'team') {
      optional = ['users:read'];
    }
    optional = optional.filter((key) => granted.has(key));
    return [...new Set([...required, ...optional])];
  }

}

const TOOL_REQUIREMENTS: Record<CopilotReadToolName, (args: Record<string, unknown>) => string[]> = {
  search_records: (args) => [
    `${RESOURCE_FOR_KIND[String(args.kind)]}:read`,
    ...(args.ownerId === null ? [] : ['users:read']),
  ],
  get_record: (args) => [`${RESOURCE_FOR_KIND[String(args.kind)]}:read`],
  get_record_activity: (args) => [`${RESOURCE_FOR_KIND[String(args.kind)]}:read`],
  list_tasks: (args) => [
    'tasks:read',
    ...(args.leadId === null ? [] : ['leads:read']),
    ...(args.assigneeId === null ? [] : ['users:read']),
  ],
  get_analytics: (args) => [
    'analytics:read',
    ...(args.report === 'pipeline' ? ['pipelines:read'] : []),
  ],
  get_reference_data: (args) => [
    args.kind === 'pipelines' ? 'pipelines:read' : args.kind === 'users' ? 'users:read' : 'custom-fields:read',
  ],
};

const RESOURCE_FOR_KIND: Record<string, string> = {
  lead: 'leads',
  company: 'companies',
  contact: 'contacts',
  task: 'tasks',
};

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, '\\$&');
}

function encodeIdCursor(id: number) {
  return Buffer.from(String(id)).toString('base64url');
}

function decodeIdCursor(cursor: string | null) {
  if (!cursor) return null;
  const value = Buffer.from(cursor, 'base64url').toString('utf8');
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function encodeOffsetCursor(offset: number) {
  return Buffer.from(`offset:${offset}`).toString('base64url');
}

function decodeOffsetCursor(cursor: string) {
  const value = Buffer.from(cursor, 'base64url').toString('utf8');
  const match = /^offset:(\d+)$/.exec(value);
  if (!match) return -1;
  const offset = Number(match[1]);
  return Number.isSafeInteger(offset) && offset <= 40 ? offset : -1;
}
