import { CopilotContext } from './copilot.types';

const objectSchema = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
});

const nullable = (type: string, extra: Record<string, unknown> = {}) => ({
  anyOf: [{ type }, { type: 'null' }],
  ...extra,
});

const pageProperties = {
  cursor: nullable('string', { maxLength: 100 }),
  limit: nullable('integer', { minimum: 1, maximum: 20 }),
};

const definitions = {
  search_records: {
    description: 'Search CRM records by ordinary text.',
    parameters: objectSchema({
      kind: { type: 'string', enum: ['lead', 'company', 'contact'] },
      search: { type: 'string', minLength: 1, maxLength: 120 },
      ownerId: nullable('integer', { minimum: 1 }),
      ...pageProperties,
    }),
  },
  get_record: {
    description: 'Read one CRM record and currently permitted linked records.',
    parameters: objectSchema({
      kind: { type: 'string', enum: ['lead', 'company', 'contact', 'task'] },
      id: { type: 'integer', minimum: 1 },
    }),
  },
  get_record_activity: {
    description: 'Read a bounded page of activity for one CRM record.',
    parameters: objectSchema({
      kind: { type: 'string', enum: ['lead', 'company', 'contact'] },
      id: { type: 'integer', minimum: 1 },
      ...pageProperties,
    }),
  },
  list_tasks: {
    description: 'List tasks. If assigneeId is omitted, only the current user’s tasks are returned.',
    parameters: objectSchema({
      leadId: nullable('integer', { minimum: 1 }),
      assigneeId: nullable('integer', { minimum: 1 }),
      completion: nullable('string', { enum: ['open', 'completed', 'all'] }),
      dueStatus: nullable('string', { enum: ['overdue', 'upcoming', 'all'] }),
      dueFrom: nullable('string', { format: 'date-time' }),
      dueTo: nullable('string', { format: 'date-time' }),
      ...pageProperties,
    }),
  },
  get_analytics: {
    description: 'Read a bounded page of an approved CRM analytics report.',
    parameters: objectSchema({
      report: { type: 'string', enum: ['pipeline', 'team', 'tasks'] },
      days: nullable('integer', { enum: [7, 30, 90] }),
      cursor: nullable('string'),
      limit: nullable('integer', { minimum: 1, maximum: 20 }),
    }),
  },
  get_reference_data: {
    description: 'Read a bounded page of CRM reference data.',
    parameters: objectSchema({
      kind: { type: 'string', enum: ['pipelines', 'users', 'customFields'] },
      entityType: nullable('string', {
        enum: ['lead', 'company', 'contact'],
      }),
      cursor: nullable('string'),
      limit: nullable('integer', { minimum: 1, maximum: 20 }),
    }),
  },
};

export type CopilotReadToolName = keyof typeof definitions;

export type CopilotToolSource = {
  sourceId: string;
  kind: string;
  id: string | number;
  label: string;
};

export type CopilotToolState = {
  sources: Map<string, CopilotToolSource>;
  pages: Map<string, { cursors: Set<string>; count: number }>;
  requiredPermissions: Set<string>;
};

export type CopilotToolCallResult = {
  output: Record<string, unknown>;
  requiredPermissions: string[];
};

export function createCopilotToolState(): CopilotToolState {
  return {
    sources: new Map(),
    pages: new Map(),
    requiredPermissions: new Set(),
  };
}

export function copilotToolDefinitions(
  granted: string[],
): Record<string, unknown>[] {
  const has = (keys: string[]) => keys.every((key) => granted.includes(key));
  const allowedKinds: Record<string, string[]> = {
    lead: has(['leads:read']) ? ['lead'] : [],
    company: has(['companies:read']) ? ['company'] : [],
    contact: has(['contacts:read']) ? ['contact'] : [],
    task: has(['tasks:read']) ? ['task'] : [],
  };
  return (Object.entries(definitions) as [CopilotReadToolName, (typeof definitions)[CopilotReadToolName]][])
    .filter(([name]) => {
      if (name === 'search_records' || name === 'get_record') {
        return has(['leads:read']) || has(['companies:read']) || has(['contacts:read']) || (name === 'get_record' && has(['tasks:read']));
      }
      if (name === 'get_record_activity') {
        return has(['leads:read']) || has(['companies:read']) || has(['contacts:read']);
      }
      if (name === 'list_tasks') return has(['tasks:read']);
      if (name === 'get_analytics') return has(['analytics:read']);
      return has(['pipelines:read']) || has(['users:read']) || has(['custom-fields:read']);
    })
    .map(([name, schema]) => {
      const parameters = JSON.parse(JSON.stringify(schema.parameters)) as {
        properties: Record<string, Record<string, unknown>>;
      };
      const kindPermissions: Partial<Record<CopilotReadToolName, string[]>> = {
        search_records: [
          ...(has(['leads:read']) ? ['lead'] : []),
          ...(has(['companies:read']) ? ['company'] : []),
          ...(has(['contacts:read']) ? ['contact'] : []),
        ],
        get_record: Object.values(allowedKinds).flat(),
        get_record_activity: ['lead', 'company', 'contact'].filter((kind) => has([`${kind === 'lead' ? 'leads' : `${kind}s`}:read`])),
        get_reference_data: [
          ...(has(['pipelines:read']) ? ['pipelines'] : []),
          ...(has(['users:read']) ? ['users'] : []),
          ...(has(['custom-fields:read']) ? ['customFields'] : []),
        ],
      };
      if (kindPermissions[name]) parameters.properties.kind.enum = kindPermissions[name];
      if (name === 'get_analytics') {
        parameters.properties.report.enum = [
          ...(has(['pipelines:read']) ? ['pipeline'] : []),
          'team', 'tasks',
        ];
      }
      if (name === 'search_records' && !has(['users:read'])) {
        parameters.properties.ownerId = { type: 'null' };
      }
      if (name === 'list_tasks') {
        if (!has(['leads:read'])) parameters.properties.leadId = { type: 'null' };
        if (!has(['users:read'])) parameters.properties.assigneeId = { type: 'null' };
      }
      return {
        type: 'function',
        name,
        description: schema.description,
        strict: true,
        parameters,
      };
    });
}

export function parseCopilotToolArgs(
  name: string,
  raw: string,
): Record<string, unknown> | null {
  if (!(name in definitions)) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const args = value as Record<string, unknown>;
  const keys = Object.keys(args);
  const allowed = Object.keys(
    definitions[name as CopilotReadToolName].parameters.properties as object,
  );
  if (
    keys.length !== allowed.length ||
    keys.some((key) => !allowed.includes(key)) ||
    allowed.some((key) => !Object.prototype.hasOwnProperty.call(args, key))
  ) return null;
  if (name === 'search_records') {
    if (!['lead', 'company', 'contact'].includes(String(args.kind))) return null;
    if (typeof args.search !== 'string' || !args.search.trim() || args.search.length > 120) return null;
    if (!isNullablePositiveInt(args.ownerId)) return null;
    if (!validPage(args)) return null;
  } else if (name === 'get_record' || name === 'get_record_activity') {
    const kinds = name === 'get_record'
      ? ['lead', 'company', 'contact', 'task']
      : ['lead', 'company', 'contact'];
    if (!kinds.includes(String(args.kind)) || !isPositiveInt(args.id)) return null;
    if (name === 'get_record_activity' && !validPage(args)) return null;
  } else if (name === 'list_tasks') {
    if (!isNullablePositiveInt(args.leadId) || !isNullablePositiveInt(args.assigneeId)) return null;
    if (args.completion !== null && !['open', 'completed', 'all'].includes(String(args.completion))) return null;
    if (args.dueStatus !== null && !['overdue', 'upcoming', 'all'].includes(String(args.dueStatus))) return null;
    if (!isIsoDateOrNull(args.dueFrom) || !isIsoDateOrNull(args.dueTo) || !validPage(args)) return null;
  } else if (name === 'get_analytics') {
    if (!['pipeline', 'team', 'tasks'].includes(String(args.report))) return null;
    if (args.days !== null && (typeof args.days !== 'number' || ![7, 30, 90].includes(args.days))) return null;
    if (!validPage(args)) return null;
  } else {
    if (!['pipelines', 'users', 'customFields'].includes(String(args.kind))) return null;
    if (args.entityType !== null && !['lead', 'company', 'contact'].includes(String(args.entityType))) return null;
    if (!validPage(args)) return null;
  }
  return args;
}

export function normalizeCopilotContext(value: unknown): CopilotContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    !['lead', 'company', 'contact', 'task'].includes(String(candidate.kind)) ||
    !isPositiveInt(candidate.id)
  ) return null;
  return { kind: candidate.kind as CopilotContext['kind'], id: candidate.id as number };
}

function validPage(args: Record<string, unknown>) {
  return (
    (args.cursor === null || (typeof args.cursor === 'string' && args.cursor.length <= 100)) &&
    (args.limit === null || (Number.isInteger(args.limit) && Number(args.limit) >= 1 && Number(args.limit) <= 20))
  );
}

function isPositiveInt(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNullablePositiveInt(value: unknown) {
  return value === null || isPositiveInt(value);
}

function isIsoDateOrNull(value: unknown) {
  return value === null || (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}
